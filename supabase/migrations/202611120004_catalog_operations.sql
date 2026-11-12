-- Catalog search and authorized catalog writes.
begin;

create or replace function public.search_catalog_products(
  p_branch_id uuid,
  p_query text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  product_id uuid,
  variant_id uuid,
  product_name text,
  sku text,
  barcode text,
  category text,
  brand text,
  variant text,
  size_specification text,
  unit text,
  unit_decimal_places smallint,
  cost_price numeric,
  marked_price numeric,
  default_selling_price numeric,
  quantity numeric,
  reorder_level numeric,
  is_active boolean
)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_terms text[] := regexp_split_to_array(lower(trim(coalesce(p_query,''))), '\s+');
begin
  if auth.uid() is null or not public.has_any_role(array['admin','inventory_manager']::public.employee_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized to search catalog operations';
  end if;
  if not public.can_access_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if p_limit < 1 or p_limit > 100 or p_offset < 0 or p_offset > 100000 then
    raise exception using errcode = '22023', message = 'Invalid catalog pagination';
  end if;
  return query
  select p.id, pv.id, p.name, pv.sku, pv.barcode, c.name, b.name,
         concat_ws(' ',pv.variant_label,pv.size_specification), pv.size_specification, u.symbol, u.decimal_places,
         pp.cost_price, pp.marked_price, pp.default_selling_price,
         coalesce(bi.quantity,0), coalesce(bi.reorder_level,0), (p.is_active and pv.is_active)
  from public.product_variants pv
  join public.products p on p.id=pv.product_id
  join public.product_prices pp on pp.variant_id=pv.id
  join public.units u on u.id=pv.unit_id
  left join public.categories c on c.id=p.category_id
  left join public.brands b on b.id=p.brand_id
  left join public.branch_inventory bi on bi.variant_id=pv.id and bi.branch_id=p_branch_id
  where (trim(coalesce(p_query,'')) = '' or not exists (
    select 1 from unnest(v_terms) term
    where not (
      p.name ilike '%'||term||'%' or (p.description is not null and p.description ilike '%'||term||'%')
      or pv.sku ilike '%'||term||'%' or (pv.barcode is not null and pv.barcode ilike '%'||term||'%')
      or (c.name is not null and c.name ilike '%'||term||'%') or (b.name is not null and b.name ilike '%'||term||'%')
      or (p.subcategory_name is not null and p.subcategory_name ilike '%'||term||'%')
      or (pv.variant_label is not null and pv.variant_label ilike '%'||term||'%')
      or (pv.size_specification is not null and pv.size_specification ilike '%'||term||'%')
      or u.name ilike '%'||term||'%'
    )
  ))
  order by p.name, pv.sku
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.search_catalog_products(uuid,text,integer,integer) from public;
grant execute on function public.search_catalog_products(uuid,text,integer,integer) to authenticated;

create or replace function public.save_product(
  p_branch_id uuid,
  p_product jsonb,
  p_variant jsonb,
  p_prices jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_product_id uuid := nullif(p_product->>'id','')::uuid;
  v_variant_id uuid := nullif(p_variant->>'id','')::uuid;
  v_name text := nullif(trim(p_product->>'name'),'');
  v_sku text := nullif(trim(p_variant->>'sku'),'');
  v_unit uuid := nullif(p_variant->>'unit_id','')::uuid;
  v_before_product jsonb;
  v_before_variant jsonb;
  v_before_price jsonb;
  v_after jsonb;
  v_old_cost numeric(14,2);
  v_old_marked numeric(14,2);
  v_old_sell numeric(14,2);
  v_cost numeric(14,2) := (p_prices->>'cost_price')::numeric;
  v_marked numeric(14,2) := (p_prices->>'marked_price')::numeric;
  v_sell numeric(14,2) := (p_prices->>'default_selling_price')::numeric;
  v_reorder numeric(14,6) := coalesce((p_variant->>'reorder_level')::numeric,0);
  v_unit_decimals smallint;
begin
  if v_actor is null or not public.has_any_role(array['admin','inventory_manager']::public.employee_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized to manage products';
  end if;
  if not public.can_access_branch(p_branch_id) then raise exception using errcode = '42501', message = 'Branch access denied'; end if;
  if v_name is null or v_sku is null or v_unit is null or v_cost is null or v_marked is null or v_sell is null then
    raise exception using errcode = '22023', message = 'Product name, SKU, unit, and all three prices are required';
  end if;
  if v_cost < 0 or v_marked < 0 or v_sell < 0 or v_reorder < 0 then
    raise exception using errcode = '22023', message = 'Prices and reorder level cannot be negative';
  end if;
  select decimal_places into v_unit_decimals from public.units where id=v_unit and is_active;
  if not found then
    raise exception using errcode = '22023', message = 'Select an active unit';
  end if;
  if round(v_reorder,v_unit_decimals) <> v_reorder then
    raise exception using errcode = '22023', message = 'Reorder level exceeds the precision configured for this unit';
  end if;

  if v_product_id is null then
    v_product_id := gen_random_uuid();
    insert into public.products(id,name,description,category_id,subcategory_name,brand_id,supplier_id,is_active,created_by,updated_by)
    values (v_product_id,v_name,nullif(trim(p_product->>'description'),''),nullif(p_product->>'category_id','')::uuid,
      nullif(trim(p_product->>'subcategory_name'),''),nullif(p_product->>'brand_id','')::uuid,
      nullif(p_product->>'supplier_id','')::uuid,coalesce((p_product->>'is_active')::boolean,true),v_actor,v_actor);
    v_before_product := null;
  else
    select to_jsonb(p) into v_before_product from public.products p where p.id=v_product_id for update;
    if not found then raise exception using errcode = '22023', message = 'Product was not found'; end if;
    update public.products set name=v_name,description=nullif(trim(p_product->>'description'),''),
      category_id=nullif(p_product->>'category_id','')::uuid,subcategory_name=nullif(trim(p_product->>'subcategory_name'),''),
      brand_id=nullif(p_product->>'brand_id','')::uuid,supplier_id=nullif(p_product->>'supplier_id','')::uuid,
      is_active=coalesce((p_product->>'is_active')::boolean,true),updated_at=now(),updated_by=v_actor
      where id=v_product_id;
  end if;

  if v_variant_id is null then
    v_variant_id := gen_random_uuid();
    insert into public.product_variants(id,product_id,sku,barcode,variant_label,size_specification,unit_id,rack_location,tax_rate,is_active)
    values (v_variant_id,v_product_id,v_sku,nullif(trim(p_variant->>'barcode'),''),nullif(trim(p_variant->>'variant_label'),''),
      nullif(trim(p_variant->>'size_specification'),''),v_unit,nullif(trim(p_variant->>'rack_location'),''),
      coalesce((p_variant->>'tax_rate')::numeric,0),coalesce((p_product->>'is_active')::boolean,true));
    v_before_variant := null;
  else
    select to_jsonb(pv) into v_before_variant from public.product_variants pv where pv.id=v_variant_id and pv.product_id=v_product_id for update;
    if not found then raise exception using errcode = '22023', message = 'Product variant was not found'; end if;
    update public.product_variants set sku=v_sku,barcode=nullif(trim(p_variant->>'barcode'),''),
      variant_label=nullif(trim(p_variant->>'variant_label'),''),size_specification=nullif(trim(p_variant->>'size_specification'),''),
      unit_id=v_unit,rack_location=nullif(trim(p_variant->>'rack_location'),''),tax_rate=coalesce((p_variant->>'tax_rate')::numeric,0),
      is_active=coalesce((p_product->>'is_active')::boolean,true),updated_at=now() where id=v_variant_id;
  end if;

  insert into public.branch_inventory(branch_id,variant_id,reorder_level)
    select b.id,v_variant_id,case when b.id=p_branch_id then v_reorder else 0 end from public.branches b where b.is_active
    on conflict (branch_id,variant_id) do update set reorder_level=case when branch_inventory.branch_id=p_branch_id then v_reorder else branch_inventory.reorder_level end;

  select cost_price,marked_price,default_selling_price,to_jsonb(pp)
    into v_old_cost,v_old_marked,v_old_sell,v_before_price
    from public.product_prices pp where pp.variant_id=v_variant_id for update;
  insert into public.product_prices(variant_id,cost_price,marked_price,default_selling_price,updated_at,updated_by)
    values(v_variant_id,v_cost,v_marked,v_sell,now(),v_actor)
  on conflict(variant_id) do update set cost_price=excluded.cost_price,marked_price=excluded.marked_price,
    default_selling_price=excluded.default_selling_price,updated_at=now(),updated_by=v_actor;

  if v_before_price is null or (v_old_cost,v_old_marked,v_old_sell) is distinct from (v_cost,v_marked,v_sell) then
    insert into public.product_price_history(variant_id,cost_price,marked_price,default_selling_price,changed_by,reason)
      values(v_variant_id,v_cost,v_marked,v_sell,v_actor,nullif(trim(p_reason),''));
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,branch_id,before_data,after_data,reason)
      values(v_actor,'master_price_changed','product_variant',v_variant_id,p_branch_id,v_before_price,
        jsonb_build_object('cost_price',v_cost,'marked_price',v_marked,'default_selling_price',v_sell),nullif(trim(p_reason),''));
  end if;
  v_after := jsonb_build_object('product_id',v_product_id,'variant_id',v_variant_id,'sku',v_sku);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,branch_id,before_data,after_data,reason)
    values(v_actor,case when v_before_product is null then 'product_created' else 'product_updated' end,
      'product',v_product_id,p_branch_id,v_before_product,v_after,nullif(trim(p_reason),''));
  return v_after;
end;
$$;
revoke all on function public.save_product(uuid,jsonb,jsonb,jsonb,text) from public;
grant execute on function public.save_product(uuid,jsonb,jsonb,jsonb,text) to authenticated;

create or replace function public.save_category(p_id uuid,p_name text,p_parent_id uuid,p_is_active boolean default true)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid := coalesce(p_id,gen_random_uuid());
  v_before jsonb;
begin
  if v_actor is null or not public.has_any_role(array['admin','inventory_manager']::public.employee_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized to manage categories';
  end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name)) > 120 or p_parent_id = p_id then
    raise exception using errcode = '22023', message = 'Category name or parent is invalid';
  end if;
  if p_id is not null and p_parent_id is not null and exists (
    with recursive descendants(id) as (
      select c.id from public.categories c where c.parent_id=p_id
      union all
      select c.id from public.categories c join descendants d on c.parent_id=d.id
    ) select 1 from descendants where id=p_parent_id
  ) then
    raise exception using errcode = '22023', message = 'A category cannot be placed beneath one of its children';
  end if;
  if p_id is not null then
    select to_jsonb(c) into v_before from public.categories c where c.id=p_id for update;
    if not found then raise exception using errcode = '22023', message = 'Category was not found'; end if;
  end if;
  insert into public.categories(id,name,parent_id,is_active)
    values(v_id,trim(p_name),p_parent_id,coalesce(p_is_active,true))
  on conflict(id) do update set name=excluded.name,parent_id=excluded.parent_id,is_active=excluded.is_active;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
    values(v_actor,case when v_before is null then 'category_created' else 'category_updated' end,
      'category',v_id,v_before,jsonb_build_object('name',trim(p_name),'parent_id',p_parent_id,'is_active',p_is_active));
  return v_id;
end;
$$;
revoke all on function public.save_category(uuid,text,uuid,boolean) from public;
grant execute on function public.save_category(uuid,text,uuid,boolean) to authenticated;

commit;

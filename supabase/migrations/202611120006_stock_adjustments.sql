-- Ledger-backed opening balances and authorized stock adjustments.
begin;

create trigger stock_adjustment_items_immutable
  before update or delete on public.stock_adjustment_items
  for each row execute function public.prevent_ledger_mutation();

create or replace function public.post_stock_adjustment(
  p_branch_id uuid,
  p_reason text,
  p_movement_type public.inventory_movement_type,
  p_items jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_hash text := encode(extensions.digest(convert_to(jsonb_build_object(
    'branch_id',p_branch_id,'reason',trim(coalesce(p_reason,'')),'movement_type',p_movement_type,'items',p_items
  )::text,'UTF8'),'sha256'),'hex');
  v_idem uuid;
  v_saved_hash text;
  v_saved_response jsonb;
  v_adjustment uuid := gen_random_uuid();
  v_item jsonb;
  v_variant uuid;
  v_delta numeric(14,6);
  v_unit_cost numeric(14,4);
  v_master_cost numeric(14,2);
  v_old_quantity numeric(14,6);
  v_old_wac numeric(14,4);
  v_new_quantity numeric(14,6);
  v_new_wac numeric(14,4);
  v_unit_decimals smallint;
begin
  if v_actor is null or not public.has_any_role(array['admin','inventory_manager']::public.employee_role[]) then
    raise exception using errcode='42501',message='Not authorized to post stock adjustments';
  end if;
  if not public.can_access_branch(p_branch_id) then raise exception using errcode='42501',message='Branch access denied'; end if;
  if p_movement_type not in ('opening','adjustment','damage','loss') then
    raise exception using errcode='22023',message='Unsupported stock adjustment type';
  end if;
  if nullif(trim(p_reason),'') is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or p_idempotency_key is null then
    raise exception using errcode='22023',message='Reason, items, and an idempotency key are required';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as i(variant_id uuid,quantity_delta numeric,unit_cost numeric)
    where i.variant_id is null or i.quantity_delta is null or i.quantity_delta=0 or abs(i.quantity_delta)>100000000
      or (i.unit_cost is not null and i.unit_cost<0)
      or (p_movement_type='opening' and i.quantity_delta<0)
      or (p_movement_type in ('damage','loss') and i.quantity_delta>0)
  ) then raise exception using errcode='22023',message='Stock adjustment line is invalid'; end if;
  if (select count(*) from jsonb_to_recordset(p_items) as i(variant_id uuid)) <>
     (select count(distinct i.variant_id) from jsonb_to_recordset(p_items) as i(variant_id uuid)) then
    raise exception using errcode='22023',message='Duplicate variant lines are not allowed';
  end if;

  insert into public.idempotency_records(actor_id,idempotency_key,operation,request_hash)
    values(v_actor,p_idempotency_key,'post_stock_adjustment',v_hash)
    on conflict(actor_id,operation,idempotency_key) do nothing;
  select id,request_hash,response into v_idem,v_saved_hash,v_saved_response
    from public.idempotency_records where actor_id=v_actor and operation='post_stock_adjustment' and idempotency_key=p_idempotency_key for update;
  if v_saved_hash<>v_hash then raise exception using errcode='22023',message='Adjustment key was already used for a different request'; end if;
  if v_saved_response is not null then return v_saved_response; end if;

  perform 1 from public.branch_inventory bi
    join jsonb_to_recordset(p_items) as i(variant_id uuid) on i.variant_id=bi.variant_id
    where bi.branch_id=p_branch_id order by bi.variant_id for update of bi;

  insert into public.stock_adjustments(id,branch_id,status,reason,created_by)
    values(v_adjustment,p_branch_id,'posted',trim(p_reason),v_actor);
  for v_item in select value from jsonb_array_elements(p_items) order by (value->>'variant_id')::uuid loop
    v_variant := (v_item->>'variant_id')::uuid;
    v_delta := (v_item->>'quantity_delta')::numeric;
    v_unit_cost := nullif(v_item->>'unit_cost','')::numeric;
    select bi.quantity,bi.weighted_average_cost,u.decimal_places,pp.cost_price
      into v_old_quantity,v_old_wac,v_unit_decimals,v_master_cost
      from public.branch_inventory bi
      join public.product_variants pv on pv.id=bi.variant_id and pv.is_active
      join public.products p on p.id=pv.product_id and p.is_active
      join public.units u on u.id=pv.unit_id
      join public.product_prices pp on pp.variant_id=pv.id
      where bi.branch_id=p_branch_id and bi.variant_id=v_variant for update of bi;
    if not found then raise exception using errcode='22023',message='An active product inventory balance was not found'; end if;
    if round(v_delta,v_unit_decimals)<>v_delta then
      raise exception using errcode='22023',message='Quantity exceeds the precision configured for this unit';
    end if;
    if p_movement_type='opening' and exists(
      select 1 from public.inventory_movements m where m.branch_id=p_branch_id and m.variant_id=v_variant
    ) then raise exception using errcode='P0001',message='Opening stock is already recorded for this variant'; end if;
    v_new_quantity := v_old_quantity+v_delta;
    if v_new_quantity<0 then raise exception using errcode='P0001',message='Stock adjustment would make inventory negative'; end if;
    v_unit_cost := coalesce(v_unit_cost,nullif(v_old_wac,0),v_master_cost);
    if v_delta>0 and v_new_quantity>0 then
      v_new_wac := round((v_old_quantity*v_old_wac+v_delta*v_unit_cost)/v_new_quantity,4);
    else
      v_new_wac := v_old_wac;
    end if;

    insert into public.stock_adjustment_items(adjustment_id,variant_id,quantity_delta,unit_cost)
      values(v_adjustment,v_variant,v_delta,v_unit_cost);
    update public.branch_inventory set quantity=v_new_quantity,weighted_average_cost=v_new_wac,updated_at=now()
      where branch_id=p_branch_id and variant_id=v_variant;
    insert into public.inventory_movements(branch_id,variant_id,quantity_delta,movement_type,reference_type,reference_id,unit_cost,reason,actor_id)
      values(p_branch_id,v_variant,v_delta,p_movement_type,'stock_adjustment',v_adjustment,v_unit_cost,trim(p_reason),v_actor);
  end loop;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,branch_id,after_data,reason)
    values(v_actor,case when p_movement_type='opening' then 'opening_stock_posted' else 'stock_adjustment_posted' end,
      'stock_adjustment',v_adjustment,p_branch_id,jsonb_build_object('movement_type',p_movement_type,'lines',jsonb_array_length(p_items)),trim(p_reason));
  v_saved_response := jsonb_build_object('adjustment_id',v_adjustment,'movement_type',p_movement_type,'line_count',jsonb_array_length(p_items));
  update public.idempotency_records set response=v_saved_response where id=v_idem;
  return v_saved_response;
end;
$$;
revoke all on function public.post_stock_adjustment(uuid,text,public.inventory_movement_type,jsonb,uuid) from public;
grant execute on function public.post_stock_adjustment(uuid,text,public.inventory_movement_type,jsonb,uuid) to authenticated;

commit;

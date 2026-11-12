-- Cashier-safe catalog projection and atomic POS checkout.
begin;

create or replace function public.search_pos_products(
  p_branch_id uuid,
  p_query text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  variant_id uuid,
  product_name text,
  sku text,
  barcode text,
  brand text,
  category text,
  subcategory text,
  variant_label text,
  size_specification text,
  unit text,
  unit_decimal_places smallint,
  default_selling_price numeric,
  available_quantity numeric
)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_terms text[];
begin
  if auth.uid() is null or not public.has_any_role(array['admin','cashier']::public.employee_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized to search POS products';
  end if;
  if not public.can_access_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if p_limit < 1 or p_limit > 50 or p_offset < 0 or p_offset > 10000 then
    raise exception using errcode = '22023', message = 'Invalid search pagination';
  end if;
  v_terms := regexp_split_to_array(lower(trim(coalesce(p_query, ''))), '\s+');
  if trim(coalesce(p_query, '')) = '' then return; end if;

  return query
  select pv.id,
         p.name,
         pv.sku,
         pv.barcode,
         b.name,
         c.name,
         p.subcategory_name,
         pv.variant_label,
         pv.size_specification,
         u.symbol,
         u.decimal_places,
         pp.default_selling_price,
         coalesce(bi.quantity, 0)
  from public.product_variants pv
  join public.products p on p.id = pv.product_id and p.is_active
  join public.units u on u.id = pv.unit_id
  join public.product_prices pp on pp.variant_id = pv.id
  left join public.brands b on b.id = p.brand_id
  left join public.categories c on c.id = p.category_id
  left join public.branch_inventory bi on bi.variant_id = pv.id and bi.branch_id = p_branch_id
  where pv.is_active
    and not exists (
      select 1 from unnest(v_terms) term
      where not (
        p.name ilike '%' || term || '%' or (p.description is not null and p.description ilike '%' || term || '%')
        or pv.sku ilike '%' || term || '%' or (pv.barcode is not null and pv.barcode ilike '%' || term || '%')
        or (b.name is not null and b.name ilike '%' || term || '%') or (c.name is not null and c.name ilike '%' || term || '%')
        or (p.subcategory_name is not null and p.subcategory_name ilike '%' || term || '%')
        or (pv.variant_label is not null and pv.variant_label ilike '%' || term || '%')
        or (pv.size_specification is not null and pv.size_specification ilike '%' || term || '%')
        or u.name ilike '%' || term || '%'
      )
    )
  order by (pv.barcode = trim(p_query)) desc nulls last,
           extensions.similarity(p.name, p_query) desc,
           p.name, pv.sku
  limit p_limit offset p_offset;
end;
$$;
revoke all on function public.search_pos_products(uuid, text, integer, integer) from public;
grant execute on function public.search_pos_products(uuid, text, integer, integer) to authenticated;

create or replace function public.search_pos_customers(p_query text, p_limit integer default 20)
returns table (
  customer_id uuid,
  display_name text,
  phone text,
  credit_eligible boolean,
  credit_limit numeric,
  outstanding_balance numeric,
  available_credit numeric
)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  v_terms text[] := regexp_split_to_array(lower(trim(coalesce(p_query,''))), '\s+');
begin
  if auth.uid() is null or not public.has_any_role(array['admin','cashier']::public.employee_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized to search POS customers';
  end if;
  if p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'Invalid customer search limit';
  end if;
  if trim(coalesce(p_query,'')) = '' then return; end if;

  return query
  select c.id, c.display_name, c.phone, c.credit_eligible, c.credit_limit,
         greatest(coalesce(l.balance,0),0),
         greatest(c.credit_limit-greatest(coalesce(l.balance,0),0),0)
  from public.customers c
  left join lateral (
    select sum(cl.debit-cl.credit) as balance from public.customer_ledger cl where cl.customer_id = c.id
  ) l on true
  where c.is_active and not c.is_walk_in
    and not exists (
      select 1 from unnest(v_terms) term
      where not (c.display_name ilike '%' || term || '%' or (c.phone is not null and c.phone ilike '%' || term || '%'))
    )
  order by c.display_name
  limit p_limit;
end;
$$;
revoke all on function public.search_pos_customers(text, integer) from public;
grant execute on function public.search_pos_customers(text, integer) to authenticated;

create or replace function public.checkout_sale(p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_branch uuid := (p_payload->>'branch_id')::uuid;
  v_customer uuid := nullif(p_payload->>'customer_id', '')::uuid;
  v_key uuid := (p_payload->>'idempotency_key')::uuid;
  v_hash text := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  v_idempotency_id uuid;
  v_saved_hash text;
  v_saved_response jsonb;
  v_invoice bigint;
  v_invoice_number text;
  v_sale uuid := gen_random_uuid();
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_tender numeric(14,2) := 0;
  v_paid numeric(14,2) := 0;
  v_change numeric(14,2) := 0;
  v_credit numeric(14,2) := 0;
  v_remaining numeric(14,2) := 0;
  v_cash_tender numeric(14,2) := 0;
  v_non_cash_tender numeric(14,2) := 0;
  v_payment jsonb;
  v_method public.payment_method;
  v_amount numeric(14,2);
  v_applied numeric(14,2);
  v_payment_id uuid;
  v_allow_credit boolean := coalesce((p_payload->>'allow_credit')::boolean, false);
  v_credit_override text := nullif(trim(p_payload->>'credit_limit_override_reason'), '');
  v_min_margin numeric(7,4) := 0;
  v_max_discount numeric(7,4) := 0;
  v_tax_enabled boolean := false;
  v_customer_credit_eligible boolean := false;
  v_customer_limit numeric(14,2) := 0;
  v_customer_balance numeric(14,2) := 0;
  v_customer_name text := 'Walk-in customer';
  v_customer_phone text;
  v_customer_address text;
  v_cashier_name text;
  v_item jsonb;
  v_variant uuid;
  v_qty numeric(14,6);
  v_price numeric(14,2);
  v_default_price numeric(14,2);
  v_cost numeric(14,4);
  v_stock numeric(14,6);
  v_name text;
  v_sku text;
  v_variant_snapshot text;
  v_unit text;
  v_reason text;
  v_line_subtotal numeric(14,2);
  v_line_discount numeric(14,2);
  v_line_tax numeric(14,2);
  v_tax_rate numeric(7,4);
  v_unit_decimals smallint;
  v_line_total numeric(14,2);
begin
  if v_actor is null or not public.has_any_role(array['admin','cashier']::public.employee_role[]) then
    raise exception using errcode = '42501', message = 'Not authorized to complete sales';
  end if;
  if v_branch is null or not public.can_access_branch(v_branch) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  select display_name into v_cashier_name from public.profiles where id = v_actor and is_active;
  if not found then raise exception using errcode = '42501', message = 'Employee account is inactive'; end if;
  if v_key is null or jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') = 0 then
    raise exception using errcode = '22023', message = 'A checkout key and at least one item are required';
  end if;
  if jsonb_typeof(p_payload->'payments') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Payments must be an array';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_payload->'items') as i(variant_id uuid, quantity numeric, unit_price numeric)
    where i.variant_id is null or i.quantity is null or i.quantity <= 0 or i.quantity > 1000000
       or i.unit_price is null or i.unit_price < 0
  ) then
    raise exception using errcode = '22023', message = 'Invalid item quantity or price';
  end if;
  if (select count(*) from jsonb_to_recordset(p_payload->'items') as i(variant_id uuid)) <>
     (select count(distinct i.variant_id) from jsonb_to_recordset(p_payload->'items') as i(variant_id uuid)) then
    raise exception using errcode = '22023', message = 'Duplicate product lines are not allowed';
  end if;

  insert into public.idempotency_records(actor_id, idempotency_key, operation, request_hash)
  values (v_actor, v_key, 'checkout_sale', v_hash)
  on conflict (actor_id, operation, idempotency_key) do nothing;
  select id, request_hash, response into v_idempotency_id, v_saved_hash, v_saved_response
    from public.idempotency_records
    where actor_id = v_actor and operation = 'checkout_sale' and idempotency_key = v_key
    for update;
  if v_saved_hash <> v_hash then
    raise exception using errcode = '22023', message = 'Checkout key was already used for a different request';
  end if;
  if v_saved_response is not null then return v_saved_response; end if;

  select tax_enabled, max_cashier_discount_percent, min_selling_margin_percent
  into v_tax_enabled, v_max_discount, v_min_margin
  from public.business_settings where id = true;
  v_tax_enabled := coalesce(v_tax_enabled, false);
  v_max_discount := coalesce(v_max_discount, 0);
  v_min_margin := coalesce(v_min_margin, 0);

  -- Deterministic row-lock order prevents deadlocks when concurrent checkouts overlap.
  perform 1 from public.branch_inventory bi
    join jsonb_to_recordset(p_payload->'items') as i(variant_id uuid) on i.variant_id = bi.variant_id
    where bi.branch_id = v_branch order by bi.variant_id for update of bi;

  for v_item in select value from jsonb_array_elements(p_payload->'items') order by (value->>'variant_id')::uuid loop
    v_variant := (v_item->>'variant_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := round((v_item->>'unit_price')::numeric, 2);
    v_reason := nullif(trim(v_item->>'override_reason'), '');

    select p.name, pv.sku, concat_ws(' ', pv.variant_label, pv.size_specification), u.symbol, u.decimal_places,
           pp.default_selling_price, coalesce(nullif(bi.weighted_average_cost,0), pp.cost_price), coalesce(bi.quantity, 0), pv.tax_rate
    into v_name, v_sku, v_variant_snapshot, v_unit, v_unit_decimals, v_default_price, v_cost, v_stock, v_tax_rate
    from public.product_variants pv
    join public.products p on p.id = pv.product_id and p.is_active
    join public.units u on u.id = pv.unit_id
    join public.product_prices pp on pp.variant_id = pv.id
    left join public.branch_inventory bi on bi.variant_id = pv.id and bi.branch_id = v_branch
    where pv.id = v_variant and pv.is_active;
    if not found then raise exception using errcode = '22023', message = 'A selected product is unavailable'; end if;
    if round(v_qty, v_unit_decimals) <> v_qty then
      raise exception using errcode = '22023', message = 'Quantity exceeds the precision configured for this unit';
    end if;
    if v_stock < v_qty then raise exception using errcode = 'P0001', message = 'Insufficient stock'; end if;
    if v_price <> v_default_price and v_reason is null then
      raise exception using errcode = '22023', message = 'A reason is required when overriding the selling price';
    end if;
    if v_price < v_default_price then
      if v_actor is not null and public.has_role('cashier') and not public.has_role('admin')
         and v_default_price > 0 and ((v_default_price - v_price) / v_default_price * 100) > v_max_discount then
        raise exception using errcode = '42501', message = 'Cashier discount exceeds the configured limit';
      end if;
    end if;
    if v_price > 0 and ((v_price - v_cost) / v_price * 100) < v_min_margin
       and not public.has_role('admin') then
      raise exception using errcode = '42501', message = 'Selling price is below the configured minimum margin';
    end if;
    v_line_subtotal := round(greatest(v_default_price, v_price) * v_qty, 2);
    v_line_discount := round(greatest(v_default_price - v_price, 0) * v_qty, 2);
    v_line_tax := case when v_tax_enabled then round(v_price * v_qty * v_tax_rate / 100, 2) else 0 end;
    v_line_total := round(v_price * v_qty + v_line_tax, 2);

    insert into public.sale_items (
      sale_id, variant_id, product_name_snapshot, sku_snapshot, variant_snapshot, unit_snapshot,
      quantity, default_price_snapshot, actual_unit_price, unit_discount, discount_total, tax_rate_snapshot, tax_total,
      unit_cost_snapshot, line_subtotal, line_total, price_overridden,
      price_override_employee_id, price_override_reason
    ) values (
      v_sale, v_variant, v_name, v_sku, v_variant_snapshot, v_unit,
      v_qty, v_default_price, v_price, greatest(v_default_price-v_price,0), v_line_discount, v_tax_rate, v_line_tax,
      v_cost, v_line_subtotal, v_line_total, v_price <> v_default_price,
      case when v_price <> v_default_price then v_actor end, v_reason
    );
    update public.branch_inventory set quantity = quantity - v_qty, updated_at = now()
      where branch_id = v_branch and variant_id = v_variant;
    if not found then raise exception using errcode = 'P0001', message = 'Inventory balance is not initialized'; end if;
    insert into public.inventory_movements(branch_id, variant_id, quantity_delta, movement_type, reference_type, reference_id, unit_cost, actor_id)
      values (v_branch, v_variant, -v_qty, 'sale', 'sale', v_sale, v_cost, v_actor);
    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount := v_discount + v_line_discount;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  end loop;

  for v_payment in select value from jsonb_array_elements(p_payload->'payments') loop
    v_method := (v_payment->>'method')::public.payment_method;
    v_amount := round((v_payment->>'amount')::numeric, 2);
    if v_method = 'credit' or v_amount is null or v_amount <= 0 then
      raise exception using errcode = '22023', message = 'Use positive cash, bank transfer, or card tenders; credit is calculated from the remaining balance';
    end if;
    v_tender := v_tender + v_amount;
    if v_method = 'cash' then v_cash_tender := v_cash_tender + v_amount;
    else v_non_cash_tender := v_non_cash_tender + v_amount; end if;
  end loop;
  if v_non_cash_tender > v_total then raise exception using errcode = '22023', message = 'Non-cash payments cannot exceed the invoice total'; end if;
  v_paid := least(v_tender, v_total);
  v_change := greatest(v_tender - v_total, 0);
  v_credit := v_total - v_paid;
  if v_credit > 0 and not v_allow_credit then
    raise exception using errcode = '22023', message = 'Payment is short; authorize a customer credit sale or add payment';
  end if;
  if v_credit > 0 and v_customer is null then
    raise exception using errcode = '22023', message = 'A registered customer is required for credit sales';
  end if;
  if v_credit_override is not null and not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'Only an Admin can override a customer credit limit';
  end if;

  if v_customer is not null then
    select credit_eligible, credit_limit, display_name, phone, address
      into v_customer_credit_eligible, v_customer_limit, v_customer_name, v_customer_phone, v_customer_address
      from public.customers where id = v_customer and is_active for update;
    if not found then raise exception using errcode = '22023', message = 'Customer is unavailable'; end if;
  end if;
  if v_credit > 0 then
    if not v_customer_credit_eligible and (v_credit_override is null or not public.has_role('admin')) then
      raise exception using errcode = '42501', message = 'Customer is not eligible for credit';
    end if;
    select coalesce(sum(debit-credit),0) into v_customer_balance from public.customer_ledger where customer_id = v_customer;
    if v_credit_override is null and v_customer_balance + v_credit > v_customer_limit then
      raise exception using errcode = 'P0001', message = 'Customer credit limit would be exceeded';
    end if;
  end if;

  update public.invoice_sequences set next_number = next_number + 1
    where branch_id = v_branch returning next_number - 1, prefix into v_invoice, v_invoice_number;
  if not found then raise exception using errcode = 'P0001', message = 'Invoice numbering is not configured for this branch'; end if;
  v_invoice_number := v_invoice_number || '-' || lpad(v_invoice::text, 8, '0');

  insert into public.sales(
    id, branch_id, invoice_number, customer_id, customer_name_snapshot, customer_phone_snapshot, customer_address_snapshot, cashier_name_snapshot,
    cashier_id, status, subtotal, discount_total, tax_total,
    total, amount_paid, change_due, idempotency_record_id
  ) values (
    v_sale, v_branch, v_invoice_number, v_customer, v_customer_name, v_customer_phone, v_customer_address, v_cashier_name,
    v_actor, 'posted', v_subtotal, v_discount, v_tax,
    v_total, v_paid, v_change, v_idempotency_id
  );

  -- Apply non-cash tenders first; cash receives only the remaining invoice allocation.
  v_remaining := v_total;
  for v_payment in
    select value from jsonb_array_elements(p_payload->'payments')
    order by case when value->>'method' = 'cash' then 1 else 0 end
  loop
    v_method := (v_payment->>'method')::public.payment_method;
    v_amount := round((v_payment->>'amount')::numeric, 2);
    v_applied := least(v_amount, v_remaining);
    v_remaining := v_remaining - v_applied;
    insert into public.payments(sale_id, method, amount, reference, received_by)
      values (v_sale, v_method, v_amount, nullif(trim(v_payment->>'reference'), ''), v_actor)
      returning id into v_payment_id;
    if v_applied > 0 then
      insert into public.payment_allocations(payment_id, sale_id, amount) values (v_payment_id, v_sale, v_applied);
    end if;
  end loop;

  if v_credit > 0 then
    insert into public.customer_ledger(customer_id, branch_id, sale_id, entry_type, debit, actor_id)
      values (v_customer, v_branch, v_sale, 'credit_sale', v_credit, v_actor);
  end if;
    if v_credit_override is not null and v_credit > 0 then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, branch_id, after_data, reason)
      values (v_actor, 'credit_limit_override', 'sale', v_sale, v_branch,
        jsonb_build_object('customer_id',v_customer,'credit_amount',v_credit), v_credit_override);
  end if;
  if exists (select 1 from public.sale_items where sale_id = v_sale and price_overridden) then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, branch_id, after_data, reason)
      values (v_actor, 'bill_price_override', 'sale', v_sale, v_branch,
        (select jsonb_agg(jsonb_build_object('sale_item_id',id,'variant_id',variant_id,'default_price',default_price_snapshot,'actual_price',actual_unit_price,'reason',price_override_reason)) from public.sale_items where sale_id = v_sale and price_overridden),
        'Invoice-only negotiated price');
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, branch_id, after_data)
    values (v_actor, 'sale_created', 'sale', v_sale, v_branch,
      jsonb_build_object('invoice_number',v_invoice_number,'total',v_total,'discount_total',v_discount));

  v_saved_response := jsonb_build_object(
    'sale_id', v_sale,
    'invoice_number', v_invoice_number,
    'customer_name', v_customer_name,
    'cashier_name', v_cashier_name,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'tax_total', v_tax,
    'total', v_total,
    'amount_paid', v_paid,
    'change_due', v_change,
    'credit_outstanding', v_credit,
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('method',method,'amount',amount) order by received_at), '[]'::jsonb) from public.payments where sale_id = v_sale),
    'items', (select jsonb_agg(jsonb_build_object(
      'name', product_name_snapshot, 'sku', sku_snapshot, 'variant', variant_snapshot,
      'unit', unit_snapshot, 'quantity', quantity, 'price', actual_unit_price,
      'discount', discount_total, 'total', line_total
    ) order by id) from public.sale_items where sale_id = v_sale)
  );
  update public.idempotency_records set response = v_saved_response where id = v_idempotency_id;
  return v_saved_response;
end;
$$;
revoke all on function public.checkout_sale(jsonb) from public;
grant execute on function public.checkout_sale(jsonb) to authenticated;

commit;

-- Gunawardhana Hardware Management System
-- Core normalized schema. Operational writes are restricted to transaction RPCs.
begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.employee_role as enum ('admin', 'inventory_manager', 'cashier');
create type public.document_status as enum ('draft', 'posted', 'voided');
create type public.inventory_movement_type as enum ('opening', 'purchase_receipt', 'sale', 'sale_return', 'adjustment', 'damage', 'loss', 'transfer_in', 'transfer_out');
create type public.payment_method as enum ('cash', 'bank_transfer', 'card', 'credit');

create table public.roles (
  id public.employee_role primary key,
  description text not null
);
insert into public.roles (id, description) values
  ('admin', 'Owner with full business access'),
  ('inventory_manager', 'Catalog, purchasing, and stock operations'),
  ('cashier', 'Point of sale and permitted customer operations');

create table public.permissions (
  id text primary key,
  description text not null
);
insert into public.permissions (id, description) values
  ('catalog.read', 'Read product catalog'), ('catalog.write', 'Create and edit products and master prices'),
  ('inventory.read', 'Read stock balances and movements'), ('inventory.write', 'Post stock movements'),
  ('purchasing.read', 'Read supplier and purchase operations'), ('purchasing.write', 'Manage and post purchases'),
  ('customers.read', 'Read customer records'), ('customers.write', 'Manage customer records'),
  ('pos.checkout', 'Create sales and record payments'), ('sales.read_own', 'Read own permitted sales'),
  ('finance.read', 'Read owner financial reports'), ('employees.manage', 'Manage employee access'),
  ('settings.manage', 'Manage business settings'), ('audit.read', 'Read business audit history');

create table public.role_permissions (
  role_id public.employee_role not null references public.roles(id),
  permission_id text not null references public.permissions(id),
  primary key (role_id, permission_id)
);
insert into public.role_permissions (role_id, permission_id) values
  ('admin','catalog.read'),('admin','catalog.write'),('admin','inventory.read'),('admin','inventory.write'),
  ('admin','purchasing.read'),('admin','purchasing.write'),('admin','customers.read'),('admin','customers.write'),
  ('admin','pos.checkout'),('admin','sales.read_own'),('admin','finance.read'),('admin','employees.manage'),('admin','settings.manage'),('admin','audit.read'),
  ('inventory_manager','catalog.read'),('inventory_manager','catalog.write'),('inventory_manager','inventory.read'),('inventory_manager','inventory.write'),
  ('inventory_manager','purchasing.read'),('inventory_manager','purchasing.write'),('inventory_manager','customers.read'),('inventory_manager','customers.write'),
  ('cashier','catalog.read'),('cashier','customers.read'),('cashier','customers.write'),('cashier','pos.checkout'),('cashier','sales.read_own');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null unique,
  display_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete restrict,
  role_id public.employee_role not null references public.roles(id),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  phone text,
  timezone text not null default 'Asia/Colombo',
  currency_code char(3) not null default 'LKR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (currency_code = 'LKR')
);
create table public.user_branch_access (
  user_id uuid not null references public.profiles(id) on delete restrict,
  branch_id uuid not null references public.branches(id),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);
insert into public.branches(code, name) values ('MAIN', 'Main Branch') on conflict (code) do nothing;

create or replace function public.has_role(required_role public.employee_role)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role_id = required_role and p.is_active
  );
$$;
create or replace function public.has_any_role(required_roles public.employee_role[])
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role_id = any(required_roles) and p.is_active
  );
$$;
create or replace function public.can_access_branch(target_branch uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select public.has_role('admin') or exists (
    select 1 from public.user_branch_access a join public.profiles p on p.id = a.user_id
    where a.user_id = auth.uid() and a.branch_id = target_branch and p.is_active
  );
$$;
revoke all on function public.has_role(public.employee_role) from public;
revoke all on function public.has_any_role(public.employee_role[]) from public;
revoke all on function public.can_access_branch(uuid) from public;
grant execute on function public.has_role(public.employee_role), public.has_any_role(public.employee_role[]), public.can_access_branch(uuid) to authenticated;

create table public.business_settings (
  id boolean primary key default true check (id),
  business_name text not null default 'Gunawardhana Hardware',
  address text,
  phone text,
  timezone text not null default 'Asia/Colombo',
  currency_code char(3) not null default 'LKR',
  tax_enabled boolean not null default false,
  tax_rate numeric(7,4) not null default 0 check (tax_rate between 0 and 100),
  max_cashier_discount_percent numeric(7,4) not null default 0 check (max_cashier_discount_percent between 0 and 100),
  min_selling_margin_percent numeric(7,4) not null default 0 check (min_selling_margin_percent between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  check (currency_code = 'LKR')
);
insert into public.business_settings(id) values (true) on conflict (id) do nothing;
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.categories(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (parent_id, name)
);
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  symbol text not null unique,
  decimal_places smallint not null default 0 check (decimal_places between 0 and 6),
  is_active boolean not null default true
);
insert into public.units(name,symbol,decimal_places) values
  ('Piece','pcs',0),('Length','length',0),('Meter','m',3),('Kilogram','kg',3),('Gram','g',0),
  ('Litre','L',3),('Millilitre','mL',0),('Packet','pkt',0),('Box','box',0),('Roll','roll',0),('Set','set',0),('Other','other',3);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  location text,
  payment_terms text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category_id uuid references public.categories(id),
  subcategory_name text,
  brand_id uuid references public.brands(id),
  supplier_id uuid references public.suppliers(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  sku text not null unique,
  barcode text unique,
  variant_label text,
  size_specification text,
  unit_id uuid not null references public.units(id),
  rack_location text,
  tax_rate numeric(7,4) not null default 0 check (tax_rate between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.product_prices (
  variant_id uuid primary key references public.product_variants(id) on delete restrict,
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  marked_price numeric(14,2) not null default 0 check (marked_price >= 0),
  default_selling_price numeric(14,2) not null default 0 check (default_selling_price >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create table public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id),
  cost_price numeric(14,2) not null check (cost_price >= 0),
  marked_price numeric(14,2) not null check (marked_price >= 0),
  default_selling_price numeric(14,2) not null check (default_selling_price >= 0),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id),
  reason text
);
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.branch_inventory (
  branch_id uuid not null references public.branches(id),
  variant_id uuid not null references public.product_variants(id),
  quantity numeric(14,6) not null default 0 check (quantity >= 0),
  reorder_level numeric(14,6) not null default 0 check (reorder_level >= 0),
  weighted_average_cost numeric(14,4) not null default 0 check (weighted_average_cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, variant_id)
);
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  variant_id uuid not null references public.product_variants(id),
  quantity_delta numeric(14,6) not null check (quantity_delta <> 0),
  movement_type public.inventory_movement_type not null,
  reference_type text,
  reference_id uuid,
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  reason text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  status public.document_status not null default 'draft',
  reason text not null,
  created_by uuid not null references public.profiles(id),
  posted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.stock_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.stock_adjustments(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id),
  quantity_delta numeric(14,6) not null check (quantity_delta <> 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  unique (adjustment_id, variant_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  phone text,
  address text,
  notes text,
  credit_eligible boolean not null default false,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  is_walk_in boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  check (not is_walk_in or (credit_limit = 0 and not credit_eligible))
);
create unique index customers_unique_walkin on public.customers (is_walk_in) where is_walk_in;
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  supplier_id uuid not null references public.suppliers(id),
  supplier_invoice_no text,
  purchase_reference text not null unique,
  status public.document_status not null default 'draft',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  received_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id),
  quantity numeric(14,6) not null check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  unique (purchase_id, variant_id)
);
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id),
  amount numeric(14,2) not null check (amount > 0),
  method public.payment_method not null check (method <> 'credit'),
  reference text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.invoice_sequences (
  branch_id uuid primary key references public.branches(id),
  next_number bigint not null default 1 check (next_number > 0),
  prefix text not null default 'INV'
);
insert into public.invoice_sequences(branch_id)
  select id from public.branches where code = 'MAIN'
  on conflict (branch_id) do nothing;
create table public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  idempotency_key uuid not null,
  operation text not null,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (actor_id, operation, idempotency_key)
);
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  invoice_number text not null,
  customer_id uuid references public.customers(id),
  customer_name_snapshot text not null default 'Walk-in customer',
  customer_phone_snapshot text,
  customer_address_snapshot text,
  cashier_name_snapshot text not null,
  cashier_id uuid not null references public.profiles(id),
  status public.document_status not null default 'posted',
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(14,2) not null default 0 check (tax_total >= 0),
  total numeric(14,2) not null check (total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  change_due numeric(14,2) not null default 0 check (change_due >= 0),
  idempotency_record_id uuid unique references public.idempotency_records(id),
  sold_at timestamptz not null default now(),
  unique (branch_id, invoice_number),
  check (discount_total <= subtotal),
  check (amount_paid - change_due <= total)
);
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id),
  product_name_snapshot text not null,
  sku_snapshot text not null,
  variant_snapshot text,
  unit_snapshot text not null,
  quantity numeric(14,6) not null check (quantity > 0),
  default_price_snapshot numeric(14,2) not null check (default_price_snapshot >= 0),
  actual_unit_price numeric(14,2) not null check (actual_unit_price >= 0),
  unit_discount numeric(14,2) not null default 0 check (unit_discount >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  tax_rate_snapshot numeric(7,4) not null default 0 check (tax_rate_snapshot between 0 and 100),
  tax_total numeric(14,2) not null default 0 check (tax_total >= 0),
  unit_cost_snapshot numeric(14,4) not null check (unit_cost_snapshot >= 0),
  line_subtotal numeric(14,2) not null check (line_subtotal >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  price_overridden boolean not null default false,
  price_override_employee_id uuid references public.profiles(id),
  price_override_reason text,
  created_at timestamptz not null default now(),
  check (not price_overridden or price_override_employee_id is not null)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  method public.payment_method not null,
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  received_by uuid references public.profiles(id),
  received_at timestamptz not null default now(),
  check (method <> 'credit' or reference is null)
);
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  sale_id uuid not null references public.sales(id),
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, sale_id)
);
create table public.customer_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  branch_id uuid not null references public.branches(id),
  sale_id uuid references public.sales(id),
  payment_id uuid references public.payments(id),
  entry_type text not null check (entry_type in ('credit_sale','payment','return','adjustment')),
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create table public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  original_sale_id uuid not null references public.sales(id),
  branch_id uuid not null references public.branches(id),
  return_number text not null,
  total numeric(14,2) not null check (total >= 0),
  reason text not null,
  authorized_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (branch_id, return_number)
);
create table public.sales_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sales_returns(id),
  sale_item_id uuid not null references public.sale_items(id),
  quantity numeric(14,6) not null check (quantity > 0),
  unit_refund numeric(14,2) not null check (unit_refund >= 0),
  line_refund numeric(14,2) not null check (line_refund >= 0)
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  category_id uuid not null references public.expense_categories(id),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  status public.document_status not null default 'draft',
  incurred_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  corrected_from uuid references public.expenses(id),
  created_at timestamptz not null default now()
);
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  cashier_id uuid not null references public.profiles(id),
  opening_float numeric(14,2) not null default 0 check (opening_float >= 0),
  counted_closing numeric(14,2) check (counted_closing is null or counted_closing >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions(id),
  amount numeric(14,2) not null check (amount <> 0),
  reason text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  branch_id uuid references public.branches(id),
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create or replace function public.prevent_ledger_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '55000', message = 'Ledger records are immutable; post a correcting entry instead';
end;
$$;
create trigger inventory_movements_immutable
  before update or delete on public.inventory_movements
  for each row execute function public.prevent_ledger_mutation();
create trigger customer_ledger_immutable
  before update or delete on public.customer_ledger
  for each row execute function public.prevent_ledger_mutation();
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.prevent_ledger_mutation();
revoke all on function public.prevent_ledger_mutation() from public;

-- Search and operational indexes.
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_description_trgm_idx on public.products using gin (description extensions.gin_trgm_ops);
create index categories_name_trgm_idx on public.categories using gin (name extensions.gin_trgm_ops);
create index brands_name_trgm_idx on public.brands using gin (name extensions.gin_trgm_ops);
create index products_subcategory_trgm_idx on public.products using gin (subcategory_name extensions.gin_trgm_ops);
create index products_category_idx on public.products (category_id) where is_active;
create index variants_barcode_idx on public.product_variants (barcode) where barcode is not null;
create index variants_sku_idx on public.product_variants (sku);
create index variants_label_trgm_idx on public.product_variants using gin (coalesce(size_specification, '') extensions.gin_trgm_ops);
create index variants_variant_trgm_idx on public.product_variants using gin (variant_label extensions.gin_trgm_ops);
create index customers_name_trgm_idx on public.customers using gin (display_name extensions.gin_trgm_ops);
create index customers_phone_trgm_idx on public.customers using gin (phone extensions.gin_trgm_ops) where phone is not null;
create index inventory_low_stock_idx on public.branch_inventory (branch_id, quantity, reorder_level);
create index movements_variant_time_idx on public.inventory_movements (branch_id, variant_id, created_at desc);
create index sales_branch_time_idx on public.sales (branch_id, sold_at desc);
create index sales_cashier_time_idx on public.sales (cashier_id, sold_at desc);
create index sale_items_variant_idx on public.sale_items (variant_id, sale_id);
create index customer_ledger_customer_time_idx on public.customer_ledger (customer_id, created_at desc);
create index purchases_branch_time_idx on public.purchases (branch_id, created_at desc);
create index audit_logs_time_idx on public.audit_logs (created_at desc);

-- Deny anonymous access. RLS and least-privilege policies govern authenticated reads.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.branches enable row level security;
alter table public.user_branch_access enable row level security;
alter table public.business_settings enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.units enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_prices enable row level security;
alter table public.product_price_history enable row level security;
alter table public.product_images enable row level security;
alter table public.branch_inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustment_items enable row level security;
alter table public.customers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.idempotency_records enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.customer_ledger enable row level security;
alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.audit_logs enable row level security;

-- Supabase projects may grant broad default privileges on the public schema. Reset them
-- explicitly so column-level grants below are the only browser-accessible projections.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant select on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.branches, public.user_branch_access to authenticated;
grant select on public.categories, public.brands, public.units, public.products, public.product_variants, public.product_images to authenticated;
grant select (branch_id, variant_id, quantity, reorder_level, updated_at) on public.branch_inventory to authenticated;
grant select on public.inventory_movements to authenticated;
grant select on public.customers, public.sales, public.payments to authenticated;
grant select (id, sale_id, variant_id, product_name_snapshot, sku_snapshot, variant_snapshot, unit_snapshot,
  quantity, default_price_snapshot, actual_unit_price, unit_discount, discount_total, tax_rate_snapshot, tax_total, line_subtotal,
  line_total, price_overridden, price_override_employee_id, price_override_reason, created_at)
  on public.sale_items to authenticated;
grant select on public.suppliers, public.purchases, public.purchase_items, public.supplier_payments to authenticated;
grant select on public.customer_ledger, public.sales_returns, public.sales_return_items to authenticated;
grant select on public.business_settings, public.expense_categories, public.expenses, public.cash_sessions, public.cash_movements, public.audit_logs to authenticated;
-- Sensitive cost fields are a separate table and hidden from cashiers by policy.
grant select on public.product_prices, public.product_price_history to authenticated;

create policy roles_authenticated_read on public.roles for select to authenticated using (true);
create policy permissions_authenticated_read on public.permissions for select to authenticated using (true);
create policy role_permissions_authenticated_read on public.role_permissions for select to authenticated using (true);
create policy profiles_self_or_admin_read on public.profiles for select to authenticated using (id = auth.uid() or public.has_role('admin'));
create policy user_roles_self_or_admin_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role('admin'));
create policy branches_accessible_read on public.branches for select to authenticated using (public.can_access_branch(id));
create policy branch_access_self_or_admin_read on public.user_branch_access for select to authenticated using (user_id = auth.uid() or public.has_role('admin'));
create policy settings_admin_only_read on public.business_settings for select to authenticated using (public.has_role('admin'));
create policy categories_authenticated_read on public.categories for select to authenticated using (auth.uid() is not null);
create policy brands_authenticated_read on public.brands for select to authenticated using (auth.uid() is not null);
create policy units_authenticated_read on public.units for select to authenticated using (auth.uid() is not null);
create policy suppliers_ops_read on public.suppliers for select to authenticated using (public.has_any_role(array['admin','inventory_manager']::public.employee_role[]));
create policy products_authenticated_read on public.products for select to authenticated using (auth.uid() is not null);
create policy variants_authenticated_read on public.product_variants for select to authenticated using (auth.uid() is not null);
create policy prices_ops_read on public.product_prices for select to authenticated using (public.has_any_role(array['admin','inventory_manager']::public.employee_role[]));
create policy price_history_ops_read on public.product_price_history for select to authenticated using (public.has_any_role(array['admin','inventory_manager']::public.employee_role[]));
create policy images_authenticated_read on public.product_images for select to authenticated using (auth.uid() is not null);
create policy inventory_branch_read on public.branch_inventory for select to authenticated using (public.can_access_branch(branch_id));
create policy movements_ops_read on public.inventory_movements for select to authenticated using (public.can_access_branch(branch_id) and public.has_any_role(array['admin','inventory_manager']::public.employee_role[]));
create policy adjustments_ops_read on public.stock_adjustments for select to authenticated using (public.can_access_branch(branch_id) and public.has_any_role(array['admin','inventory_manager']::public.employee_role[]));
create policy adjustment_items_ops_read on public.stock_adjustment_items for select to authenticated using (exists (select 1 from public.stock_adjustments a where a.id = adjustment_id and public.can_access_branch(a.branch_id) and public.has_any_role(array['admin','inventory_manager']::public.employee_role[])));
create policy customers_branch_read on public.customers for select to authenticated using (public.has_any_role(array['admin','inventory_manager','cashier']::public.employee_role[]));
create policy purchases_ops_read on public.purchases for select to authenticated using (public.can_access_branch(branch_id) and public.has_any_role(array['admin','inventory_manager']::public.employee_role[]));
create policy purchase_items_ops_read on public.purchase_items for select to authenticated using (exists (select 1 from public.purchases p where p.id = purchase_id and public.can_access_branch(p.branch_id) and public.has_any_role(array['admin','inventory_manager']::public.employee_role[])));
create policy supplier_payments_ops_read on public.supplier_payments for select to authenticated using (
  exists (select 1 from public.purchases p where p.id = purchase_id and public.can_access_branch(p.branch_id)
    and public.has_any_role(array['admin','inventory_manager']::public.employee_role[]))
);
create policy invoice_sequence_admin_read on public.invoice_sequences for select to authenticated using (public.has_role('admin'));
create policy idempotency_actor_read on public.idempotency_records for select to authenticated using (actor_id = auth.uid());
create policy sales_allowed_read on public.sales for select to authenticated using (
  public.can_access_branch(branch_id) and
  (public.has_role('admin') or (cashier_id = auth.uid() and public.has_role('cashier')))
);
create policy sale_items_allowed_read on public.sale_items for select to authenticated using (
  exists (select 1 from public.sales s where s.id = sale_id and public.can_access_branch(s.branch_id) and
    (public.has_role('admin') or (s.cashier_id = auth.uid() and public.has_role('cashier'))))
);
create policy payments_allowed_read on public.payments for select to authenticated using (
  exists (select 1 from public.sales s where s.id = sale_id and public.can_access_branch(s.branch_id) and
    (public.has_role('admin') or (s.cashier_id = auth.uid() and public.has_role('cashier'))))
);
create policy allocations_allowed_read on public.payment_allocations for select to authenticated using (
  exists (select 1 from public.sales s where s.id = sale_id and public.can_access_branch(s.branch_id) and
    (public.has_role('admin') or (s.cashier_id = auth.uid() and public.has_role('cashier'))))
);
create policy customer_ledger_admin_read on public.customer_ledger for select to authenticated using (public.has_role('admin') and public.can_access_branch(branch_id));
create policy returns_allowed_read on public.sales_returns for select to authenticated using (public.can_access_branch(branch_id) and public.has_role('admin'));
create policy return_items_allowed_read on public.sales_return_items for select to authenticated using (exists (select 1 from public.sales_returns r where r.id = return_id and public.can_access_branch(r.branch_id) and public.has_role('admin')));
create policy expense_categories_admin_read on public.expense_categories for select to authenticated using (public.has_role('admin'));
create policy expenses_admin_read on public.expenses for select to authenticated using (public.can_access_branch(branch_id) and public.has_role('admin'));
create policy sessions_cashier_read on public.cash_sessions for select to authenticated using (public.can_access_branch(branch_id) and (public.has_role('admin') or cashier_id = auth.uid()));
create policy cash_movements_admin_or_owner_read on public.cash_movements for select to authenticated using (exists (select 1 from public.cash_sessions c where c.id = session_id and public.can_access_branch(c.branch_id) and (public.has_role('admin') or c.cashier_id = auth.uid())));
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.has_role('admin'));

-- Writes are intentionally not granted directly. Follow-up migrations add narrow SECURITY DEFINER
-- transaction functions after their authorization and idempotency rules are defined.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

commit;

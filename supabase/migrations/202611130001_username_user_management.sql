-- Username login metadata and administrator-managed password accounts.
begin;

alter table public.profiles add column username text;
alter table public.profiles add column contact_email text;

-- Preserve existing users and give the first existing Admin the requested username.
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_suffix text;
begin
  for r in
    select p.id, p.email,
      exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role_id='admin') as is_admin
    from public.profiles p
    where p.username is null
    order by exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role_id='admin') desc,
      p.created_at, p.id
  loop
    if r.is_admin and not exists(select 1 from public.profiles where username='gunawardhana') then
      v_candidate := 'gunawardhana';
    else
      v_base := lower(regexp_replace(split_part(r.email,'@',1),'[^a-z0-9._-]','','g'));
      if length(v_base)<3 then v_base := 'staff'; end if;
      v_candidate := left(v_base,32);
      v_suffix := left(replace(r.id::text,'-',''),8);
      if exists(select 1 from public.profiles where username=v_candidate) then
        v_candidate := left(v_base,23)||'-'||v_suffix;
      end if;
      while exists(select 1 from public.profiles where username=v_candidate) loop
        v_candidate := left(v_base,18)||'-'||left(replace(gen_random_uuid()::text,'-',''),12);
      end loop;
    end if;
    update public.profiles set username=v_candidate, contact_email=email where id=r.id;
  end loop;
end $$;

alter table public.profiles alter column username set not null;
alter table public.profiles add constraint profiles_username_format
  check (username = lower(username) and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
create unique index profiles_username_unique_idx on public.profiles(username);
create index profiles_username_active_idx on public.profiles(username) where is_active;

-- Inventory Staff handles stock/catalog/purchasing; customer records are POS access.
delete from public.role_permissions where role_id='inventory_manager' and permission_id in ('customers.read','customers.write');
drop policy if exists customers_branch_read on public.customers;
create policy customers_branch_read on public.customers for select to authenticated
  using (public.has_any_role(array['admin','cashier']::public.employee_role[]));

create or replace function public.bootstrap_first_admin(p_user_id uuid,p_login_email text,p_display_name text default 'Gunawardhana Administrator')
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_branch uuid;
begin
  if auth.role() <> 'service_role' then raise exception using errcode='42501',message='Bootstrap requires the server secret'; end if;
  if exists(select 1 from public.user_roles where role_id='admin') then raise exception using errcode='P0001',message='An Admin account already exists'; end if;
  if p_user_id is null or lower(trim(p_login_email)) <> 'gunawardhana@accounts.gunawardhana.invalid'
     or not exists(select 1 from auth.users where id=p_user_id and lower(email)=lower(trim(p_login_email))) then
    raise exception using errcode='22023',message='The initial Admin Auth identity is invalid';
  end if;
  if exists(select 1 from public.profiles where username='gunawardhana') then raise exception using errcode='23505',message='The default username is already assigned'; end if;
  select id into v_branch from public.branches where code='MAIN' and is_active;
  if v_branch is null then raise exception using errcode='P0001',message='The MAIN branch is missing'; end if;
  insert into public.profiles(id,email,username,display_name,is_active)
    values(p_user_id,lower(trim(p_login_email)),'gunawardhana',coalesce(nullif(trim(p_display_name),''),'Gunawardhana Administrator'),true);
  insert into public.user_roles(user_id,role_id) values(p_user_id,'admin');
  insert into public.user_branch_access(user_id,branch_id) values(p_user_id,v_branch);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,branch_id,after_data)
    values(p_user_id,'initial_admin_bootstrapped','profile',p_user_id,v_branch,jsonb_build_object('username','gunawardhana','role','admin'));
end;
$$;
revoke all on function public.bootstrap_first_admin(uuid,text,text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid,text,text) to service_role;

create or replace function public.provision_employee_with_username(
  p_user_id uuid,
  p_login_email text,
  p_contact_email text,
  p_username text,
  p_display_name text,
  p_phone text,
  p_role public.employee_role,
  p_branch_id uuid
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_username text := lower(trim(p_username));
begin
  if v_actor is null or not public.has_role('admin') then
    raise exception using errcode='42501',message='Only an Admin can create employee accounts';
  end if;
  if p_user_id is null or p_user_id=v_actor or p_role is null
     or v_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$'
     or nullif(trim(p_login_email),'') is null
     or length(trim(coalesce(p_display_name,'')))<2 then
    raise exception using errcode='22023',message='Invalid employee account details';
  end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id and lower(u.email)=lower(trim(p_login_email))) then
    raise exception using errcode='22023',message='Authentication account is missing';
  end if;
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.is_active) then
    raise exception using errcode='22023',message='Select an active branch';
  end if;
  insert into public.profiles(id,email,contact_email,username,display_name,phone,is_active)
    values(p_user_id,lower(trim(p_login_email)),nullif(lower(trim(p_contact_email)),''),v_username,trim(p_display_name),nullif(trim(p_phone),''),true);
  insert into public.user_roles(user_id,role_id,assigned_by) values(p_user_id,p_role,v_actor);
  insert into public.user_branch_access(user_id,branch_id,granted_by) values(p_user_id,p_branch_id,v_actor);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,branch_id,after_data)
    values(v_actor,'employee_provisioned','profile',p_user_id,p_branch_id,
      jsonb_build_object('username',v_username,'display_name',trim(p_display_name),'role',p_role));
end;
$$;
revoke all on function public.provision_employee_with_username(uuid,text,text,text,text,text,public.employee_role,uuid) from public;
grant execute on function public.provision_employee_with_username(uuid,text,text,text,text,text,public.employee_role,uuid) to authenticated;

-- Keep the original invite RPC functional for already-deployed app versions during rollout.
create or replace function public.provision_employee(
  p_user_id uuid,p_email text,p_display_name text,p_phone text,p_role public.employee_role,p_branch_id uuid
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_username text := lower(regexp_replace(split_part(coalesce(p_email,''),'@',1),'[^a-z0-9._-]','','g'));
begin
  if length(v_username)<3 then v_username := 'staff-'||left(replace(p_user_id::text,'-',''),8); end if;
  if exists(select 1 from public.profiles where username=v_username) then
    v_username := left(v_username,22)||'-'||left(replace(p_user_id::text,'-',''),8);
  end if;
  perform public.provision_employee_with_username(p_user_id,p_email,p_email,v_username,p_display_name,p_phone,p_role,p_branch_id);
end;
$$;
revoke all on function public.provision_employee(uuid,text,text,text,public.employee_role,uuid) from public;
grant execute on function public.provision_employee(uuid,text,text,text,public.employee_role,uuid) to authenticated;

create or replace function public.set_employee_details(
  p_user_id uuid,
  p_username text,
  p_login_email text,
  p_contact_email text,
  p_display_name text,
  p_phone text,
  p_branch_id uuid,
  p_reason text
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_username text := lower(trim(p_username));
begin
  if v_actor is null or not public.has_role('admin') then
    raise exception using errcode='42501',message='Only an Admin can edit employee accounts';
  end if;
  if p_user_id is null or v_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$'
     or nullif(trim(p_login_email),'') is null or length(trim(coalesce(p_display_name,'')))<2
     or nullif(trim(p_reason),'') is null then
    raise exception using errcode='22023',message='Invalid employee details or change reason';
  end if;
  if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and is_active) then
    raise exception using errcode='22023',message='Select an active branch';
  end if;
  select jsonb_build_object('username',username,'display_name',display_name,'contact_email',contact_email,'phone',phone)
    into v_before from public.profiles where id=p_user_id and is_active for update;
  if not found then raise exception using errcode='22023',message='Active employee was not found'; end if;
  update public.profiles set username=v_username,email=lower(trim(p_login_email)),
    contact_email=nullif(lower(trim(p_contact_email)),''),display_name=trim(p_display_name),
    phone=nullif(trim(p_phone),''),updated_at=now() where id=p_user_id;
  if p_branch_id is not null then
    delete from public.user_branch_access where user_id=p_user_id;
    insert into public.user_branch_access(user_id,branch_id,granted_by) values(p_user_id,p_branch_id,v_actor);
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data,before_data,reason)
    values(v_actor,'employee_details_changed','profile',p_user_id,
      jsonb_build_object('username',v_username,'display_name',trim(p_display_name),'contact_email',nullif(trim(p_contact_email),'')),
      v_before,trim(p_reason));
end;
$$;
revoke all on function public.set_employee_details(uuid,text,text,text,text,text,uuid,text) from public;
grant execute on function public.set_employee_details(uuid,text,text,text,text,text,uuid,text) to authenticated;

create or replace function public.record_employee_password_reset(p_user_id uuid,p_reason text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.has_role('admin') then raise exception using errcode='42501',message='Only an Admin can reset passwords'; end if;
  if p_user_id is null or p_user_id=v_actor or nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='A different employee and reason are required'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and is_active) then raise exception using errcode='22023',message='Active employee was not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,reason)
    values(v_actor,'employee_password_reset','profile',p_user_id,trim(p_reason));
end;
$$;
revoke all on function public.record_employee_password_reset(uuid,text) from public;
grant execute on function public.record_employee_password_reset(uuid,text) to authenticated;

create or replace function public.delete_employee_account(p_user_id uuid,p_reason text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_deleted_username text := 'deleted-'||left(replace(p_user_id::text,'-',''),12);
  v_deleted_email text := 'deleted+'||replace(p_user_id::text,'-','')||'@accounts.gunawardhana.invalid';
begin
  if v_actor is null or not public.has_role('admin') then raise exception using errcode='42501',message='Only an Admin can delete employee accounts'; end if;
  if p_user_id is null or p_user_id=v_actor or nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='A different employee and reason are required'; end if;
  select jsonb_build_object('username',p.username,'display_name',p.display_name,'role',ur.role_id)
    into v_before from public.profiles p left join public.user_roles ur on ur.user_id=p.id
    where p.id=p_user_id and p.is_active for update of p;
  if not found then raise exception using errcode='22023',message='Active employee was not found'; end if;
  delete from public.user_roles where user_id=p_user_id;
  delete from public.user_branch_access where user_id=p_user_id;
  update public.profiles set username=v_deleted_username,email=v_deleted_email,contact_email=null,
    display_name='Deleted employee',phone=null,is_active=false,updated_at=now() where id=p_user_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,reason)
    values(v_actor,'employee_account_deleted','profile',p_user_id,v_before,jsonb_build_object('is_active',false),trim(p_reason));
end;
$$;
revoke all on function public.delete_employee_account(uuid,text) from public;
grant execute on function public.delete_employee_account(uuid,text) to authenticated;

commit;

-- Admin-only employee provisioning. Auth user creation is performed server-side;
-- this function atomically assigns the database identity, role, branch, and audit row.
begin;

create or replace function public.provision_employee(
  p_user_id uuid,
  p_email text,
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
begin
  if v_actor is null or not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'Only an Admin can provision employees';
  end if;
  if p_user_id is null or p_user_id = v_actor or p_role is null
     or p_email is null or length(trim(p_email)) < 5
     or p_display_name is null or length(trim(p_display_name)) < 2 then
    raise exception using errcode = '22023', message = 'Invalid employee details';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id and lower(u.email) = lower(trim(p_email))) then
    raise exception using errcode = '22023', message = 'The invited authentication user does not exist';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.is_active) then
    raise exception using errcode = '22023', message = 'Select an active branch';
  end if;

  insert into public.profiles(id, email, display_name, phone, is_active)
    values (p_user_id, lower(trim(p_email)), trim(p_display_name), nullif(trim(p_phone), ''), true);
  insert into public.user_roles(user_id, role_id, assigned_by)
    values (p_user_id, p_role, v_actor);
  insert into public.user_branch_access(user_id, branch_id, granted_by)
    values (p_user_id, p_branch_id, v_actor);
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, branch_id, after_data)
    values (v_actor, 'employee_provisioned', 'profile', p_user_id, p_branch_id,
      jsonb_build_object('display_name',trim(p_display_name),'role',p_role));
end;
$$;
revoke all on function public.provision_employee(uuid, text, text, text, public.employee_role, uuid) from public;
grant execute on function public.provision_employee(uuid, text, text, text, public.employee_role, uuid) to authenticated;

create or replace function public.set_employee_role(p_user_id uuid, p_role public.employee_role, p_reason text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.employee_role;
begin
  if v_actor is null or not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'Only an Admin can change employee roles';
  end if;
  if p_user_id is null or p_user_id = v_actor or p_role is null or nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'A different employee, role, and reason are required';
  end if;
  select role_id into v_before from public.user_roles where user_id = p_user_id for update;
  if not found then raise exception using errcode = '22023', message = 'Employee was not found'; end if;
  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles(user_id, role_id, assigned_by) values (p_user_id, p_role, v_actor);
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, reason)
    values (v_actor, 'employee_role_changed', 'profile', p_user_id,
      jsonb_build_object('role',v_before), jsonb_build_object('role',p_role), trim(p_reason));
end;
$$;
revoke all on function public.set_employee_role(uuid, public.employee_role, text) from public;
grant execute on function public.set_employee_role(uuid, public.employee_role, text) to authenticated;

create or replace function public.set_employee_active(p_user_id uuid, p_is_active boolean, p_reason text)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_before boolean;
begin
  if v_actor is null or not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'Only an Admin can change employee status';
  end if;
  if p_user_id is null or p_user_id = v_actor or p_is_active is null or nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'A different employee, status, and reason are required';
  end if;
  select is_active into v_before from public.profiles where id = p_user_id for update;
  if not found then raise exception using errcode = '22023', message = 'Employee was not found'; end if;
  update public.profiles set is_active = p_is_active, updated_at = now() where id = p_user_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, reason)
    values (v_actor, 'employee_status_changed', 'profile', p_user_id,
      jsonb_build_object('is_active',v_before), jsonb_build_object('is_active',p_is_active), trim(p_reason));
end;
$$;
revoke all on function public.set_employee_active(uuid, boolean, text) from public;
grant execute on function public.set_employee_active(uuid, boolean, text) to authenticated;

commit;

-- Private Supabase Storage bucket for catalog images.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

create policy product_images_authenticated_read on storage.objects
  for select to authenticated using (bucket_id='product-images');
create policy product_images_manager_insert on storage.objects
  for insert to authenticated with check (
    bucket_id='product-images'
    and public.has_any_role(array['admin','inventory_manager']::public.employee_role[])
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
create policy product_images_manager_update on storage.objects
  for update to authenticated using (
    bucket_id='product-images' and public.has_any_role(array['admin','inventory_manager']::public.employee_role[])
  ) with check (
    bucket_id='product-images' and public.has_any_role(array['admin','inventory_manager']::public.employee_role[])
  );
create policy product_images_manager_delete on storage.objects
  for delete to authenticated using (
    bucket_id='product-images' and public.has_any_role(array['admin','inventory_manager']::public.employee_role[])
  );

create or replace function public.attach_product_image(p_product_id uuid,p_storage_path text,p_alt_text text default null)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null or not public.has_any_role(array['admin','inventory_manager']::public.employee_role[]) then
    raise exception using errcode='42501',message='Not authorized to manage product images';
  end if;
  if p_product_id is null or p_storage_path is null or p_storage_path !~ ('^'||p_product_id::text||'/[^/]+$') then
    raise exception using errcode='22023',message='Image storage path is invalid';
  end if;
  if not exists(select 1 from public.products where id=p_product_id) then
    raise exception using errcode='22023',message='Product was not found';
  end if;
  insert into public.product_images(id,product_id,storage_path,alt_text,created_by)
    values(v_id,p_product_id,p_storage_path,nullif(trim(p_alt_text),''),v_actor);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
    values(v_actor,'product_image_added','product',p_product_id,jsonb_build_object('image_id',v_id));
  return v_id;
end;
$$;
revoke all on function public.attach_product_image(uuid,text,text) from public;
grant execute on function public.attach_product_image(uuid,text,text) to authenticated;

create or replace function public.detach_product_image(p_image_id uuid)
returns text
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_path text;
  v_product_id uuid;
begin
  if v_actor is null or not public.has_any_role(array['admin','inventory_manager']::public.employee_role[]) then
    raise exception using errcode='42501',message='Not authorized to manage product images';
  end if;
  delete from public.product_images where id=p_image_id returning storage_path,product_id into v_path,v_product_id;
  if not found then raise exception using errcode='22023',message='Image was not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data)
    values(v_actor,'product_image_removed','product',v_product_id,jsonb_build_object('image_id',p_image_id));
  return v_path;
end;
$$;
revoke all on function public.detach_product_image(uuid) from public;
grant execute on function public.detach_product_image(uuid) to authenticated;

commit;

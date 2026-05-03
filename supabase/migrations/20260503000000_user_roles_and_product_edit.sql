-- Migration: introduce user roles (user/editor/admin) and product edit support.
-- Adds profiles.role, products.last_edited_{by,at} via trigger, an extra
-- products update policy for editors/admins, and two admin RPCs.

-- =========================================================================
-- 1. role on profiles
-- =========================================================================
alter table public.profiles
  add column role text not null default 'user'
  check (role in ('user', 'editor', 'admin'));

-- =========================================================================
-- 2. light edit trail on products (set by trigger, not by client)
-- =========================================================================
alter table public.products
  add column last_edited_by uuid references auth.users(id) on delete set null,
  add column last_edited_at timestamptz;

create or replace function public.products_set_edit_trail()
returns trigger
language plpgsql
as $$
begin
  new.last_edited_by = auth.uid();
  new.last_edited_at = now();
  return new;
end;
$$;

create trigger products_set_edit_trail
  before update on public.products
  for each row
  execute function public.products_set_edit_trail();

-- =========================================================================
-- 3. extra update-policy: editors/admins may update any user-source product
-- =========================================================================
create policy "products_update_user_by_editor"
  on public.products for update
  to authenticated
  using (
    source = 'user'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('editor', 'admin')
    )
  );

-- =========================================================================
-- 4. admin RPC: list all profiles with a handle (caller must be admin)
-- =========================================================================
create or replace function public.list_users_for_admin()
returns table (id uuid, handle text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.handle, p.role
    from public.profiles p
    where p.handle is not null
    order by p.handle;
end;
$$;

-- =========================================================================
-- 5. admin RPC: set role on a target user (caller must be admin, not self)
-- =========================================================================
create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role not in ('user', 'editor', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'cannot change own role' using errcode = '42501';
  end if;
  update public.profiles set role = new_role where id = target_user_id;
end;
$$;

grant execute on function public.list_users_for_admin to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;

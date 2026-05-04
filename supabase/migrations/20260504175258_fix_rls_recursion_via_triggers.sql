-- Hotfix: previous migration (20260504174110_rls_with_check_hardening.sql)
-- introduced infinite-recursion errors because each `with check` clause did
-- a SELECT on the same table the policy was attached to:
--   - profiles_update_own            → select role from public.profiles ...
--   - dishes_update_by_editor        → select created_by from public.dishes ...
--   - products_update_user_by_editor → select created_by from public.products ...
-- Postgres' RLS engine cannot resolve a self-table SELECT inside a `with check`
-- without re-entering policy evaluation, leading to "infinite recursion
-- detected in policy for relation X" on every legitimate UPDATE.
--
-- Replace each subquery-based check with a BEFORE UPDATE trigger. Triggers
-- have direct access to OLD and NEW, so no subquery is needed; the immutable-
-- column guarantee is preserved without any recursion risk.

-- =========================================================================
-- 1. profiles: revert with check, add role-immutability trigger
-- =========================================================================
alter policy "profiles_update_own" on public.profiles
  with check (id = auth.uid());

create or replace function public.profiles_protect_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    ) then
      raise exception 'role can only be changed by an admin via set_user_role()'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row
  execute function public.profiles_protect_role();

-- =========================================================================
-- 2. dishes: revert with check, add created_by-immutability trigger
-- =========================================================================
alter policy "dishes_update_by_editor" on public.dishes
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('editor','admin')
    )
  );

create or replace function public.dishes_protect_owner()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable on dishes'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger dishes_protect_owner
  before update on public.dishes
  for each row
  execute function public.dishes_protect_owner();

-- =========================================================================
-- 3. products: revert with check, add created_by + source immutability trigger
-- =========================================================================
alter policy "products_update_user_by_editor" on public.products
  with check (
    source = 'user'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('editor', 'admin')
    )
  );

create or replace function public.products_protect_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable on products'
      using errcode = '42501';
  end if;
  if new.source is distinct from old.source then
    raise exception 'source is immutable on products'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger products_protect_immutable
  before update on public.products
  for each row
  execute function public.products_protect_immutable();

-- Migration: J-E. RLS hardening — add explicit `with check` clauses to three
-- update policies so that immutable columns cannot be flipped via a direct
-- API call (i.e. PostgREST PATCH outside our UI).
--
-- Without an explicit `with check`, Postgres reuses the `using` clause for the
-- new-row check. That left three policies open to manipulation:
--   1. profiles_update_own             → user could promote self to admin
--      by sending {role:'admin'} on their own profile row
--   2. dishes_update_by_editor         → editor could hijack created_by
--   3. products_update_user_by_editor  → editor could hijack created_by
--
-- Each fix re-states the `using` invariants and adds a correlated subquery
-- that locks the immutable column to its prior value. Legitimate flows
-- (the set_user_role admin RPC) are SECURITY DEFINER and bypass RLS, so
-- those continue to work unchanged.

-- =========================================================================
-- 1. profiles_update_own: lock `role` so only admin RPC can change it
-- =========================================================================
alter policy "profiles_update_own" on public.profiles
  with check (
    id = auth.uid()
    and role = (select role from public.profiles where id = auth.uid())
  );

-- =========================================================================
-- 2. dishes_update_by_editor: lock `created_by`
-- =========================================================================
alter policy "dishes_update_by_editor" on public.dishes
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('editor','admin')
    )
    and created_by = (select created_by from public.dishes where id = dishes.id)
  );

-- =========================================================================
-- 3. products_update_user_by_editor: lock `created_by` and `source`
-- =========================================================================
alter policy "products_update_user_by_editor" on public.products
  with check (
    source = 'user'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('editor', 'admin')
    )
    and created_by = (select created_by from public.products where id = products.id)
  );

-- Migration: extend products table to host NEVO seed data alongside user-created records.
-- Adds source/nevo_code/synonyms columns, makes created_by nullable for NEVO rows,
-- updates RLS so user-CRUD never touches source='nevo' rows.

-- =========================================================================
-- Schema changes
-- =========================================================================
alter table public.products
  add column source text not null default 'user' check (source in ('nevo','user')),
  add column nevo_code text,
  add column synonyms text[];

alter table public.products alter column created_by drop not null;

create unique index products_nevo_code_idx
  on public.products (nevo_code)
  where nevo_code is not null;

-- =========================================================================
-- RLS: user-CRUD restricted to source='user'
-- =========================================================================
drop policy if exists "products_insert_authenticated" on public.products;
drop policy if exists "products_update_own" on public.products;
drop policy if exists "products_delete_own" on public.products;

create policy "products_insert_user_only"
  on public.products for insert
  to authenticated
  with check (source = 'user' and created_by = auth.uid());

create policy "products_update_own_user_only"
  on public.products for update
  to authenticated
  using (source = 'user' and created_by = auth.uid());

create policy "products_delete_own_user_only"
  on public.products for delete
  to authenticated
  using (source = 'user' and created_by = auth.uid());

-- products_select_all_authenticated stays unchanged (all users read all products).

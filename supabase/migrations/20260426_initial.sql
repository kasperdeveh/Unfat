-- Migration: initial schema for Unfat MVP
-- Tables: profiles, products (shared), entries
-- Enum: meal_type
-- RLS: enabled on all tables

-- =========================================================================
-- ENUM
-- =========================================================================
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

-- =========================================================================
-- TABLE: profiles
-- =========================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  daily_target_kcal int not null check (daily_target_kcal > 0),
  daily_max_kcal int not null check (daily_max_kcal > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

create policy "profiles_delete_own"
  on public.profiles for delete
  using (id = auth.uid());

-- =========================================================================
-- TABLE: products (shared)
-- =========================================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kcal_per_100g int not null check (kcal_per_100g > 0),
  unit_grams int check (unit_grams > 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index products_name_idx on public.products (lower(name));

alter table public.products enable row level security;

create policy "products_select_all_authenticated"
  on public.products for select
  to authenticated
  using (true);

create policy "products_insert_authenticated"
  on public.products for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "products_update_own"
  on public.products for update
  to authenticated
  using (created_by = auth.uid());

create policy "products_delete_own"
  on public.products for delete
  to authenticated
  using (created_by = auth.uid());

-- =========================================================================
-- TABLE: entries
-- =========================================================================
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  amount_grams numeric(10,2) not null check (amount_grams > 0),
  kcal int not null check (kcal >= 0),
  meal_type meal_type not null,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index entries_user_date_idx on public.entries (user_id, date);

alter table public.entries enable row level security;

create policy "entries_select_own"
  on public.entries for select
  using (user_id = auth.uid());

create policy "entries_insert_own"
  on public.entries for insert
  with check (user_id = auth.uid());

create policy "entries_update_own"
  on public.entries for update
  using (user_id = auth.uid());

create policy "entries_delete_own"
  on public.entries for delete
  using (user_id = auth.uid());

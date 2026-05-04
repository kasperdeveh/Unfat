-- Migration: handmatige favorieten voor producten en gerechten.
-- Twee aparte tabellen i.p.v. polymorfe relatie zodat foreign keys
-- echte cascade delete + integriteit afdwingen per relatie.

create table public.product_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.dish_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  dish_id    uuid not null references public.dishes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dish_id)
);

alter table public.product_favorites enable row level security;
alter table public.dish_favorites    enable row level security;

create policy "select own product favorites"
  on public.product_favorites for select
  using (auth.uid() = user_id);

create policy "insert own product favorites"
  on public.product_favorites for insert
  with check (auth.uid() = user_id);

create policy "delete own product favorites"
  on public.product_favorites for delete
  using (auth.uid() = user_id);

create policy "select own dish favorites"
  on public.dish_favorites for select
  using (auth.uid() = user_id);

create policy "insert own dish favorites"
  on public.dish_favorites for insert
  with check (auth.uid() = user_id);

create policy "delete own dish favorites"
  on public.dish_favorites for delete
  using (auth.uid() = user_id);

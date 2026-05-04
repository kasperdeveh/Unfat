-- Migration: dishes (shared recipe templates) + dish_components (ingredients)
-- + entries.dish_id (link to source dish, nullable on delete set null).
-- RLS mirrors products: shared select, owner+editor+admin can update,
-- only owner can delete. Light edit trail via two triggers.

-- =========================================================================
-- 1. dishes
-- =========================================================================
create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_meal_type meal_type,
  created_by uuid not null references auth.users(id) on delete cascade,
  last_edited_by uuid references auth.users(id) on delete set null,
  last_edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index dishes_name_idx on public.dishes (lower(name));

alter table public.dishes enable row level security;

create policy "dishes_select_all_authenticated"
  on public.dishes for select
  to authenticated
  using (true);

create policy "dishes_insert_own"
  on public.dishes for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "dishes_update_own"
  on public.dishes for update
  to authenticated
  using (created_by = auth.uid());

create policy "dishes_update_by_editor"
  on public.dishes for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('editor','admin')
    )
  );

create policy "dishes_delete_own"
  on public.dishes for delete
  to authenticated
  using (created_by = auth.uid());

-- Edit trail: server-side, same pattern as products_set_edit_trail.
create or replace function public.dishes_set_edit_trail()
returns trigger
language plpgsql
as $$
begin
  new.last_edited_by = auth.uid();
  new.last_edited_at = now();
  return new;
end;
$$;

create trigger dishes_set_edit_trail
  before update on public.dishes
  for each row
  execute function public.dishes_set_edit_trail();

-- =========================================================================
-- 2. dish_components
-- =========================================================================
create table public.dish_components (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references public.dishes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  amount_grams numeric(10,2) not null check (amount_grams > 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index dish_components_dish_id_idx on public.dish_components (dish_id);

alter table public.dish_components enable row level security;

create policy "dish_components_select_all_authenticated"
  on public.dish_components for select
  to authenticated
  using (true);

-- Insert/update/delete: only if the parent dish is editable for you.
create policy "dish_components_modify_if_dish_editable"
  on public.dish_components for all
  to authenticated
  using (
    exists (
      select 1 from public.dishes d
      where d.id = dish_components.dish_id
        and (
          d.created_by = auth.uid()
          or exists (
            select 1 from public.profiles
            where id = auth.uid() and role in ('editor','admin')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.dishes d
      where d.id = dish_components.dish_id
        and (
          d.created_by = auth.uid()
          or exists (
            select 1 from public.profiles
            where id = auth.uid() and role in ('editor','admin')
          )
        )
    )
  );

-- Component-edits implicitly touch the dish edit trail.
create or replace function public.dishes_touch_on_component_change()
returns trigger
language plpgsql
as $$
declare
  target_dish_id uuid;
begin
  target_dish_id = coalesce(new.dish_id, old.dish_id);
  update public.dishes
    set last_edited_by = auth.uid(),
        last_edited_at = now()
    where id = target_dish_id;
  return null;
end;
$$;

create trigger dish_components_touch_dish
  after insert or update or delete on public.dish_components
  for each row
  execute function public.dishes_touch_on_component_change();

-- =========================================================================
-- 3. entries.dish_id (nullable link to source dish)
-- =========================================================================
alter table public.entries
  add column dish_id uuid references public.dishes(id) on delete set null;

-- Partial index for the recents-mix query (entries with a non-null dish_id).
create index entries_user_dish_idx
  on public.entries (user_id, dish_id)
  where dish_id is not null;

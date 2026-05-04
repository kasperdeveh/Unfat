-- Follow-up: align favorites RLS policies with project conventions.
-- Original migration (20260504151548_favorites.sql) used spaced English
-- names and omitted `to authenticated`. This migration drops those six
-- policies and recreates them with snake_case names + the `to authenticated`
-- clause used by every other table in the schema.

drop policy "select own product favorites" on public.product_favorites;
drop policy "insert own product favorites" on public.product_favorites;
drop policy "delete own product favorites" on public.product_favorites;

drop policy "select own dish favorites" on public.dish_favorites;
drop policy "insert own dish favorites" on public.dish_favorites;
drop policy "delete own dish favorites" on public.dish_favorites;

create policy product_favorites_select_own
  on public.product_favorites for select
  to authenticated
  using (auth.uid() = user_id);

create policy product_favorites_insert_own
  on public.product_favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy product_favorites_delete_own
  on public.product_favorites for delete
  to authenticated
  using (auth.uid() = user_id);

create policy dish_favorites_select_own
  on public.dish_favorites for select
  to authenticated
  using (auth.uid() = user_id);

create policy dish_favorites_insert_own
  on public.dish_favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy dish_favorites_delete_own
  on public.dish_favorites for delete
  to authenticated
  using (auth.uid() = user_id);

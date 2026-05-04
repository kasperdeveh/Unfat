-- Follow-up to 20260504110039_dishes.sql:
-- 1. Replace the `for all` policy on dish_components with explicit per-command
--    policies. The `for all` form silently overlapped the existing select
--    policy and would have re-opened read access if a future migration
--    tightened the select side. Split for clarity and long-term safety.
-- 2. Reshape entries_user_dish_idx so it actually accelerates the recents
--    query (which orders entries by created_at). The original key
--    (user_id, dish_id) didn't include created_at and so wasn't usable for
--    the order-by-recent path.

-- =========================================================================
-- 1. Replace `for all` policy with explicit insert/update/delete
-- =========================================================================
drop policy if exists "dish_components_modify_if_dish_editable" on public.dish_components;

create policy "dish_components_insert_if_dish_editable"
  on public.dish_components for insert
  to authenticated
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

create policy "dish_components_update_if_dish_editable"
  on public.dish_components for update
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

create policy "dish_components_delete_if_dish_editable"
  on public.dish_components for delete
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
  );

-- =========================================================================
-- 2. Replace entries_user_dish_idx so it serves the recents-by-created_at query
-- =========================================================================
drop index if exists public.entries_user_dish_idx;

create index entries_user_dish_idx
  on public.entries (user_id, created_at desc)
  where dish_id is not null;

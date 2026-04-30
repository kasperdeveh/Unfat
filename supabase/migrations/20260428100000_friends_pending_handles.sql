-- Migration: fix friends handle visibility for pending requests
-- 20260428_friends.sql's profiles_select_own_or_friend policy required
-- status = 'accepted' to read a peer's handle. That made pending incoming
-- and outgoing requests render as "?" in the Vrienden-tab, because the
-- handle-lookup couldn't see the other party's row.
-- Loosen the policy: any friendship row (pending OR accepted) between caller
-- and target makes the target's profile readable. Privacy is preserved
-- because handles are already public-searchable via search_users().

drop policy if exists "profiles_select_own_or_friend" on public.profiles;

create policy "profiles_select_own_or_friend"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.friendships
      where (user_id_a = auth.uid() and user_id_b = profiles.id)
         or (user_id_b = auth.uid() and user_id_a = profiles.id)
    )
  );

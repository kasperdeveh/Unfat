-- Migration: profile_history table for historically correct target/max snapshots
-- Each row: from `valid_from` onwards, this user's target/max applied.
-- Looked up per day via valid_from <= day ORDER BY valid_from DESC LIMIT 1.

create table public.profile_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_target_kcal int not null check (daily_target_kcal > 0),
  daily_max_kcal int not null check (daily_max_kcal > 0),
  valid_from date not null,
  created_at timestamptz not null default now(),
  unique (user_id, valid_from)
);

create index profile_history_user_valid_from_idx
  on public.profile_history (user_id, valid_from desc);

alter table public.profile_history enable row level security;

create policy "profile_history_select_own"
  on public.profile_history for select
  using (user_id = auth.uid());

create policy "profile_history_insert_own"
  on public.profile_history for insert
  with check (user_id = auth.uid());

create policy "profile_history_update_own"
  on public.profile_history for update
  using (user_id = auth.uid());

create policy "profile_history_delete_own"
  on public.profile_history for delete
  using (user_id = auth.uid());

-- One-time seed for existing users from MVP phase: one row per profile,
-- valid_from = profiles.created_at::date, with current target/max.
insert into public.profile_history (user_id, daily_target_kcal, daily_max_kcal, valid_from)
select id, daily_target_kcal, daily_max_kcal, created_at::date
from public.profiles
on conflict (user_id, valid_from) do nothing;

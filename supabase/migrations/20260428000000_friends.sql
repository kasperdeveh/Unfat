-- Migration: friends sub-project D-A
-- Adds: profiles.handle + share_level, friendships table, my_friends view,
-- and SECURITY DEFINER RPCs (search_users, send_friend_request,
-- respond_friend_request, unfriend, get_friend_day, check_handle_available).
-- Also overrides profiles select-policy so accepted friends can read each
-- other's handle/share_level.

-- =========================================================================
-- profiles uitbreiding
-- =========================================================================
alter table public.profiles add column handle text;
alter table public.profiles add column share_level text not null default 'entries'
  check (share_level in ('none', 'total', 'per_meal', 'entries'));
alter table public.profiles add constraint profiles_handle_format
  check (handle is null or handle ~ '^[A-Za-z0-9_-]{3,20}$');
create unique index profiles_handle_lower_idx
  on public.profiles (lower(handle))
  where handle is not null;

-- =========================================================================
-- friendships tabel
-- =========================================================================
create table public.friendships (
  user_id_a uuid not null references auth.users(id) on delete cascade,
  user_id_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_id_a, user_id_b),
  check (user_id_a < user_id_b),
  check (requested_by in (user_id_a, user_id_b)),
  check (
    (status = 'accepted' and accepted_at is not null)
    or (status = 'pending' and accepted_at is null)
  )
);

alter table public.friendships enable row level security;

create policy "friendships_select_own_pair"
  on public.friendships for select
  using (auth.uid() in (user_id_a, user_id_b));

create policy "friendships_insert_as_requester"
  on public.friendships for insert
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and auth.uid() in (user_id_a, user_id_b)
  );

create policy "friendships_update_accept_only"
  on public.friendships for update
  using (
    auth.uid() in (user_id_a, user_id_b)
    and auth.uid() != requested_by
  );

create policy "friendships_delete_either_party"
  on public.friendships for delete
  using (auth.uid() in (user_id_a, user_id_b));

-- =========================================================================
-- profiles select-policy: own row OR accepted friend's row
-- (vervangt profiles_select_own uit 20260426_initial.sql)
-- =========================================================================
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own_or_friend"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((user_id_a = auth.uid() and user_id_b = profiles.id)
          or (user_id_b = auth.uid() and user_id_a = profiles.id))
    )
  );

-- =========================================================================
-- view: my_friends — verbergt case-when uit app-code
-- =========================================================================
create view public.my_friends as
select
  case when user_id_a = auth.uid() then user_id_b else user_id_a end as friend_id,
  status,
  requested_by,
  created_at,
  accepted_at
from public.friendships
where auth.uid() in (user_id_a, user_id_b);

-- =========================================================================
-- RPC: check_handle_available — bypasses RLS to detect global uniqueness
-- =========================================================================
create or replace function public.check_handle_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(handle) = lower(candidate)
      and id != coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;

grant execute on function public.check_handle_available(text) to authenticated;

-- =========================================================================
-- RPC: search_users
-- =========================================================================
create or replace function public.search_users(query text)
returns table(user_id uuid, handle text, friendship_status text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.handle,
    case
      when f.status = 'accepted' then 'accepted'
      when f.status = 'pending' and f.requested_by = auth.uid() then 'pending_outgoing'
      when f.status = 'pending' and f.requested_by != auth.uid() then 'pending_incoming'
      else null
    end as friendship_status
  from public.profiles p
  left join public.friendships f
    on f.user_id_a = least(p.id, auth.uid())
   and f.user_id_b = greatest(p.id, auth.uid())
  where p.handle is not null
    and lower(p.handle) like lower(query) || '%'
    and p.id != auth.uid()
  limit 20;
$$;

grant execute on function public.search_users(text) to authenticated;

-- =========================================================================
-- RPC: send_friend_request — idempotent met auto-accept
-- =========================================================================
create or replace function public.send_friend_request(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  a uuid := least(caller, target_user_id);
  b uuid := greatest(caller, target_user_id);
  existing record;
  target_handle text;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  if caller = target_user_id then
    raise exception 'not_self';
  end if;

  select handle into target_handle from public.profiles where id = target_user_id;
  if target_handle is null then
    raise exception 'invalid_target';
  end if;

  select * into existing
  from public.friendships
  where user_id_a = a and user_id_b = b;

  if not found then
    insert into public.friendships (user_id_a, user_id_b, requested_by, status)
    values (a, b, caller, 'pending');
    return 'requested';
  elsif existing.status = 'accepted' then
    return 'already_friends';
  elsif existing.status = 'pending' and existing.requested_by = caller then
    return 'already_pending';
  elsif existing.status = 'pending' and existing.requested_by != caller then
    update public.friendships
    set status = 'accepted', accepted_at = now()
    where user_id_a = a and user_id_b = b;
    return 'auto_accepted';
  end if;

  return 'unknown';
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;

-- =========================================================================
-- RPC: respond_friend_request
-- =========================================================================
create or replace function public.respond_friend_request(other_user_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  a uuid := least(caller, other_user_id);
  b uuid := greatest(caller, other_user_id);
  existing record;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select * into existing from public.friendships
  where user_id_a = a and user_id_b = b;

  if not found then
    raise exception 'not_found';
  end if;
  if existing.status != 'pending' then
    raise exception 'not_pending';
  end if;
  if existing.requested_by = caller then
    raise exception 'cannot_respond_to_own_request';
  end if;

  if accept then
    update public.friendships
    set status = 'accepted', accepted_at = now()
    where user_id_a = a and user_id_b = b;
  else
    delete from public.friendships
    where user_id_a = a and user_id_b = b;
  end if;
end;
$$;

grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- =========================================================================
-- RPC: unfriend (idempotent — no error if missing)
-- =========================================================================
create or replace function public.unfriend(other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  a uuid := least(caller, other_user_id);
  b uuid := greatest(caller, other_user_id);
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.friendships
  where user_id_a = a and user_id_b = b;
end;
$$;

grant execute on function public.unfriend(uuid) to authenticated;

-- =========================================================================
-- RPC: get_friend_day — respect share_level
-- =========================================================================
create or replace function public.get_friend_day(friend_user_id uuid, day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  a uuid := least(caller, friend_user_id);
  b uuid := greatest(caller, friend_user_id);
  is_friend boolean;
  v_handle text;
  v_share_level text;
  v_target int;
  v_max int;
  v_total_kcal int;
  v_per_meal jsonb;
  v_entries jsonb;
  result jsonb;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select exists(
    select 1 from public.friendships
    where user_id_a = a and user_id_b = b and status = 'accepted'
  ) into is_friend;
  if not is_friend then
    raise exception 'not_friends';
  end if;

  select handle, share_level into v_handle, v_share_level
  from public.profiles where id = friend_user_id;

  result := jsonb_build_object(
    'share_level', v_share_level,
    'handle', v_handle
  );

  if v_share_level = 'none' then
    return result;
  end if;

  select daily_target_kcal, daily_max_kcal into v_target, v_max
  from public.profile_history
  where user_id = friend_user_id and valid_from <= day
  order by valid_from desc
  limit 1;

  select coalesce(sum(kcal), 0)::int into v_total_kcal
  from public.entries
  where user_id = friend_user_id and date = day;

  result := result || jsonb_build_object(
    'target', v_target,
    'max', v_max,
    'total_kcal', v_total_kcal
  );

  if v_share_level in ('per_meal', 'entries') then
    v_per_meal := jsonb_build_object(
      'breakfast', (select coalesce(sum(kcal), 0)::int from public.entries
                    where user_id = friend_user_id and date = day and meal_type = 'breakfast'),
      'lunch',     (select coalesce(sum(kcal), 0)::int from public.entries
                    where user_id = friend_user_id and date = day and meal_type = 'lunch'),
      'dinner',    (select coalesce(sum(kcal), 0)::int from public.entries
                    where user_id = friend_user_id and date = day and meal_type = 'dinner'),
      'snack',     (select coalesce(sum(kcal), 0)::int from public.entries
                    where user_id = friend_user_id and date = day and meal_type = 'snack')
    );
    result := result || jsonb_build_object('per_meal', v_per_meal);
  end if;

  if v_share_level = 'entries' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_name', p.name,
      'amount_grams', e.amount_grams,
      'kcal', e.kcal,
      'meal_type', e.meal_type
    ) order by e.created_at), '[]'::jsonb) into v_entries
    from public.entries e
    join public.products p on p.id = e.product_id
    where e.user_id = friend_user_id and e.date = day;
    result := result || jsonb_build_object('entries', v_entries);
  end if;

  return result;
end;
$$;

grant execute on function public.get_friend_day(uuid, date) to authenticated;

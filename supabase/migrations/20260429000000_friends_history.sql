-- Migration: friends history (sub-project D-vervolg)
-- Updates get_friend_day to include entry id + product_id (for copy flow) and
-- friend's profile created_at (for ‹ › nav boundary). Adds get_friend_period
-- RPC for week/month views.

-- =========================================================================
-- get_friend_day: include id, product_id in entries, friend_created_at top-level
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
  v_friend_created date;
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

  select handle, share_level, created_at::date
    into v_handle, v_share_level, v_friend_created
    from public.profiles where id = friend_user_id;

  result := jsonb_build_object(
    'share_level', v_share_level,
    'handle', v_handle,
    'friend_created_at', v_friend_created
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
      'id', e.id,
      'product_id', e.product_id,
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

-- =========================================================================
-- get_friend_period: per-day total_kcal + target/max for a date range
-- =========================================================================
create or replace function public.get_friend_period(
  friend_user_id uuid,
  start_date date,
  end_date date
)
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
  v_friend_created date;
  v_days jsonb;
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

  select handle, share_level, created_at::date
    into v_handle, v_share_level, v_friend_created
    from public.profiles where id = friend_user_id;

  result := jsonb_build_object(
    'share_level', v_share_level,
    'handle', v_handle,
    'friend_created_at', v_friend_created
  );

  if v_share_level = 'none' then
    return result;
  end if;

  with date_series as (
    select generate_series(start_date, end_date, interval '1 day')::date as d
  ),
  totals as (
    select date as d, coalesce(sum(kcal), 0)::int as total_kcal
    from public.entries
    where user_id = friend_user_id
      and date between start_date and end_date
    group by date
  ),
  snapshots as (
    select ds.d,
      (select daily_target_kcal from public.profile_history
        where user_id = friend_user_id and valid_from <= ds.d
        order by valid_from desc limit 1) as target,
      (select daily_max_kcal from public.profile_history
        where user_id = friend_user_id and valid_from <= ds.d
        order by valid_from desc limit 1) as max
    from date_series ds
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', ds.d,
    'total_kcal', coalesce(t.total_kcal, 0),
    'target', s.target,
    'max', s.max
  ) order by ds.d), '[]'::jsonb)
  into v_days
  from date_series ds
  left join totals t on t.d = ds.d
  left join snapshots s on s.d = ds.d;

  result := result || jsonb_build_object('days', v_days);
  return result;
end;
$$;

grant execute on function public.get_friend_period(uuid, date, date) to authenticated;

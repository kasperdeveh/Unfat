-- Migration: fix ambiguous column references in admin RPCs.
-- list_users_for_admin() declares OUT parameters (id, handle, role) via its
-- `returns table (...)` clause, so any unqualified reference to those names
-- in the body collides with profiles columns ("42702 column reference is
-- ambiguous"). The admin-check IF in the body lacked a table alias and
-- triggered the error. Add aliases consistently. set_user_role gets the
-- same alias treatment for uniformity (no bug there, just patroon-match).

create or replace function public.list_users_for_admin()
returns table (id uuid, handle text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.handle, p.role
    from public.profiles p
    where p.handle is not null
    order by p.handle;
end;
$$;

create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role not in ('user', 'editor', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'cannot change own role' using errcode = '42501';
  end if;
  update public.profiles set role = new_role where id = target_user_id;
end;
$$;

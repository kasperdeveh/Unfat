-- Hardening: function-level security improvements flagged by the
-- Supabase Database Advisor (security tab) on 2026-05-04.
--
-- Three independent fixes:
--   A. Set explicit search_path on existing trigger functions that lacked
--      one. Without `set search_path`, a caller could prepend a custom
--      schema and resolve identifiers (table names, function calls) to
--      attacker-controlled objects. Defense-in-depth — none of these
--      functions take user input as identifiers, but the project standard
--      is now: every function gets `set search_path = public`.
--   B. Revoke the default PUBLIC execute privilege on SECURITY DEFINER
--      RPCs. Postgres grants execute-to-public on every new function;
--      our migrations explicitly granted to `authenticated` but never
--      removed the public default. Result: anonymous (`anon`) clients
--      could call /rest/v1/rpc/<func> and the call would only fail at
--      the body's `if caller is null` guard. Now blocked at the gateway.
--   C. profiles_protect_role doesn't need SECURITY DEFINER. The body
--      reads the caller's own role, which the SELECT policy already
--      permits via the own-row branch of profiles_select_own_or_friend.
--      INVOKER is sufficient and removes one Advisor warning.
--
-- Trigger functions are not subject to EXECUTE privilege checks at trigger
-- fire time (the engine invokes them internally), so the revokes here only
-- close the REST-call surface — the triggers themselves keep working.

-- =========================================================================
-- A. Set search_path on existing trigger functions
-- =========================================================================
alter function public.set_updated_at() set search_path = public;
alter function public.products_set_edit_trail() set search_path = public;
alter function public.dishes_set_edit_trail() set search_path = public;
alter function public.dishes_touch_on_component_change() set search_path = public;
alter function public.dishes_protect_owner() set search_path = public;
alter function public.products_protect_immutable() set search_path = public;

-- =========================================================================
-- B. Revoke PUBLIC execute on SECURITY DEFINER RPCs
-- (the explicit `to authenticated` grants made in the original migrations
--  remain — only the implicit PUBLIC default is removed)
-- =========================================================================
revoke execute on function public.check_handle_available(text) from public, anon;
revoke execute on function public.get_friend_day(uuid, date) from public, anon;
revoke execute on function public.get_friend_period(uuid, date, date) from public, anon;
revoke execute on function public.list_users_for_admin() from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.search_users(text) from public, anon;
revoke execute on function public.send_friend_request(uuid) from public, anon;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
revoke execute on function public.unfriend(uuid) from public, anon;

-- Trigger functions: not callable as RPCs (the DB engine invokes them).
-- Revoke from public/anon so they don't show up under /rest/v1/rpc/.
revoke execute on function public.set_updated_at() from public, anon;
revoke execute on function public.products_set_edit_trail() from public, anon;
revoke execute on function public.dishes_set_edit_trail() from public, anon;
revoke execute on function public.dishes_touch_on_component_change() from public, anon;
revoke execute on function public.dishes_protect_owner() from public, anon;
revoke execute on function public.products_protect_immutable() from public, anon;
revoke execute on function public.profiles_protect_role() from public, anon;

-- =========================================================================
-- C. profiles_protect_role: SECURITY DEFINER → INVOKER
-- The function reads `auth.uid()`'s own role, which is visible to the
-- caller via the existing SELECT policy (own-row branch). DEFINER was
-- unnecessary and only widened the risk surface (advisor flagged it as
-- callable-by-anon and callable-by-authenticated).
-- =========================================================================
alter function public.profiles_protect_role() security invoker;

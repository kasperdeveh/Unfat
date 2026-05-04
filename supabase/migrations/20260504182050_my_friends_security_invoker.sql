-- Hardening: switch the my_friends view to security_invoker semantics.
--
-- In Postgres 15+, views default to running under the view-creator's role
-- (typically `postgres`, which has BYPASSRLS). That means RLS on the
-- underlying `friendships` table is not enforced when querying the view —
-- the only protection is the `where auth.uid() in (...)` clause in the view
-- body itself. With security_invoker on, the view runs as the calling user,
-- so RLS on `friendships` is also evaluated. Defense-in-depth: if the
-- in-view filter ever regresses, the policy still blocks unauthorized rows.
--
-- Flagged by Supabase Database Advisor.

alter view public.my_friends set (security_invoker = on);

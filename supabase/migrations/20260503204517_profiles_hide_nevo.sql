-- Migration: add hide_nevo preference to profiles.
-- Used by add-food page to filter out NEVO-products in Recents and search results.

alter table public.profiles
  add column hide_nevo boolean not null default false;

-- Migration: allow fractional unit_grams (e.g. 75.5g per stuk for an egg).
-- Existing integer values (NEVO seed + user products) cast losslessly to numeric.
-- The column-level CHECK constraint (unit_grams > 0) automatically applies to
-- the new numeric type.

alter table public.products
  alter column unit_grams type numeric(10,2)
  using unit_grams::numeric(10,2);

-- Migration: targeted unit_grams updates for NEVO fruit variants missed in
-- the initial seed (Appel Elstar/Jonagold, Peer m schil, Perzik m schil,
-- Kiwi gele/gem).
--
-- Source of truth = scripts/data/nevo-unit-grams.json. Future re-imports of
-- the seed via scripts/import-nevo.js will produce these values directly
-- (the script now uses ON CONFLICT DO UPDATE).

update public.products set unit_grams = 150 where nevo_code in ('2751','2752','2753','2754');
update public.products set unit_grams = 170 where nevo_code = '2748';
update public.products set unit_grams = 130 where nevo_code = '5079';
update public.products set unit_grams = 70  where nevo_code in ('3219','5120');

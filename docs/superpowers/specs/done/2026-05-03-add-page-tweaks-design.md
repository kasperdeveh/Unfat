# Toevoegen-pagina UX-tweaks — design

**Datum:** 2026-05-03
**Sub-project:** M. Toevoegen-pagina UX-tweaks
**Status:** spec → plan

## Doel

Twee kleine UX-verbeteringen op de toevoegen-pagina (`src/js/views/add-food.js`):

1. **NEVO-toggle** — gebruiker kan NEVO-producten verbergen via een chip onder de zoekbalk; voorkeur persist per user (cross-device).
2. **Recents inkorten** — "Laatst gegeten" toont default 8 items i.p.v. 20, met een "Meer tonen"-knop. De "+ Nieuw product aanmaken"-knop wordt daardoor weer direct zichtbaar.

## Out of scope

- "Vaak gegeten" sectie of automatische detectie van veelgegeten producten (zie sub-project L)
- Favorieten / ster-producten (zie sub-project L)
- Gerechten/maaltijden bundelen (zie sub-project K)
- NEVO-toggle in Settings (besloten: chip-only is voldoende)
- NEVO-badge of filter buiten de toevoegen-pagina (day, history, friend-views, edit-product-sheet blijven ongewijzigd)

## Feature 1 — NEVO-toggle

### Datamodel

```sql
alter table public.profiles
  add column hide_nevo boolean not null default false;
```

- **Default `false`** = NEVO zichtbaar (huidig gedrag, geen verrassing voor bestaande users).
- **`not null`** = altijd een definitieve waarde, geen `null`-handling in UI.
- Bestaande RLS op `profiles` (own row read/update) dekt dit automatisch — geen extra policy nodig.

Migration: `supabase/migrations/20260503030000_profiles_hide_nevo.sql`.

### Persistence

Nieuwe DB-functie in `src/js/db/profiles.js`:

```js
export async function updateMyHideNevo(hide) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('profiles')
    .update({ hide_nevo: hide })
    .eq('id', session.user.id);
  if (error) throw error;
}
```

`getMyProfile()` gebruikt al `select('*')`, dus de nieuwe kolom komt automatisch mee bij het laden van het profiel.

### UI

Chip onder de zoekbalk in `add-food.js`:

- **Default state (`hide_nevo=false`)**: chip dim (grijze rand, lichte tekst), label "NEVO producten verbergen".
- **Actieve state (`hide_nevo=true`)**: chip accent-groen (zelfde `--accent` als andere accent-elementen), label "NEVO producten tonen".
- Klik op chip → optimistisch togglen (UI direct aanpassen + lijsten herfilteren) + `updateMyHideNevo()` async.
- Bij fail: revert chip-state + `showToast()` uit `ui.js` ("Kon voorkeur niet opslaan").
- A11y: `<button>` element met `aria-pressed` dat de huidige state weergeeft.

### Filter-logica

```js
const visibleRecents  = hideNevo ? recentProducts.filter(p => p.source !== 'nevo') : recentProducts;
const visibleProducts = hideNevo ? allProducts.filter(p => p.source !== 'nevo')    : allProducts;
```

Originele arrays worden niet gemuteerd; afgeleide variabelen worden bij elke render opnieuw berekend. Zo werken Recents-weergave én scoring van zoekresultaten over dezelfde gefilterde dataset. Re-render zodra de chip togglet — geen DB-rondreis.

### NEVO-badge in product-rijen

Kleine grijze pill achter de productnaam in elke rij waar `product.source === 'nevo'`:

```html
<span class="badge-nevo">NEVO</span>
```

Scope: alleen `add-food`-pagina (Recents + zoekresultaten). Andere views krijgen de badge niet — daar is de keuze al gemaakt en zou de badge alleen ruis zijn.

## Feature 2 — Recents inkorten

### Constants

In `add-food.js`:

- `TOP_N_DEFAULT = 20` blijft ongewijzigd (DB-call haalt nog steeds 20 unieke producten op).
- Nieuwe `RECENTS_VISIBLE = 8` voor de initiële UI-weergave.

### State

Lokale view-state `recentsExpanded = false`, **niet** persistent. Bij heropenen van de pagina start de lijst weer collapsed op 8 — voorspelbaar gedrag, geen verrassende lange lijst na navigatie terug.

### "Meer tonen"-knop

- Verschijnt alleen als `recentProducts.length > RECENTS_VISIBLE` én `recentsExpanded === false`.
- Tekst: `Meer tonen (X)` waar X = `recentProducts.length - RECENTS_VISIBLE`.
- Klik → `recentsExpanded = true`, knop verdwijnt, lijst toont alles tot `TOP_N_DEFAULT`.
- Geen "Minder tonen"-knop terug — eenvoud boven volledigheid; bij heropen-pagina collapsed de lijst sowieso weer.
- Stijl: subtiele knop tussen Recents en "+ Nieuw product aanmaken" — niet-accent (anders concurreert het visueel met de + knop).

## Edge cases en non-issues

- **Service worker**: bump `CACHE_NAME` van `unfat-v29` → `unfat-v30` bij implementatie. Nieuwe JS + CSS rechtvaardigt een bump.
- **Performance**: filter is client-side over max ~2300 producten — onbeduidend (single-pass JS-filter, <1ms).
- **Optimistic toggle fail**: revert + toast (geen retry-loop; user kan opnieuw klikken).
- **Bestaande gebruikers**: kolom default `false` betekent geen gedragsverandering totdat ze de chip aanzetten.
- **Settings-pagina**: geen wijziging. NEVO-attributielink (RIVM) blijft staan.
- **Andere views** (day, history, friend-day/week/month, edit-product-sheet): geen badge, geen filter.

## Wijzigingen per bestand

| Bestand | Wijziging |
|---|---|
| `supabase/migrations/20260503030000_profiles_hide_nevo.sql` | nieuw — kolom toevoegen |
| `src/js/db/profiles.js` | `updateMyHideNevo()` toevoegen |
| `src/js/views/add-food.js` | chip-render, filter-logica, Recents collapse/expand, NEVO-badge in rijen |
| `src/css/style.css` | regels voor `.chip` (states) en `.badge-nevo` |
| `src/sw.js` | `CACHE_NAME` bump v29 → v30 |

## Test-plan (handmatig in browser)

1. Verse user (default state) → chip dim, NEVO-rijen zichtbaar in Recents en in zoekresultaten.
2. Chip aan → NEVO-rijen verdwijnen uit Recents én uit live zoekresultaten.
3. Refresh van de pagina → chip-state behouden (komt uit DB).
4. Op tweede device (PWA op telefoon) → zelfde state als op desktop (cross-device persist test).
5. Recents-lijst toont eerst 8; "Meer tonen (12)" → toont alle 20.
6. Navigeer weg en kom terug → Recents start weer collapsed op 8.
7. NEVO-badge alleen zichtbaar bij rijen met `source='nevo'`, alleen op de toevoegen-pagina.

## ROADMAP-impact

Nieuw sub-project **M. Toevoegen-pagina UX-tweaks**. Wordt na implementatie verplaatst naar de "Afgerond ✅"-tabel met datum-stempel.

# Sub-project K — Gerechten

**Status:** Brainstorm afgerond — klaar voor review
**Datum start:** 2026-05-04
**Bouwt voort op:**
- F-A (NEVO seed + user-products in shared tabel) — afgerond 2026-04-30
- J-A (rollen + edit-trail op products) — afgerond 2026-05-03
- M (NEVO-toggle + Recents-collapse) — afgerond 2026-05-03

## Scope

Gerechten = bundel van producten als template (recept), die bij loggen expandeert naar **N losse `entries` rijen** — één per ingrediënt. Doel: snel + flexibel loggen van terugkerende maaltijden ("Spaghetti bolognese", "Tosti ham-kaas") zonder dat je elke ingrediënt los hoeft op te zoeken, met optie om per keer ingrediënten weg te laten of de portie te schalen.

Gerechten zijn **gedeeld** zoals products: alle authenticated users kunnen elkaars gerechten zoeken/loggen, alleen de aanmaker kan editen/deleten (editors/admins kunnen ook anderhand editen, consistent met J-A). Bouwt mee aan een gedeelde recepten-database.

Een logbare-eenheid in de zoekpagina is dus óf een product óf een gerecht. Bij tap op een gerecht-rij open je een aparte loggen-flow die expand-entries genereert; bij tap op een product de bestaande portion-flow.

**Niet in deze ronde** (geparkeerd):
- **Custom portie-multiplier** — alleen presets ½×/1×/1½×/2×. Vrije input ("0,75×") komt later, zodra we zien dat presets onvoldoende zijn.
- **Per-ingrediënt portie-aanpassing tijdens loggen** — alleen weglaten-checkbox bij loggen. Wil je 80g pasta i.p.v. 100g voor één keer? Dat doe je achteraf via swipe-edit op de entry in de dag-view (bestaande flow).
- **Recursieve gerechten** — een gerecht heeft alleen products als ingrediënten, geen sub-gerechten. Voorkomt cycle-detectie en sterk geneste UI.
- **Gerechten favoriet maken (ster)** — onderdeel van sub-project L.
- **Gerecht-statistieken** ("hoeveel keer heb ik dit gerecht gegeten?") — onderdeel van sub-project H.
- **NEVO-rijen als gerecht-template gebruiken** — `source='nevo'` is producten-only.

## Beslissingen

### Datamodel: twee nieuwe tabellen + dish_id op entries

Drie schemawijzigingen:

**1. `dishes`** — gerecht-template
| kolom | type | bijzonderheden |
|---|---|---|
| `id` | uuid pk | default `gen_random_uuid()` |
| `name` | text not null | |
| `default_meal_type` | meal_type | nullable; voorinvulling bij loggen |
| `created_by` | uuid not null | fk `auth.users on delete cascade` |
| `last_edited_by` | uuid | fk `auth.users on delete set null`, gevuld door trigger |
| `last_edited_at` | timestamptz | gevuld door trigger |
| `created_at` | timestamptz not null | default `now()` |

Index: `dishes_name_idx on (lower(name))` voor zoek-matching.

**2. `dish_components`** — ingrediënten van een gerecht
| kolom | type | bijzonderheden |
|---|---|---|
| `id` | uuid pk | default `gen_random_uuid()` |
| `dish_id` | uuid not null | fk `dishes on delete cascade` |
| `product_id` | uuid not null | fk `products on delete restrict` |
| `amount_grams` | numeric(10,2) not null | check `> 0` |
| `position` | int not null | default 0, sortering in UI |
| `created_at` | timestamptz not null | default `now()` |

**Géén unique-constraint** op `(dish_id, product_id)` — een gebruiker mag bewust 2× hetzelfde product opnemen (bv. "boter voor sauteren" + "boter voor garnering"). Position bepaalt volgorde in UI.

Index: `dish_components_dish_id_idx on (dish_id)` voor join-snelheid.

**3. `entries.dish_id`** — link van een gelogde entry naar het gerecht waaruit ze kwam
- Nullable kolom, fk `dishes on delete set null`
- Bij gerecht-template-delete blijven de gelogde entries staan (verwijzen nog steeds naar `products`); ze verliezen alleen hun groepering.
- Gebruikt voor: 
  - "Laatst gegeten gerechten" in de zoek-pagina (recents)
  - Toekomstige groepering in dag-view (geparkeerd voor latere iteratie)

Index: `entries_user_dish_idx on (user_id, dish_id)` — partial waar `dish_id is not null` — voor recents-query.

### RLS: gedeeld met edit-trail (zoals products)

**`dishes`:**
- `select`: alle authenticated (gedeeld)
- `insert`: `created_by = auth.uid()`
- `update`: `created_by = auth.uid() OR profiles.role IN ('editor','admin')`
- `delete`: alléén `created_by = auth.uid()` — editors/admins kunnen ook **niet** verwijderen, consistent met J-B (editor-delete op producten is uitgesteld). Wil een editor een joke-gerecht onschadelijk maken? Voor nu: corrigeren via edit (naam aanpassen, ingrediënten goedzetten) of laten staan.

**`dish_components`:**
- `select`: alle authenticated
- `insert/update/delete`: alleen als de parent-`dish` editbaar is voor jou. Geïmplementeerd via subquery (`exists (select 1 from dishes where id = dish_components.dish_id and (created_by = auth.uid() or role = editor/admin))`).

**Edit-trail trigger** op `dishes`: trigger `dishes_set_edit_trail` vult `last_edited_by = auth.uid()` en `last_edited_at = now()` op elke update — zoals het al gaat bij `products`.

**Component-edits → edit-trail wordt server-side bijgewerkt.** Wijzigingen op `dish_components` zijn impliciet wijzigingen aan het gerecht. Een tweede trigger `dishes_touch_on_component_change` op `dish_components` (AFTER INSERT/UPDATE/DELETE) updatet `dishes.last_edited_by/at` voor de bijbehorende `dish_id`. Houdt de trail consistent zonder dat de client een aparte dish-update hoeft mee te sturen.

### Snapshot-model: gerecht-edit beïnvloedt geen al gelogde entries

Wijzigingen aan een gerecht-template (naam, ingrediënten, portie) gelden alleen voor *toekomstige* logs. Al gelogde entries blijven onveranderd — ze zijn losse `entries` rijen met hun eigen `amount_grams`/`kcal`. `entries.dish_id` is alleen een groepering-pointer, geen live-gekoppelde projectie.

Reden: simpelste model, sluit aan bij hoe entries nu werken (snapshot bij creation), voorkomt history-rewrite. Versionering van gerecht-templates is niet nodig voor MVP.

### UI-architectuur: één unified zoekpagina, segmented filter

Drie schermwijzigingen + drie nieuwe schermen.

**A. Zoekpagina** (`add-food.js`, gewijzigd)
- Search-input bovenaan (ongewijzigd)
- **Nieuwe chiprow met 2 elementen:**
  1. Segmented control (3 mutex-keuzes): `Alles` | `Producten` | `Gerechten` — default `Alles`. Lokaal aan deze sessie (geen profile-state).
  2. NEVO-chip — bestaand, blijft via `profiles.hide_nevo`. Disabled/verborgen wanneer segment `Gerechten` actief is (NEVO-rijen zijn altijd producten).
- **Resultaten** mengen producten + gerechten op één lijst:
  - Producten: zoals nu, optionele NEVO-badge
  - Gerechten: nieuwe `GERECHT`-badge (groen, als NEVO-badge)
- **Recents (Laatst gegeten)** mengt producten + gerechten — query uitgebreid: ook `entries.dish_id`-distinct ophalen voor de laatste N. Recent-gerecht-row gedraagt zich als gerecht (tap = loggen-flow).
- **Twee dashed-knoppen onderaan**:
  - `+ Nieuw product aanmaken` (bestaand → `#/add/new`)
  - `+ Nieuw gerecht aanmaken` (nieuw → `#/dish/new`)
- Tap op product-rij → `#/add/portion?product=…` (bestaand)
- Tap op gerecht-rij → `#/dish/log?dish=…&meal=…&date=…` (nieuw)

**B. Aanmaken/bewerken-pagina** (`#/dish/new`, `#/dish/edit?dish=…` — beide nieuw, gedeelde view `dish-builder.js`)
- Header: "Nieuw gerecht" / "Gerecht bewerken" + back
- Naam-input (text)
- Default-maaltijd-segment: `Geen` | `🌅` | `🥗` | `🍽` | `🍪` (default Geen)
- Ingrediënten-lijst (initieel leeg bij `new`):
  - Per row: ingrediënt-naam + portie. Weergave-formaat:
    - Product met `unit_grams` en de portie is een veelvoud daarvan → "1 stuk (75g)"
    - Anders → "100g"
    - In de DB slaan we alleen `amount_grams` op (geen input-type-snapshot); het stuks-formaat is afgeleid bij weergave.
  - Tap = open edit-component-sheet (wijzig portie via Gram/Stuks-toggle of verwijder)
  - Verwijder-knop in de sheet (rode 🗑)
- `+ Ingrediënt toevoegen` dashed-knop (groene-stijl)
  - Opent `dish-component-sheet.js` (hergebruikt zoek-flow, daarna portie-input met Gram/Stuks-toggle zoals `add-food-portion`)
  - Bij `Voeg toe` → component verschijnt onderaan de lijst (`position` = volgnummer)
  - Zoek in de sheet: alléén producten — segmented-control zit hier níet (recursie geweerd, en het zou verwarrend zijn om gerechten in een gerecht-builder te tonen). NEVO-chip blijft wel beschikbaar.
- Live-totaal (sum van components × kcal_per_100g): "Totaal: NNN kcal"
- `Opslaan` (primary) — disabled als minder dan 1 component of naam leeg
- `Verwijderen` (rode danger-button) — alleen op `edit`-modus, alleen voor eigenaar of editor/admin
  - Confirm-dialog (zoals settings-uitloggen)
  - Cascade: dish_components weg, entries.dish_id → null

**C. Loggen-pagina** (`#/dish/log` — nieuw, view `dish-log.js`)
- Header: "Hoeveelheid" + back, gerecht-naam als subtitle
- Header rechts: ✏-knop (alleen voor eigenaar/editor/admin) — opent `#/dish/edit?dish=…`
- Hero: gerecht-naam + live totaal-kcal (ververst bij portie-toggle of vink-uit)
- Portie-segmented (4 presets): `½×` | `1×` | `1½×` | `2×` — default `1×`
- Ingrediënten-lijst met checkboxes (default allemaal aan):
  - Tap-rij = toggle vink (line-through bij uit)
  - Per row: vink + naam + effectieve portie + kcal. Effectieve portie = `component.amount_grams × multiplier`, weergave volgens dezelfde "stuks (Ng)" / "Ng" regel als de builder.
- Maaltijd-grid (default: gerecht.default_meal_type, anders guessMeal())
- Datum: zoals add-food-portion (params.date, anders vandaag)
- `Toevoegen — NNN kcal` primary-knop, disabled als 0 vinkjes aan
- Save: bulk-insert van entries — voor elk aangevinkt component:
  - `amount_grams = component.amount_grams × multiplier`
  - `kcal = round(amount_grams × product.kcal_per_100g / 100)`
  - `meal_type`, `date`, `dish_id = gerecht.id`
- Eén round-trip: één `insert ... returning` met meerdere rows.

### Edit-flow: aparte route, geen sheet

Bewerken van een gerecht-template gebeurt op een eigen pagina (`#/dish/edit`), niet in een bottom-sheet — een gerecht heeft te veel state (naam, default-maaltijd, N ingrediënten) voor een sheet, en het past natuurlijk in een page omdat aanmaken óók een page is. Dezelfde view (`dish-builder.js`) handelt beide modi op basis van `params.dish`.

Verwijderen zit op de edit-pagina (rode danger-button onderaan), met een confirm-dialog. Niet swipe-to-delete in een lijst, want we hebben geen gerecht-overzicht-pagina (gerechten zoek je via de zoekpagina).

### Recents-query: producten + gerechten gemengd

Vandaag haalt `listRecentProductsForUser` de laatste N entries en distinct'd op `product_id`. Nieuwe versie haalt entries op en groept op `coalesce(dish_id, product_id::text)` als sleutel:
- Als `dish_id is not null` → één recent-gerecht-row met dish-data
- Als `dish_id is null` → één recent-product-row zoals nu

Resultaat is een gemengde lijst (max N, default 5 — consistent met M), gesorteerd op meest recent gelogd. Eén product en het gerecht waarin hetzelfde product zit komen apart in de lijst (verschillende sleutels).

### Validatie en edge-cases

- **Aanmaken zonder naam of zonder ingrediënten**: `Opslaan` disabled. Inline-error "Naam vereist" / "Voeg minstens één ingrediënt toe".
- **Loggen met 0 vinkjes aan**: `Toevoegen` disabled. (Equivalent aan niets toevoegen.)
- **Gerecht waarvan template verwijderd is**: 
  - In recents niet meer zichtbaar (geen dish-row meer om te tonen)
  - Al gelogde entries blijven, met `dish_id = null`
- **Gerecht met component dat naar verwijderd product verwijst**: kan niet — `products on delete restrict` voorkomt dat een product verwijderd wordt zolang er een dish_component naar verwijst (zelfde mechanisme als entries → products vandaag).
- **NEVO-toggle aan + filter Gerechten**: NEVO-chip wordt visueel disabled (greyed). Schakelen heeft geen effect.
- **Gerecht in gerecht (recursie)**: niet mogelijk — `dish_components.product_id` is een fk naar `products`, niet naar `dishes`. UI-zoek-sheet voor componenten filtert ook op products-only.
- **Twee gebruikers wijzigen tegelijk hetzelfde gerecht**: last-write-wins (geen optimistic locking). Acceptabel voor de huidige schaal; consistent met hoe products werkt.

### Service-worker cache-bump

Eén CACHE_NAME-bump (`v31` → `v32`) bij deployment. Nieuwe assets (`dish-builder.js`, `dish-log.js`, `dish-component-sheet.js`, `dishes.js`) toevoegen aan `STATIC_ASSETS` zodat het portion-screen en aanmaak-pagina ook offline tenminste schermen tonen (consistent met hoe `edit-product-sheet.js` is meegenomen in v28).

## Migration

Eén nieuwe migration: `<UTC-timestamp>_dishes.sql`

Bevat:
1. `create table public.dishes` + RLS policies + edit-trail trigger (`dishes_set_edit_trail`)
2. `create table public.dish_components` + RLS policies (subquery-based)
3. Trigger `dishes_touch_on_component_change` op `dish_components` → updatet `dishes.last_edited_by/at`
4. `alter table public.entries add column dish_id uuid references public.dishes(id) on delete set null`
5. Index `entries_user_dish_idx`

## File-impact

**Nieuw:**
- `src/js/db/dishes.js` — CRUD: `listDishes()`, `getDish(id)`, `createDish(...)`, `updateDish(id, ...)`, `deleteDish(id)`, met components inline (één round-trip via select met embed)
- `src/js/views/dish-builder.js` — aanmaken + bewerken (modus via params.dish)
- `src/js/views/dish-log.js` — loggen-flow (½/1/1½/2 + checkboxes)
- `src/js/views/components/dish-component-sheet.js` — sheet met embedded zoek + portie-input voor één ingrediënt

**Gewijzigd:**
- `src/js/views/add-food.js` — segmented-filter, gemengde lijst (products + dishes), tweede dashed-knop, NEVO-chip-disable bij filter Gerechten
- `src/js/db/entries.js` — `listRecentItemsForUser` (vervangt `listRecentProductsForUser`) — gemengde recents; `createEntry` accepteert optionele `dish_id`; nieuwe `bulkCreateEntries(rows)` voor gerecht-loggen
- `src/js/router.js` — routes `#/dish/new`, `#/dish/edit`, `#/dish/log`
- `src/js/views/day.js` — geen functionele change voor MVP; toekomstige dish-grouping is geparkeerd
- `src/sw.js` — CACHE_NAME bump + nieuwe assets in `STATIC_ASSETS`
- `src/css/*` — `.badge-dish` (groene variant van `.badge-nevo`), `.dish-segmented` (½/1/1½/2 control), evt. tweaks aan `.chiprow` voor segmented control

**Documentatie:**
- `docs/general/CHANGELOG.md` — nieuw blok met migration + feature-omschrijving
- `docs/general/ROADMAP.md` — K verplaatsen naar `## Afgerond ✅` table

## Open follow-ups (niet blocking)

Tijdens het bouwen kunnen deze nog opduiken — niet vooraf invullen:
- Performance op grote `dishes`-tabel: vandaag haal je in `listProducts` 2300+ products in chunks van 1000. Voor dishes verwacht ik geen tienduizenden binnen afzienbare tijd, maar als de tabel groot wordt: zelfde paginering toepassen.
- Test of bulk-insert van entries goed werkt onder rate-limiting (Supabase doet RLS-checks per row).

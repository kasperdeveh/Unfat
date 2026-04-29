# Sub-project F-A — NEVO seed (Nederlandse productdatabase)

**Status:** Brainstorm afgerond — klaar voor review
**Datum start:** 2026-04-29
**Bouwt voort op:** A (foundation MVP) en B (solo tracking) — afgerond 2026-04-26

## Scope

Doel: de gedeelde producten-database vullen met ~2300 Nederlandse staples uit het RIVM Nederlands Voedingsstoffenbestand (NEVO 2025/9.0), zodat gebruikers vanaf dag één kunnen zoeken naar "appel", "boterham", "yoghurt" etc. zonder zelf eerst calorie-data op te zoeken.

Deze ronde dekt het eerste, kleinste deel van roadmap-item F:
- Eenmalige NEVO 2025/9.0 import in `products`-tabel (~2300 records)
- Schema-uitbreiding (`source`, `nevo_code`, `synonyms`)
- RLS zodat NEVO-records read-only zijn voor users
- Curated per-stuk-gewicht voor ~50–100 stukbare staples (appel, banaan, ei, snee brood, …)
- Zoek-aanpassing in `add-food.js` (synonyms-match, default-view bij leeg zoekveld = recent gelogd)
- Verplichte NEVO-attributie in Settings

**Niet in deze ronde** (geparkeerd):
- **F-B**: Open Food Facts integratie + barcode scanning (volgt na F-A)
- **F-C**: "Zoek ook in OFF"-knop voor brand-producten zonder barcode
- Supermarkt-API integratie (zie `docs/general/toekomstmuziek.md`)
- User-overrides voor `unit_grams` op NEVO-records (kan later via `product_user_metadata` tabel of gedeeld via `product_extensions`)
- Jaarlijkse NEVO-update mechaniek (manueel script bij volgende NEVO-release; out-of-band)
- Dedup-flow tussen NEVO en bestaande user-producten (ROADMAP G heeft "Duplicaten-detectie / merge-flow")
- AI/foto-herkenning van producten

## Beslissingen

### Datakeuze: NEVO als enige bron in F-A
NEVO 2025/9.0 (RIVM, 2328 items, gratis, NL-curated, accepteer voorwaarden) is de seed. OFF + barcode komen pas in F-B.

Reden: NEVO dekt naar schatting >95% van wat een NL-gebruiker dagelijks logt (raw foods + categorie-varianten zoals cola/cola light/cola zero, kaas 30+/48+, brood wit/volkoren). Brand-precisie binnen één variant is meestal <5% kcal-verschil — niet de moeite waard om OFF erbij te zetten in deze release. Bovendien: vermijdt OFF rate-limit-trap (10 req/min, "no search-as-you-type") die vorige integratie problemen gaf.

Albert Heijn / Jumbo / Dirk vallen af door CORS + ToS + endpoint-instabiliteit; volledige analyse staat in `docs/general/toekomstmuziek.md`.

### Storage: NEVO-records in dezelfde `products`-tabel als user-records
Eén tabel, met `source`-kolom (`'nevo'` of `'user'`). Geen aparte `nevo_products`-tabel.

Reden: huidige `entries.product_id` blijft werken zonder union-views; client-side zoeken blijft één query; NEVO en user-producten zijn semantisch hetzelfde (een product met kcal/100g) — alleen de oorsprong verschilt.

### `created_by` wordt nullable
NEVO-records hebben geen "creator user". Schema-aanpassing: `alter table products alter column created_by drop not null`.

Afgewogen: alternatief was een fake "system" auth-user aanmaken om `created_by` non-null te houden. Afgevallen omdat het `auth.users` vervuilt en RLS-policies minder duidelijk maakt.

### Per-stuk-data: curated mapping voor top staples
Hardcoded JSON-mapping in `scripts/data/nevo-unit-grams.json` voor ~50–100 stukbare items. Import-script merget dit in de gegenereerde migration.

Afgewogen alternatieven:
- *User-override tabel* (B): meer schema, RLS, UI-flow — niet voor deze release.
- *Gedeelde overrides* (C): vandalisme-risico, dedup nodig — staat al onder ROADMAP G.
- *AI/extern lookup* (D): externe afhankelijkheid + risico op rare waarden.
- *Geen unit_grams* (E): slechte UX voor stukbaar fruit/eieren.

Concreet: 1 appel ≈ 150g, 1 banaan ≈ 102g, 1 ei ≈ 60g, 1 snee volkorenbrood ≈ 35g, 1 plak kaas 30+ ≈ 25g, etc. Ik stel de eerste lijst samen tijdens implementatie op basis van Nederlandse staples — exact aantal en exacte items hangen af van wat in de NEVO CSV staat (NEVO-codes pas zichtbaar na download).

### Default-render in `add-food.js` bij leeg zoekveld: recent-gelogd top 20
Als zoekveld leeg is, toont `add-food.js` de 20 producten die de huidige user laatst heeft gelogd (gededupliceerd, gesorteerd op meest recent uit `entries`). Onderaan een hint *"Typ om te zoeken in 2300+ producten"*.

Afgewogen: alfabetisch eerste 20 (nutteloos), populairste over alle users (vereist aggregate-query/cache, niet voor deze release), favorieten (staat onder ROADMAP G).

Voor nieuwe users zonder entries: leeg + hint + voorbeeldsuggestie ("Probeer: appel, brood, yoghurt").

### Synonyms-match in zoeken
NEVO heeft een `Synoniem`-veld met o.a. Engelse vertalingen. We slaan dit op in een `text[]`-kolom en breiden de client-side zoekfilter uit zodat "apple" óók "appel" vindt. Lowercase + accent-strip op zowel naam als synonyms.

### CSV niet in repo; migration SQL wel
`scripts/data/nevo-2025-9.csv` (paar MB, RIVM-copyright) wordt gegitignored. De gegenereerde migration SQL met INSERT-statements staat wel in `supabase/migrations/` — dat is afgeleid product en past binnen de NEVO-voorwaarden ("aanvullingen toegestaan, originele data niet wijzigen, bron vermelden").

### Attributie: footer onderin Settings
Verplichte tekst per NEVO-voorwaarden: *"Productdata mede gebaseerd op NEVO-online versie 2025/9.0, RIVM, Bilthoven."* Plek: kleine grijze tekst onderaan de Settings-pagina. Geen tooltip op productrijen (te veel UI-ruis).

## Architectuur

### Data flow

```
RIVM website → eenmalige handmatige download → scripts/data/nevo-2025-9.csv (gitignored)
                                                  │
                                                  ▼
scripts/data/nevo-unit-grams.json (curated)  ──► scripts/import-nevo.js
                                                  │
                                                  ▼
                                supabase/migrations/<datum>_nevo_seed.sql (gegenereerd, gecommit)
                                                  │
                                                  ▼
                                        supabase db push
                                                  │
                                                  ▼
                                     products-tabel: ~2300 NEVO-rijen + bestaande user-rijen
                                                  │
                                                  ▼
                          add-food.js client-side zoekt over alles (NEVO + user)
```

Runtime is volledig client-side over de eigen Supabase. Geen externe API-calls, geen rate-limits, geen netwerkrisico's.

### Componenten

| Component | Locatie | Verantwoordelijkheid |
|-----------|---------|----------------------|
| NEVO CSV (input) | `scripts/data/nevo-2025-9.csv` (gitignored) | Bronbestand |
| Per-stuk mapping (input) | `scripts/data/nevo-unit-grams.json` | Curated `nevo_code → unit_grams` |
| Import-script | `scripts/import-nevo.js` | Parseert CSV + JSON; genereert SQL |
| Migration | `supabase/migrations/<datum>_nevo_seed.sql` | Schema-uitbreiding + INSERT statements |
| `db/products.js` | bestaand, kleine wijziging | `listProducts()` retourneert ook `source`, `synonyms`, `nevo_code` |
| `views/add-food.js` | bestaand, gewijzigd | Default-render via recent-gelogd; zoeken matcht ook synonyms |
| `views/add-food-portion.js` | bestaand, geen wijziging | `unit_grams` werkt al; voor NEVO null-records valt stuks-toggle automatisch weg |
| `views/settings.js` | bestaand, kleine wijziging | NEVO-attributie footer toegevoegd |
| RLS-policies | migration, gewijzigd | Update insert/update/delete policies met `source = 'user'` filter |

### Schema-wijzigingen

```sql
-- Nieuwe kolommen op products
alter table public.products
  add column source text not null default 'user' check (source in ('nevo','user')),
  add column nevo_code text,
  add column synonyms text[];

-- created_by mag nu null zijn (voor NEVO records)
alter table public.products alter column created_by drop not null;

-- Unique index op nevo_code voor idempotente reseed
create unique index products_nevo_code_idx on public.products (nevo_code) where nevo_code is not null;

-- Index op synonyms voor zoeken (optioneel; voor 2300 rijen is full scan ook OK)
-- create index products_synonyms_idx on public.products using gin (synonyms);
```

### RLS-aanpassingen

Bestaande policies worden uitgebreid zodat user-CRUD nooit per ongeluk een NEVO-rij raakt:

```sql
drop policy "products_insert_authenticated" on public.products;
drop policy "products_update_own" on public.products;
drop policy "products_delete_own" on public.products;

create policy "products_insert_user_only"
  on public.products for insert
  to authenticated
  with check (source = 'user' and created_by = auth.uid());

create policy "products_update_own_user_only"
  on public.products for update
  to authenticated
  using (source = 'user' and created_by = auth.uid());

create policy "products_delete_own_user_only"
  on public.products for delete
  to authenticated
  using (source = 'user' and created_by = auth.uid());
```

`products_select_all_authenticated` blijft ongewijzigd — alle users mogen alle records lezen.

### Per-stuk mapping (curated)

`scripts/data/nevo-unit-grams.json` voorbeeldformaat:

```json
{
  "001": 150,
  "002": 102,
  "045": 60
}
```

Sleutel = NEVO-code (string), waarde = grammen per stuk (int). Lijst dekt minimaal:
- **Fruit per stuk**: appel, peer, banaan, sinaasappel, mandarijn, kiwi, perzik, nectarine, pruim
- **Eieren**: ei (gekookt/rauw, evt. spiegelei)
- **Brood per snee**: wit, volkoren, bruin, roggebrood, krentenbol
- **Plakken kaas**: 30+, 48+, jong belegen
- **Plakken vleeswaren**: ham, kipfilet, salami, rosbief
- **Snacks per stuk**: ontbijtkoek, koek, biscuit, ronde stroopwafel
- **Groenten per stuk** (waar zinvol): tomaat, paprika, courgette, ui

Exacte lijst en NEVO-codes worden tijdens implementatie ingevuld zodra de CSV beschikbaar is. Niet-stukbare items (kip filet, pasta, rijst, soep) krijgen geen entry → blijven gram-only, wat correct is.

### Import-script flow

`scripts/import-nevo.js` (Node, geen extra dependencies behalve `csv-parse` en `fs`):

1. Lees `scripts/data/nevo-2025-9.csv`.
2. Lees `scripts/data/nevo-unit-grams.json`.
3. Voor elke CSV-rij:
   - Mappen naar `{nevo_code, name, kcal_per_100g, unit_grams, synonyms, source: 'nevo', created_by: null}`.
   - `kcal_per_100g`: round NEVO `kcal`-veld naar int. Skip records met null/0 kcal.
   - `synonyms`: split NEVO `Synoniem`-veld op komma's, trim, filter lege strings.
   - `unit_grams`: lookup in JSON-mapping; null als afwezig.
4. Genereer één SQL-bestand `supabase/migrations/<datum>_nevo_seed.sql` met:
   - De `alter table` statements (schema-wijzigingen).
   - De RLS-policy aanpassingen.
   - De `INSERT INTO products (...) VALUES (...) ON CONFLICT (nevo_code) DO NOTHING;` statements voor alle records.
5. Eindig met een `select count(*) ...` voor verificatie in `supabase db push`-output.

Idempotent door `on conflict do nothing` op `nevo_code`. Schema-changes zijn niet idempotent — als je het script opnieuw runt op een DB waar de migration al is toegepast, faalt 'm; dat is correct (migrations horen één keer te draaien).

### UI: zoek-aanpassing in `add-food.js`

**Huidig gedrag**: laadt alle producten, toont alle alfabetisch, filtert client-side op `name.includes(query)`.

**Nieuw gedrag**:
1. Bij laden: query alle producten (zelfde als nu).
2. Default-render (zoekveld leeg):
   - Als user `entries` heeft: query laatste 50 entries, dedup op `product_id`, neem eerste 20, toon die.
   - Anders: empty state met *"Typ om te zoeken in 2300+ producten — probeer: appel, brood, yoghurt"*.
3. Bij typen:
   - Normaliseer query (lowercase + accent-strip via `String.prototype.normalize('NFD').replace(/\p{Diacritic}/gu, '')`).
   - Match producten waar `name` of een element in `synonyms` de query bevat (na dezelfde normalisatie).
   - Render top 50 matches (genoeg voor UX, voorkomt enorme DOM bij brede match).

### UI: attributie in Settings

Onderaan `views/settings.js`, na de bestaande secties, toevoegen:
```html
<p class="text-muted attribution">
  Productdata mede gebaseerd op NEVO-online versie 2025/9.0, RIVM, Bilthoven.
</p>
```
Met `font-size: 11px; color: var(--text-muted); margin-top: 24px;` of vergelijkbare bestaande style. Geen link nodig (geen verplichting), maar mag wel naar `https://www.rivm.nl/nederlands-voedingsstoffenbestand`.

## Edge cases

### Bestaande user-producten
Houden `source = 'user'` (default) en hun `created_by`. Geen migratie nodig.

### Naam-collisions
Mogelijk: bestaande user-product "Appel" naast NEVO "Appel, vers". Beide blijven als duplicaten in deze release. Dedup is een aparte feature (ROADMAP G).

### Records met null/0 kcal in NEVO
Skip tijdens import. Niet alle NEVO-rijen hebben kcal (sommige zijn ingrediënten zoals "specerijen"). Logging in import-script: aantal geskipt.

### NEVO-records lang (kunnen 60+ tekens zijn)
Bv. "Brood, wit, met zonnebloempitten en zaden". Past in bestaand `name text` veld (geen lengte-limiet). UI moet wel multi-line of truncation aan kunnen — current `add-food.js` gebruikt al multi-line layout, dus OK.

### Sw cache bump
Frontend wijzigingen (zoek-aanpassing, attributie) vereisen `CACHE_NAME` bump in `src/sw.js` per project-conventie.

## Testing

Project-conventie = handmatig in browser via Live Server. Checklist:

- [ ] Migration runt schoon: `supabase db push` zonder errors.
- [ ] `select count(*) from products where source = 'nevo'` ≈ 2300 (na NEVO-skips voor null kcal).
- [ ] Spotchecks: "Appel, vers" zit erin met kcal grofweg 52 en `unit_grams = 150`.
- [ ] "Banaan, vers" heeft `unit_grams = 102`.
- [ ] "Kip filet, rauw" heeft `unit_grams = null` (terecht).
- [ ] Zoeken op "apple" vindt "Appel, vers" via synonyms.
- [ ] Zoeken op "ei" vindt eierproducten.
- [ ] Default-view (leeg zoekveld) toont eigen recent gelogde producten.
- [ ] Default-view voor nieuwe user toont voorbeeld-hint, geen lijst.
- [ ] Add-food-portion stuks-toggle werkt voor NEVO-records met `unit_grams`.
- [ ] User kan geen NEVO-record bewerken via UI.
- [ ] User kan geen NEVO-record updaten/deleten via Supabase REST (RLS-test).
- [ ] User-toegevoegd product blijft volledig CRUD-baar door owner.
- [ ] Bestaande entries (van user-producten van vóór NEVO-release) blijven intact en zichtbaar in Vandaag/Historie.
- [ ] Friend day-view blijft werken (geen regression op vrienden-feature).
- [ ] NEVO-attributie zichtbaar onderin Settings.
- [ ] SW-cache bump triggert update-toast voor bestaande users.

## Open punten

Geen. Alle beslispunten zijn geadresseerd in deze ronde.

## Heroverweegmoment / vervolg

Na release: monitor of users vaak handmatig producten toevoegen die wel in NEVO zitten (slechte zoek-relevantie?) of juist producten die er niet in zitten (brand-items → F-B prioriteit verhogen).

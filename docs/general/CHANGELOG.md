# Changelog

## 2026-05-05

### N. Vrienden & historie redesign
- **Eén gedeelde Historie-pagina** (`#/history`) vervangt de aparte `#/friend-day/week/month`-routes. Persoon-selector bovenaan: "Ik" altijd actief; één vriend opt-in voor vergelijken.
- **Dag-view** toegevoegd op de Historie-tab (gedeeld met dashboard `day.js` — edit/add/swipe-delete werken identiek).
- **Vergelijken on one page** in alle drie de views:
  - Dag: hero 2-koloms + per-maaltijd jouw blok boven, vriend-blok onder (read-only met kopieer-knoppen)
  - Week: 7 rijen met 2 horizontale bars per dag (vol = ik, diagonaal gestreept = vriend)
  - Maand: kalender-grid met 2 mini verticale bars per cel; tap-cel = inzoom op die dag
- **Bar-conventie**: kleur = doel-staat (groen/oranje/rood), patroon = persoon. Pill-active toont mini-bar-swatch (vol of gestreept) als visuele legenda.
- Verwijderd: `friend-day.js`, `friend-week.js`, `friend-month.js`, `friend-header.js` + bijbehorende CSS-classes (`.friend-view-toggle`, `.period-bar*`).
- Bottom-nav: Historie-tab is nu actief op `#/history`, ook met `friend`-param.
- Geen DB-wijzigingen — bestaande RPCs `get_friend_day` / `get_friend_period` hergebruikt.
- Service worker cache bump → v39.

- **Cleanup: friend-day/week/month/header views verwijderd** — De vier view-bestanden (`friend-day.js`, `friend-week.js`, `friend-month.js`, `components/friend-header.js`) zijn verwijderd nu de `#/friend-*` routes zijn gedropt. Bijbehorende precache-entries in `sw.js` en de obsolete CSS-blocks (`.friend-view-toggle`, `.back-btn`, `.period-nav-btn`, `.period-bars`, `.period-bar*`) zijn ook geschoond. SW cache v38 → v39.

### N. follow-ups na hands-on test
- Fix: solo `Dag`-view in Historie blijft op `#/history` bij ‹ ›-nav (was per ongeluk naar `#/day` springend)
- Fix: persoon-selector "Ik"-pill kreeg active-outline net buiten beeld op smal scherm — selector heeft nu horizontale padding
- Verwijderd: "+ toevoegen"-knoppen in compare day-view (compare is read-only voor jouw kant)
- **Inklapbare maaltijd-blokken** in compare day-view: alle blokken default ingeklapt (header met avatar + sum + chevron), tap header om uit te klappen. Per-meal kopieer-knop verschijnt binnen het uitgeklapte blok
- Scroll-stabiliteit op compare-day mutaties (edit-save, swipe-delete, undo): geen reset naar boven meer
- Polish: kcal-sums in compare-day-headers nu consistent uitgelijnd. Eerste poging via "chevron altijd reserved" werkte niet omdat `justify-content: space-between` met 3 items het middelste centreert; tweede iteratie gebruikt `margin-left: auto` op de sum waarna alle sums op dezelfde X eindigen ongeacht de lengte van het handle
- Polish: uitklap-pijltje in compare-day vergroot van 11px → 32px en namen/sums van 12px → 17px — vult de header beter nu de sums rechts uitgelijnd staan
- Fix: blok-hoogte trok te hoog door 32px chevron + 1.4 line-height op de header. `line-height: 0` op de chevron (char rendert nog op 32px maar telt niet voor row-height) plus `line-height: 1` op de header geeft de oude compacte rij-hoogte terug
- Service worker cache bump → v40.

## 2026-05-04

- **Day-view: stabiele scrollpositie bij entry-mutaties** — swipe-delete, edit-sheet save/🗑 en undo-toast op het dashboard re-rendert nu zonder dat de browser naar boven springt. Lokale `reloadKeepScroll`-wrapper capturet `window.scrollY` vóór de re-render, geeft `render()` een `skipSkeleton: true`-flag mee zodat de oude DOM blijft staan tijdens de fetch (geen skelet-flits), en zet via `requestAnimationFrame` de scrollpositie terug nadat de nieuwe DOM is gepaint. Variant gekozen na A/B-test op telefoon (variant A "met skelet" gaf voelbare flits, variant B "zonder skelet" voelt instant). SW cache v36 → v37 (test-toggle) → v38 (finalisatie)
- Security-audit (statische DAST-voorbereiding) op database + client. DB-laag is robuust (Fase A bevestigt: alle RLS-policies compleet, SECURITY DEFINER hygiëne in orde, mutability-triggers werken, geen dynamic SQL, geen privilege-escalation paden meer open). Client-laag had twee échte gaten:
  - **Fix #1 — Defense-in-depth XSS:** in 10 view-files werd `${err.message}` direct in `innerHTML` geïnterpoleerd zonder `escapeHtml`. Patroon was al in `dish-builder.js` en `dish-log.js` toegepast maar 10 plekken vergeten. Realistische exploit is zwak (PostgREST plaatst user-input in `details`, niet `message`, en onze `raise exception`-calls zijn allemaal generieke literals), maar het is een duidelijke regressie t.o.v. bestaand patroon en de fix is triviaal. Gefixt in: `day.js:48`, `history.js:47`, `friends.js:15+59`, `friend-day.js:28`, `friend-week.js:29`, `friend-month.js:27`, `settings.js:25+217`, `add-food-portion.js:30`. `history.js` had ook geen `escapeHtml`-import — toegevoegd
  - **Fix #2 — Supply-chain risk:** `supabase-js` werd geladen via `https://esm.sh/@supabase/supabase-js@2` zonder version-pin (`@2` resolveert naar latest patch) en zonder SRI. Vervangen door self-hosted UMD bundle (`src/js/vendor/supabase-js.umd.js`, v2.105.3, 197KB). Geladen via classic `<script>`-tag in `index.html` vóór de module-script; `var supabase` wordt zo `window.supabase` en `src/js/supabase.js` doet `globalThis.supabase.createClient`. Verwijdert de runtime-afhankelijkheid van een 3rd-party CDN — geen risico meer dat esm.sh-compromittering of `@2`-version-drift silently malicious code injecteert. Upgrade-procedure gedocumenteerd in de header van het vendor-bestand
  - Nog open (afgewogen, niet gefixt): geen CSP via meta-tag in `index.html` (MEDIUM — beperkt nut zolang we inline `style=`-attributes in innerHTML-templates gebruiken; zou `'unsafe-inline'` op style-src vereisen); access-token in localStorage (LOW — Supabase-default, accepteerbaar voor PWA op persoonlijk device). Twee subagent-findings gemarkeerd als false-positive: SW cache leakt geen Supabase-data (alleen STATIC_ASSETS worden gecached, fetch-handler doet geen `cache.put()` voor api-calls), en client-side admin-UI-zichtbaarheid is geen security-issue (RLS is bron van waarheid). SW cache v35 → v36
- K-review follow-ups + security sweep: immutable-kolom-bescherming toegevoegd aan drie update-policies om manipulatie via directe API-calls te blokkeren. Belangrijkste vondst: `profiles_update_own` had geen check op de `role`-kolom (toegevoegd in J-A) — een normale user kon zichzelf via een PostgREST PATCH naar `admin` promoten. Tijdens deze sessie gefixt vóór misbruik. Ook: `dishes` en `products` locken nu `created_by` (en `source` op products) zodat een editor geen ownership kan kapen. Eerste poging via `with check`-subqueries (`20260504174110_rls_with_check_hardening.sql`) leidde tot "infinite recursion detected in policy" omdat de checks een SELECT op dezelfde tabel deden — Postgres kan dat patroon niet zonder herinstantiatie van de policy oplossen. Hotfix `20260504175258_fix_rls_recursion_via_triggers.sql` vervangt elke subquery-check door een BEFORE UPDATE trigger met directe OLD/NEW-toegang. Sweep verder schoon: SQL-injectie via SDK-parametrisering afgedekt; alle SECURITY DEFINER RPCs hebben `set search_path = public` + correcte auth-checks; bestaande triggers draaien als invoker met RLS van toepassing
- Recents-overscan: `listRecentItemsForUser` haalt nu 300 ruwe entries op (was 150) zodat power-users die 15-30 entries/dag loggen ~10-20 dagen geschiedenis blijven zien in "Laatst gegeten"
- `bulkCreateEntries`: docstring met atomicity-noot toegevoegd zodat een toekomstige maintainer weet dat één PostgREST `insert([rows])`-call server-side transactioneel is (geen partial failure mogelijk → geen retry/cleanup nodig). SW cache v34 → v35
- View-hardening: `my_friends` view nu met `security_invoker = on` zodat RLS op `friendships` óók wordt afgedwongen bij view-queries (was: alleen de `where auth.uid() in (...)` clause in de view-body). Defense-in-depth — flag uit Supabase Database Advisor. Migration `20260504182050_my_friends_security_invoker.sql`
- Function-hardening: 6 trigger-functies kregen `set search_path = public` (voorkomt search-path-hijacking), 9 SECURITY DEFINER RPCs en 7 trigger-functies kregen `revoke execute from public, anon` (anonymous clients konden via `/rest/v1/rpc/<func>` aan de body-call beginnen voordat de interne `if caller is null` guard de call afkapte — nu al bij de gateway tegengehouden), `profiles_protect_role` van SECURITY DEFINER → INVOKER omdat de body alleen de eigen rol leest (al toegestaan via SELECT-policy). Alle 16 fixes in één migration `20260504182743_harden_functions.sql`. Geen functionele wijziging voor users — alleen striktere permissies en pad-bescherming. Resterende Advisor-warnings (`authenticated` mag SECURITY DEFINER RPCs uitvoeren) zijn per ontwerp legitiem (Friend-flow, admin-flow)
- Process-verbetering: nieuwe sectie "RLS-invarianten per tabel" in `OPERATIONS.md` met een tabel die per tabel laat zien welke kolommen immutable zijn en hoe dat afgedwongen wordt — voorkomt herhaling van J-A-stijl privilege-escalation door bij elke schema-wijziging deze tabel te raadplegen
- L. Favorieten — UX-tweaks na smoke-test: filter-knop label van `★` naar `Favorieten` (past prima op smalle schermen); ster in lijst-rij rechts uitgelijnd via `margin-left:auto` (was zwevend in het midden door `space-between`); empty-state bij filter=favorites + zoekterm toont nu "Geen match in je favorieten" i.p.v. de generieke "Maak iets nieuws aan ↓"
- Ster-toggle voor gerechten verhuisd van dish-builder edit-mode naar dish-log (portie-multiplier scherm) — dish-log is voor gerechten wat portion-screen voor producten is, dus daar hoort de ster ook. Een tap minder, geen edit-intent meer nodig
- Ster ook in de edit-entry-sheet vanaf het dagoverzicht: tap op een ingevoerd product → bottom sheet → ster naast de naam, voor 1-tap pinning vanaf reeds gelogde items. SW cache v33 → v34
- Sub-project L: favorieten — handmatig pinnen van producten en gerechten via een ster-toggle. Vierde filter-knop `Favorieten` op de toevoegen-pagina toont alleen gepinde items, alfabetisch gesorteerd. Ster zit in elke lijst-rij (rechts uitgelijnd, tap = toggle zonder navigeren), in de header van het portion-screen, in de header van dish-log, en in de edit-entry-sheet (dagoverzicht)
- Datamodel: tabellen `product_favorites` en `dish_favorites` met composite PK `(user_id, item_id)` + cascade delete + per-user RLS. Twee aparte tabellen i.p.v. polymorfe relatie zodat foreign keys de integriteit afdwingen
- "Vaak gegeten" auto-mechanisme bewust uitgesteld: handmatige favorieten dekken het hoofdpijnpunt (1×-per-maand items zoals een eiwitshake na een duurloop); auto-frequentie kan later toegevoegd als blijkt dat dit echt mist
- Migrations: `20260504151548_favorites.sql` (tabellen + RLS) + `20260504153252_favorites_rls_conventions.sql` (snake_case policy-namen + `to authenticated` clause om aan te sluiten bij project-conventie)
- Sub-project K: gerechten — bundels van producten als gedeelde recepten. Op de toevoegen-pagina nu een segmented filter (Alles/Producten/Gerechten) naast de bestaande NEVO-chip; resultaten en "Laatst gegeten" tonen producten en gerechten gemengd met een GERECHT-badge. Twee dashed-knoppen onderaan: "+ Nieuw product" en "+ Nieuw gerecht"
- Aanmaken: `#/dish/new` met naam, optionele suggestie-maaltijd en ingrediënten-lijst. + knop opent een sheet (zoek-flow + Gram/Stuks-portie hergebruikt). Bewerken op `#/dish/edit` met dezelfde view en een rode "Verwijderen"-knop (alleen voor de aanmaker)
- Loggen: `#/dish/log` met portie-multiplier (½×/1×/1½×/2×) als "scale-all"-actie en per-ingrediënt-checkboxes voor weglaten. Tap op de portie-pill van een ingrediënt opent de bestaande dish-component-sheet voor handmatige aanpassing (gram/stuks); zo'n override krijgt een groene rand + ✏ als visuele cue en blijft staan tot een multiplier-tap alles weer reset. Bij Toevoegen wordt het gerecht expanded naar N entries via één bulk-insert. Maaltijd valt terug op gerecht.default_meal_type, anders op tijd-van-dag
- UX-tweak na smoke-test: filter-state op de toevoegen-pagina blijft binnen de browser-sessie staan (sessionStorage), zodat tap → terug niet je `Producten`/`Gerechten`-keuze wegklapt. Cold-start = default `Alles`
- Gerechten-tab toont alle gerechten alfabetisch bij lege query (recents bovenaan, "Alle gerechten" sectie eronder), zodat het tabblad nooit blanco is — ook nuttig om te bladeren bij <10 gerechten zonder eerst te moeten typen
- Zoeken matcht nu ook ingrediënten van een gerecht: `listDishes` embedt elke component-product-naam in een `synonyms`-array op de dish, waardoor de bestaande `rankProducts`-scorer een query als "ui" laat matchen op een gerecht dat een Ui-component bevat — zelfde mechaniek als product-synoniemen
- Datamodel: tabellen `dishes` en `dish_components` (gedeeld als products: select voor alle authenticated, edit voor eigenaar+editor+admin, delete alleen eigenaar). `entries.dish_id` (nullable, on delete set null) link entries aan hun gerecht-template; bij gerecht-delete blijven al gelogde entries staan
- Edit-trail: `last_edited_by`/`last_edited_at` op `dishes` via trigger, en een tweede trigger op `dish_components` werkt de trail van de parent-dish bij wanneer ingrediënten wijzigen — net als bij products
- Refactor: zoek-scoring (`normalize`, `rankProducts`) verhuisd naar `src/js/utils/product-search.js` zodat de gerecht-ingrediënten-picker dezelfde ranking gebruikt
- Migrations: `20260504110039_dishes.sql` (schema, RLS, triggers) + `20260504111617_dishes_policy_split_and_index_fix.sql` (split `for all` policy in expliciete insert/update/delete; recents-index reshape naar `(user_id, created_at desc)`). SW cache v31 → v32

## 2026-05-03

- Sub-project J-A: rol-systeem + producten editten. Drie rollen op `profiles` (`user`/`editor`/`admin`); editors en admins kunnen alle door-gebruikers-aangemaakte producten (`source='user'`) wijzigen via een potlood-knop in het portion-screen die een bottom sheet opent met `name`, `kcal_per_100g`, `unit_grams` en `synonyms`. NEVO-rijen blijven immutable. Light edit-trail: `last_edited_by`/`last_edited_at` op `products`, gevuld door een server-trigger zodat clients niet kunnen liegen of vergeten
- Settings → "Gebruikers beheren" (admin-only): tabel met handle + role-dropdown per user, eigen rij disabled, role-changes via SECURITY DEFINER RPC `set_user_role` die ook server-side weigert dat een admin zichzelf demote
- Bugfix: hoeveelheid-input bij Stuks accepteert nu `1,7` op iOS Safari NL-locale. `type="number"` toonde alleen het numpad zonder komma-toets — vervangen door `type="text" inputmode="decimal" pattern="..."` in `add-food-portion.js` en `edit-entry-sheet.js`. JS-parser handelde komma al af
- Migrations: `20260503000000_user_roles_and_product_edit.sql` (rol-kolom, edit-trail trigger, extra products update-policy voor editors/admins, twee admin RPC's `list_users_for_admin` en `set_user_role`) en `20260503010000_fix_admin_rpc_alias.sql` (table-aliases in admin-checks om `42702 ambiguous column reference` te voorkomen — OUT-parameters van `list_users_for_admin` botsten met profile-kolommen)
- Nieuw: `docs/general/OPERATIONS.md` — eerste opzet operationele handleiding (rol-uitleg, admin-bootstrap-SQL, audit-query, fallback-recepten)
- Bugfix: gewicht-per-stuk (`products.unit_grams`) accepteert nu decimalen — bv. `75,5g` voor een ei. Schema-change van `int` naar `numeric(10,2)` (bestaande integer-waardes casten lossless); UI-pattern in `add-food-new.js` en `edit-product-sheet.js` naar `type="text" inputmode="decimal"` met komma-fallback in de parser. `kcal_per_100g` blijft int
- SW cache v26 → v29 (v27 J-A code; v28 om `edit-product-sheet.js` aan `STATIC_ASSETS` toe te voegen — anders breekt portion-screen offline; v29 voor de unit_grams-decimaal-fix)
- Sub-project M: NEVO-toggle chip onder zoekbalk op de toevoegen-pagina (state per user via `profiles.hide_nevo`, persists cross-device). "Laatst gegeten" lijst toont default 5 items met "Meer tonen"-knop voor de rest, zodat de "+ Nieuw product"-knop weer direct zichtbaar is. NEVO-badge in product-rijen alleen op de toevoegen-pagina. Migration `20260503204517_profiles_hide_nevo.sql`. SW cache v29 → v31 (v30 met default 8 recents; v31 verlaagd naar 5 op verzoek)

## 2026-05-02

- A11y: bottom-nav-tabs nu echte `<button>`-elementen (waren `<div>`'s) met `aria-label` + `aria-current="page"` op de actieve tab. Toetsenbord-navigatie via TAB werkt; VoiceOver kondigt de tabs aan als knop. Visueel ongewijzigd dankzij CSS-reset op default button-chrome
- Bugfix: hoeveelheid-input accepteert nu de NL-decimaal-komma. Op iOS/Android met NL als systeemtaal toont `inputmode="decimal"` een komma-toets; `parseFloat("1,5")` stopte op de komma → user logde 1 ipv 1.5. Fix: `value.replace(',', '.')` vóór parse, in `add-food-portion.js` en `edit-entry-sheet.js`. Punt-decimaal blijft werken
- UX: loading-skeleton op het dashboard (day-view) — grijze blokken in de vorm van hero + 4 maaltijd-secties met shimmer-animatie. Vervangt de "Laden..."-tekst voor lagere perceived latency. Alleen day-view; rest staat op ROADMAP G
- Refactor: `escapeHtml` gecentraliseerd naar `src/js/utils/html.js`. 13 lokale duplicaten weg, importeren via `import { escapeHtml } from '../utils/html.js'`. Voorkomt dat een nieuwe view per ongeluk zonder escape blijft
- ROADMAP: nieuw sub-project I (Offline-first / write-queue) toegevoegd; G uitgebreid met "Wachtwoord vergeten?", "Vaak gegeten/Recent verbetering", a11y-pre-launch-pass, account-delete/data-export, viewport-zoom-toelaten, en skeletons doortrekken naar overige views
- SW cache v25 → v26

## 2026-05-01

- UX: zoekterm uit "Voeg eten toe" wordt geprefilled in het naam-veld bij "+ Nieuw product aanmaken" — bespaart een tweede keer typen. SW cache v23 → v24
- UX: bevestigingsdialoog bij Uitloggen in Settings — voorkomt accidentele logouts (consistent met "Vriend verwijderen"). SW cache v24 → v25
- Bugfix: streefdoel/max kcal accepteerden geen niet-veelvoud-van-50 (bv. 1733). `step="50"` op de inputs in `settings.js` en `onboarding.js` blokkeerde browser-side submit met "dichtstbijzijnde geldige waarden zijn 1700 en 1750". Step weggehaald → default `step=1`, dus elke integer ≥800 werkt nu. SW cache v22 → v23
- Update-prompt: reload werkt nu in één tap, in beide richtingen geverifieerd op iPhone-PWA
  - Echte root cause: `cache.addAll` tijdens SW-install gebruikte standaard `fetch()` zonder cache-bypass. GitHub Pages serveert CSS/JS met `Cache-Control: max-age=600`, dus de nieuwe SW vulde z'n cache met **stale bytes** uit de browser-HTTP-laag — toast verscheen, SW activeerde, maar de pagina laadde alsnog de oude assets. Fix: elke STATIC_ASSET wordt nu in een `Request(..., { cache: 'reload' })` gewikkeld zodat de install-fetch direct naar het netwerk gaat
  - Tweede verbetering — door-gebruiker-bestuurde activatie: `skipWaiting()` is uit `install` weg; in plaats daarvan post de page een `SKIP_WAITING`-bericht wanneer de gebruiker tapt op "Vernieuwen". SW handelt dat af → activeert + `clients.claim()` → page-side `controllerchange`-listener doet één reload. Geen race meer met "reload-vóór-active"
  - Tijdens de roll-out was één rescue-deploy nodig (`skipWaiting()` kort terug in install) om bestaande PWA-installaties die nog op pre-fix `app.js` draaiden vooruit te helpen; vanaf v19 is `skipWaiting()` weer permanent uit install
- Subtiele app-versie onderaan Settings (bv. `v22`); leest live uit `caches.keys()` zodat `CACHE_NAME` in `sw.js` single source of truth blijft
- SW cache v14 → v22

## 2026-04-30

- UI-polish: bottom-nav iconen + alignment fix in PWA-standalone modus
  - Iconen vervangen: flat gevulde vierkantjes → Lucide-style outline SVG's (huis, plus-cirkel, klok, twee personen, tandwiel) met `stroke=currentColor` zodat de active accent automatisch volgt
  - Alignment-bug in PWA-modus: `box-sizing: border-box` + fixed `height: 64px` + `padding-bottom: env(safe-area-inset-bottom)` perste het content-gebied tot ~30px → iconen + labels stonden te ver naar boven. Nu rekent zowel de nav-`height` als `body` padding-bottom de safe-area extra mee (`calc(--bottom-nav-h + env(safe-area-inset-bottom))`)
  - Tap-feedback: lichte `scale(0.94)` op `:active`
  - Toast en update-toast posities meegegroeid zodat ze niet meer over de home-indicator zweven
- iOS double-tap-zoom onderdrukt — drie lagen omdat iOS standalone PWA hardnekkig is: (1) `* { touch-action: manipulation }`, (2) viewport meta `maximum-scale=1.0, user-scalable=no`, (3) JS-handler op `touchend` die alleen de **tweede** tap van een rij blokkeert (binnen 350ms na de vorige, op hetzelfde DOM-target). Tap 3, 4, 5… komen er weer normaal door zodat rapid hammeren niet langer de app laat "hangen". iOS heeft system-level zoom voor accessibility (Settings > Accessibility > Zoom)
- SW cache v10 → v14 (vier bumps deze release tijdens iteratie)
- `.gitignore`: `screenshots/` map (lokale UI-feedback voor Claude, niet checked-in)

- Search: multi-token AND-match en compound-vs-standalone-prefix onderscheid
  - `scoreQuery` tokenizet de query nu op whitespace: elke token moet matchen (anders 0), totaalscore = som van per-token scores. "Appel schil" matcht zo "Appel m schil gem" (was: 0 resultaten omdat de hele string als één substring werd gematcht)
  - Prefix-tier gesplitst: "Appel " (prefix + word-end) scoort 850, "Appelcarre" (prefix + letter) scoort 750. Bij zoekterm "appel" tonen we nu echte appel-varianten boven compound-words als Appelcarre/Appelmoes
  - SW cache v9 → v10
- F-A: NEVO seed (Nederlandse productdatabase, ~2300 staples)
  - Schema-uitbreiding op `products`: nieuwe kolommen `source`, `nevo_code`, `synonyms`; `created_by` nullable; RLS-policies beperken user-CRUD tot `source='user'` zodat NEVO-records read-only zijn
  - Eenmalig import-script `scripts/import-nevo.js` (pure Node, zonder dependencies) parseert de RIVM-CSV en genereert een Supabase-migration met INSERT-statements; ON CONFLICT DO UPDATE voor idempotente re-runs na JSON-edits
  - Gecureerde `scripts/data/nevo-unit-grams.json` (~80 entries voor stukbare staples: fruit per stuk, eieren, brood-snees, plakken kaas/vleeswaren, snacks, basis-groenten)
  - 2312 NEVO-records geseed (16 zonder kcal overgeslagen)
  - `add-food.js`: default-view = laatst gegeten top 20 (met fallback-hint voor nieuwe users); zoeken matcht naam én synoniemen met diakritisch-strip; ranking-score (exact > naam-prefix > woord-grens > substring) zodat "appel" de echte appels boven "Aardappel" toont
  - Pagination-fix in `db/products.js`: Supabase REST cap van 1000 rijen per select wordt nu via `.range()` doorlopen tot uitputting (zonder fix verloren we ~1300 NEVO-rijen stil)
  - NEVO-attributie footer in Settings (verplicht per RIVM-voorwaarden)
  - SW cache v8 → v9
- Project-infrastructuur:
  - Supabase CLI workflow gedocumenteerd in CLAUDE.md (install, `login --token`, `link --project-ref`, `db push`); SQL-files in `supabase/migrations/` blijven single source of truth
  - Bestaande migrations hernoemd van 8-digit naar 14-digit `YYYYMMDDHHMMSS_*.sql`-formaat zodat de CLI's filename-sort consistent is met DB-version-sort (mixed lengths brak `db push`); `20260428b_friends_pending_handles.sql` → `20260428100000_friends_pending_handles.sql` (suffix `b` wordt door CLI afgewezen)
  - `supabase/.temp/` en `scripts/data/*.csv` toegevoegd aan `.gitignore`
- `docs/general/toekomstmuziek.md` aangemaakt als parkeerplaats voor lange-termijn-ideeën; bevat onderzoek over supermarkt-APIs (AH/Jumbo/Dirk niet haalbaar vanuit static PWA wegens CORS + ToS + endpoint-instabiliteit) en native iPhone-app als gerelateerd toekomstidee
- ROADMAP G: 2 nieuwe parked items — Supabase MCP/directe SQL vanuit Claude, en UI-polish ronde

## 2026-04-29

- D-vervolg: vrienden in week/maand-historie + één-klik kopiëren
  - Friend dag-view krijgt ‹ › datum-navigatie (begrensd op vriend's account-creatie)
  - Nieuwe friend week-view en friend month-view, bereikbaar via Dag/Week/Maand-toggle
  - Per-entry én per-maaltijd kopiëren vanuit friend dag-view (alleen bij `share_level=entries`)
  - Bottom-sheet date-picker bij elke kopieer-actie (default vandaag, grenzen aan eigen `created_at` en vandaag)
  - Migratie: `get_friend_day` levert entry-id, product-id en `friend_created_at`; nieuwe RPC `get_friend_period` voor week/maand-totalen
  - Route `#/friend` hernoemd naar `#/friend-day`; nieuwe routes `#/friend-week` en `#/friend-month`
  - SW cache bump v6 → v8 (v7 → v8 voor CSS-fix op meal-header spacing met kopieer-knop)
- Bugfix: meal-header spacing — `.meal-sum` krijgt `margin-left: auto` zodat kcal-totaal rechts blijft staan ook als de Kopieer-knop ernaast staat

## 2026-04-28
- Design spec for sub-project D (Vrienden & sociale features, scope A) at `docs/superpowers/specs/2026-04-27-friends-design.md`
- Implementation plan for sub-project D-A at `docs/superpowers/plans/2026-04-27-friends-implementation.md`
- Documented spec/plan archive convention in CLAUDE.md
- Implemented sub-project D-A (Vrienden & sociale features, basis):
  - New `friendships` table with symmetric RLS, accepted/pending status, request-direction tracked via `requested_by`. `my_friends` view hides the case-when from app code.
  - Six SECURITY DEFINER RPCs: `search_users` (handle-prefix lookup with friendship_status), `send_friend_request` (idempotent, auto-accepts on mutual intent), `respond_friend_request`, `unfriend`, `get_friend_day` (returns day data scaled to friend's share_level), `check_handle_available` (bypasses RLS for global uniqueness check).
  - `profiles` extended with `handle` (unique lowercase, 3-20 chars) and `share_level` (`none` / `total` / `per_meal` / `entries`, default `entries`). `profiles_select_own` policy replaced by `profiles_select_own_or_friend` so accepted friends can read each other's handle.
  - New onboarding step prompts for a username; existing users without handle see a modal on first Vrienden-tab visit.
  - New 5th bottom-nav tab "Vrienden" with red badge for incoming requests (initialized at app-start). View has search-by-username + three sections (inkomend, verstuurd, vrienden) with accept / reject / withdraw / unfriend.
  - Friend day-view at `#/friend?id=X&date=Y` — read-only rendering scaled to friend's share_level (none = niets / total = hero only / per_meal = hero + meal totals / entries = full read-only).
  - Compare-widget on dashboard: horizontal swipe-carousel under the hero with one card per friend, tinted by their hero state. Tap → friend day-view.
  - Settings extended with username editor (live availability check) and segmented share-level control.
  - SW cache bumped to `unfat-v5` with new modules pre-cached.
- D-A bug-fixes after first manual test:
  - Bottom nav now stays visible on the friend day-view (`#/friend`) and the Vrienden-tab is highlighted there. Previously the nav disappeared because `#/friend` (singular) is not a tab hash.
  - Pending friend-requests now show the other party's username instead of `?`. Migration `20260428b_friends_pending_handles.sql` loosens the `profiles_select_own_or_friend` RLS policy to match any friendship row (pending or accepted), not just accepted. Privacy is unaffected because handles are already public-searchable via `search_users`.
  - SW cache bumped to `unfat-v6`.

## 2026-04-27
- ROADMAP.md: added sub-project H (Statistieken & inzichten) for personal stats and trends, separated from sub-project E (motivation/badges)
- Design spec for sub-project C (Historie & terugwerkende invoer) at `docs/superpowers/specs/2026-04-27-history-design.md` — hybrid architecture (date-aware dashboard + new Historie tab with week/month toggle), individual entry editing with bottom-sheet + swipe-to-delete-with-undo, new `profile_history` table for historically correct target/max colouring on backdated days
- Implementation plan for sub-project C at `docs/superpowers/plans/2026-04-27-history.md`
- Implemented sub-project C (Historie & terugwerkende invoer):
  - New `profile_history` table snapshots target/max per `valid_from`; seeded for existing users on migration. Onboarding and Settings save UPSERT a row when goals change.
  - `dashboard.js` replaced by date-aware `views/day.js`. Renders for today (`#/`) and any past date (`#/day?date=YYYY-MM-DD`). Header has ‹ › arrows; ‹ disables before account-creation.
  - Entries now render as individual rows under each meal. Tap an entry → bottom-sheet (`components/edit-entry-sheet.js`) for amount/unit/meal/delete. Swipe-left on mobile → quick delete with 4-second undo toast.
  - New 4th bottom-nav tab "Historie" with `views/history.js` — Week/Maand toggle, period nav with disabled future, "vandaag"-pill that returns to current period. Toggles preserve an `anchor` URL param so Week ↔ Maand round-trips stay in the same period.
  - Week-view: 7 day-rows with status-coloured bars + kcal totals. Month-view: calendar grid where each tile is fully tinted by status (green/orange/red) with white inner ring on today.
  - Header on both views shows period average and `doel gehaald: X / Y`.
  - Entire add-flow (search → portion → save) now propagates a `date` query param so backdated entries are inserted on the chosen day; "+ toevoegen" per meal in day-view jumps directly into that flow with date+meal pre-set.
  - `todayIso()` switched from UTC to local time (was off-by-one between local midnight and 02:00 in UTC+ timezones).
  - SW cache bumped to `unfat-v3` with new files pre-cached.
  - All in branch `feature/history`, ~30 commits with two-stage review per task.

## 2026-04-26
- Initial CLAUDE.md with project context, tech stack and conventions
- ROADMAP.md filled with sub-project decomposition (A-G)
- Devcontainer setup notes documented in `docs/prep.md`
- CLAUDE.md: added "memory transparency" rule (always state where info is stored)
- CLAUDE.md: added devcontainer rebuild warning rule
- ROADMAP.md: extended G with future features captured during brainstorm (light mode, private products, duplicate merge, quick-add sheet, friend compare widget, password login)
- Design spec for sub-projects A+B (Foundation + Solo tracking MVP) at `docs/superpowers/specs/2026-04-26-foundation-mvp-design.md`
- Implementation plan for A+B at `docs/superpowers/plans/2026-04-26-foundation-mvp.md`
- Added `.superpowers/` to `.gitignore` for brainstorm visual companion artifacts
- Implemented sub-project A (Foundation): Supabase backend with Auth + RLS policies, mini hash-router SPA, dark sporty PWA (manifest + service worker), GitHub Pages deploy via Action
- Implemented sub-project B (Solo tracking MVP): dashboard with 3-state hero card (under target / over target / over max), shared products database, voeg-eten-toe flow (search + portion picker + new product), settings view with goal editing
- Fixed XSS vulnerability in dashboard view: shared product names are now HTML-escaped before rendering
- Removed `docs/HANDOFF.md` (was a temporary session bridge note)
- Auth pivot: replaced magic link with email + password (signUp + signInWithPassword). Reason: Supabase free tier rate-limits all auth emails to 2 per hour project-wide, making magic link unusable for even a single tester. Set "Confirm email" off in Supabase project to allow instant login after signup. Magic link can return later once custom SMTP via Resend is set up — see ROADMAP G.
- Service worker now skipped on localhost (avoided dev cache headaches); cache version bumped to v2 for production users
- Fixed magic-link redirect race condition (now obsolete after auth pivot but the bootstrap fix still applies — the app waits for INITIAL_SESSION before routing)

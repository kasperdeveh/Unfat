# Changelog

## 2026-04-30

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

# Unfat - Roadmap

Het project is opgedeeld in onafhankelijke sub-projecten. Per sub-project doorlopen we de cyclus brainstorm → spec → plan → bouwen → afronden.

## Sub-projecten

### D. Vrienden — wensen (geparkeerd)
**Status:** open / lage prioriteit

- **Per-dag kopiëren** vanuit friend dag-view (workaround = 4× per-maaltijd)
- **Vergelijk-widget verfijning**: één geselecteerde "vergelijk-vriend" via Settings-dropdown of per-vriend-ster-toggle
- **Competitie-element**: "wie blijft deze week vaakst binnen z'n doel"
- **Notificeren van vriend** bij kopieer-actie

### E. Motivatie: badges, rewards en notificaties
**Status:** open

- Badge-systeem (eerste week binnen doel, X dagen op rij, etc.)
- Push notificaties via PWA (herinneringen, motiverende teksten)
- Motiverende teksten in de UI bij milestones

### F. Producten zoeken & barcode-scanning
**Status:** F-A afgerond, F-B en F-C open

- **F-B**: Open Food Facts integratie — barcode-scan via camera → OFF lookup → product wordt gecached in onze gedeelde `products`-tabel zodat brand-precisie voor iedereen beschikbaar wordt
- **F-C**: "Zoek ook in Open Food Facts"-knop bij beperkte lokale resultaten, voor brand-producten zonder barcode (één call per knop-klik om binnen OFF-rate-limit te blijven; resultaat cachen in `products` bij keuze)

### H. Statistieken & inzichten
**Status:** open

- Persoonlijke stats: "deze maand X keer doel overschreden / gehaald", "gemiddeld bevat je lunch het meeste calorieën"
- Trends: dag/week/maand-gemiddelden
- Verdeling per maaltijdtype
- Eventueel grafieken (lijn voor dagtotalen, stacked bars voor maaltijden)
- Bouwt voort op data uit sub-project C (historie)

### G. Wensenlijst voor de toekomst
**Status:** open / nog niet ingepland

- Doel-berekening via Mifflin-St Jeor formule (geslacht, leeftijd, lengte, gewicht, activiteit, gewenst tempo van afvallen) — als optie naast handmatige invoer
- Custom SMTP via Resend (3000 mails/maand gratis) — maakt het mogelijk om magic link login terug te brengen als alternatief naast email+wachtwoord, en transactional mails (welkom, badges, etc.) te sturen zonder Supabase free tier rate limit van 2 mails/uur
- Light mode als toggle in instellingen (basis is dark sporty)
- Privé producten — keuze per product om alleen voor jezelf zichtbaar te maken
- Duplicaten-detectie / merge-flow voor gedeelde producten database
- Quick-add bottom sheet op dashboard voor 1-klik invoer van favorieten / recent
- Vandalisme-bescherming voor gedeelde producten (moderation, edit history) — pas relevant bij groei
- Macro's toevoegen aan tracking (eiwit, koolhydraten, vet) en macro-doelen instellen
- Sport / verbrande calorieën bijhouden (negatieve kcal)
- Meerdere producten samenvoegen tot één gerecht
- Favoriete gerechten en producten
- Foto maken van een product → AI bepaalt welk product en kcal
- Database met gerechten en suggesties op basis van wat de gebruiker nog mag eten
- Splitsen van Supabase dev en prod environments (zodra de app echte gebruikers krijgt)
- Hosting migreren naar Cloudflare Pages / Netlify / Vercel (alle drie gratis met private repo support, edge caching wereldwijd) — relevant zodra de repo private moet worden of als de Pages-build te traag wordt
- Supabase MCP / directe SQL-uitvoering vanuit Claude — zodat schema-checks en data-verificatie ter plekke kunnen, terwijl alle wijzigingen nog steeds als `.sql`-migrations in `supabase/migrations/` worden weggeschreven (single source of truth blijft de migration-folder)
- UI-polish ronde — diverse styling/UX-zaken die niet mooi zijn op de PWA-versie (concrete punten verzamelen tijdens dagelijks gebruik)
- Update-prompt cache-invalidation onderzoeken — bug bevestigd 2026-04-30:
  - **Symptoom:** "Nieuwe versie beschikbaar"-toast verschijnt netjes, maar tap op Vernieuwen ververst niet altijd. Gebruiker moest soms alsnog handmatig de PWA-cache legen om de nieuwe versie te zien
  - **Hypothese:** `sw.js` doet wel `self.skipWaiting()` in install, maar geen `self.clients.claim()` in activate. Daardoor blijft de huidige pagina onder de OUDE SW-controller hangen tot een echte navigatie. `window.location.reload()` in `app.js:156` herlaadt onder die oude controller → resources uit oude cache → niets verandert visueel
  - **Mogelijke fix:** `self.clients.claim()` toevoegen in `activate` event van `sw.js`, en page-side luisteren op `controllerchange` vóór de reload (i.p.v. direct reload na tap)
  - **Code-pointers:** `src/js/app.js:120-145` (SW-registratie/updatefound), `src/js/app.js:148-158` (`showUpdatePrompt`), `src/sw.js` activate/install
  - **Testscenario:**
    1. PWA op iPhone staat op de huidige cache-versie
    2. Maak een goed-zichtbare visuele wijziging zonder functionele impact — bv. de bottom-nav UI-fix tijdelijk reverten (commits `86fb770` + `aad3842` → flat squares terug) óf de accent-kleur even van groen naar oranje
    3. Bump `CACHE_NAME` in `sw.js`, commit + push, wacht op GitHub-Pages-deploy
    4. Open de PWA → toast moet verschijnen → tap Vernieuwen
    5. **Verifieer:** wijziging is direct zichtbaar zonder dat handmatig cache leeg gemaakt hoeft te worden
    6. Revert de test-wijziging (of zet accent terug), bump cache nogmaals, push → herhaal stap 4-5 om reproduceerbaarheid te bewijzen (in beide richtingen smooth = fix werkt; één richting hapert = nog niet helemaal goed)

## Afgerond ✅

| Datum | Item |
|-------|------|
| 2026-04-26 | A. Foundation (Supabase, Auth via magic link, PWA, GitHub Pages deploy) |
| 2026-04-26 | B. Solo tracking MVP (dashboard, gedeelde producten, invoer, doelen) |
| 2026-04-27 | C. Historie & terugwerkende invoer (date-aware day-view met ‹ › nav, Historie-tab met week/maand toggle + anchor-stable navigation, individuele entry-rijen met edit-sheet + swipe-undo, `profile_history` tabel voor historisch correcte target/max-snapshots) |
| 2026-04-28 | D-A. Vrienden basis (handle, verzoeken met auto-accept bij wederzijdse intentie, per-gebruiker deel-niveau, Vrienden-tab met zoek + secties, vergelijk-carousel op dashboard, read-only friend dag-view) |
| 2026-04-29 | D-vervolg. Vrienden in week/maand-historie (friend day/week/month-views met ‹ › nav, gedeelde Dag/Week/Maand-header), één-klik kopiëren per-entry en per-maaltijd vanuit friend dag-view met date-picker bottom-sheet, `get_friend_period` RPC) |
| 2026-04-30 | F-A. NEVO seed (~2300 NL-staples in shared products-tabel met `source`/`nevo_code`/`synonyms`-kolommen, gecureerde `unit_grams` voor stukbare items, ranking-aware zoeken met synoniem-match en accent-strip, NEVO-attributie in Settings, Supabase CLI workflow + 14-digit migration-naamgeving) |

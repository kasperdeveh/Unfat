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

### J. Rollen & moderation — vervolg
**Status:** J-A afgerond (2026-05-03), J-B/C/D open

- **J-B**: editor mag ook andermans user-product **verwijderen**. Vraagt soft-delete + entry-merge omdat `entries.product_id` een FK met `on delete restrict` heeft. Voor nu: editors kunnen joke-producten alleen hernoemen + corrigeren.
- **J-C**: NEVO-rijen (`source='nevo'`) corrigeerbaar maken via een override-laag (extra tabel `product_overrides`), zodat een re-seed je correcties niet wegvaagt.
- **J-D**: volledig audit-log met voor/na waardes per edit (extra tabel + UI om in te zien). Pas relevant zodra het aantal editors of de hoeveelheid edits groeit.

### K. Gerechten / maaltijden
**Status:** open, brainstorm volgt

Meerdere producten bundelen tot één gerecht (bv. "Spaghetti bolognese") zodat een gebruiker in één tap een hele maaltijd kan loggen i.p.v. ingrediënten apart. Open vragen voor brainstorm:

- **Statisch vs. flexibel**: kan de gebruiker per keer afwijken (kleinere portie, ingrediënt weglaten zoals "zonder kaas")?
- **UX voor aanmaken**: vanaf toevoegen-pagina, vanuit Settings, of "verzamel-mode" waarbij je losse entries achteraf bundelt?
- **Datamodel**: 1 gerecht = 1 entry of 1 gerecht = N entries (één per ingrediënt)? Heeft impact op edit/delete-flow en op `entries.product_id` FK-structuur (NEVO + user products)
- **Interactie met sub-project L**: kunnen gerechten favoriet gemaakt worden?

Stappen: brainstorming → spec → plan → bouwen, eigen branch.

### L. Favorieten + "Vaak gegeten"
**Status:** open, brainstorm volgt

Snelle toegang tot producten en gerechten die je vaak eet. Vandaag toont het toevoegen-scherm "Recent" gebaseerd op de laatste entries, wat bij power-users alleen herhalingen oplevert. Twee complementaire mechanismen om af te wegen:

- **Vaak gegeten (auto)**: gebaseerd op hits laatste 30 dagen, geen handmatige actie nodig
- **Favoriete ster (handmatig)**: gebruiker pin't bewust een product/gerecht

Open vragen voor brainstorm:

- Combineren we beide secties of kiezen we één?
- Werken favorieten ook op gerechten (vereist K)?
- **Quick-add bottom sheet** op dashboard voor 1-klik invoer van favorieten/recent — onderdeel van dit sub-project of los?
- Hoe verhoudt dit zich tot de Recent-aanpassing uit sessie 1 (waar Recent ingekort wordt)?

Stappen: brainstorming → spec → plan → bouwen, eigen branch.

### H. Statistieken & inzichten
**Status:** open

- Persoonlijke stats: "deze maand X keer doel overschreden / gehaald", "gemiddeld bevat je lunch het meeste calorieën"
- Trends: dag/week/maand-gemiddelden
- Verdeling per maaltijdtype
- Eventueel grafieken (lijn voor dagtotalen, stacked bars voor maaltijden)
- Bouwt voort op data uit sub-project C (historie)

### I. Offline-first
**Status:** open / als los sub-project oppakken

Calorietracker = mobile, en mobile = soms zonder bereik (trein, metro, sportschool-kelder, vliegtuig). Vandaag faalt elke `createEntry`/`updateEntry`/`deleteEntry` offline silent. Doel: alle write-acties optimistic + lokaal gequeued; sync bij `online`-event of zichtbaar-worden van de tab.

- Lokale `IndexedDB`-tabel `pending_entries` (geen externe lib nodig)
- UUID-generatie client-side zodat de UI de entry direct krijgt zonder op de server te wachten
- Sync-flow: queue → POST naar Supabase → bij succes uit queue, bij fail blijft retried bij volgende `online`
- Conflict-strategie: append-only entries hebben geen merge-issues; updates/deletes = last-write-wins op client-side timestamp
- Edge cases: rollback-flow als Supabase de entry alsnog afkeurt (RLS, validation), 2 devices die offline waren en pas later synchroniseren, IndexedDB-quota op iOS Safari (50 MB voor PWA's, ruim voldoende)
- UI: subtiele indicator in entry-rij ("nog niet gesynced") tot bevestigd
- Stappen: brainstorming → spec → plan → bouwen, eigen branch

### G. Wensenlijst voor de toekomst
**Status:** open / nog niet ingepland

- "Wachtwoord vergeten?"-knop op login → `auth.resetPasswordForEmail()` + landing-page voor nieuwe wachtwoord. Waarde stijgt zodra er meer dan 5 echte users zijn; rate-limit van Supabase free tier (~2 mails/dag) is een bottleneck bij groei → relevant samen met Resend-migratie
- Doel-berekening via Mifflin-St Jeor formule (geslacht, leeftijd, lengte, gewicht, activiteit, gewenst tempo van afvallen) — als optie naast handmatige invoer
- Custom SMTP via Resend (3000 mails/maand gratis) — maakt het mogelijk om magic link login terug te brengen als alternatief naast email+wachtwoord, en transactional mails (welkom, badges, etc.) te sturen zonder Supabase free tier rate limit van 2 mails/uur
- Light mode als toggle in instellingen (basis is dark sporty)
- Theme-instelling om het uiterlijk aan te passen — minimaal accent-kleur kiezen (bv. mint-groen / oranje / blauw); gebruiker liet zien dat oranje (`#ff9800`) ook prima werkt op dark, dus de basis-set kan klein blijven
- Privé producten — keuze per product om alleen voor jezelf zichtbaar te maken
- Duplicaten-detectie / merge-flow voor gedeelde producten database
- Vandalisme-bescherming voor gedeelde producten (moderation, edit history) — pas relevant bij groei
- Macro's toevoegen aan tracking (eiwit, koolhydraten, vet) en macro-doelen instellen
- Sport / verbrande calorieën bijhouden (negatieve kcal)
- Foto maken van een product → AI bepaalt welk product en kcal
- Database met gerechten en suggesties op basis van wat de gebruiker nog mag eten
- Splitsen van Supabase dev en prod environments (zodra de app echte gebruikers krijgt)
- Hosting migreren naar Cloudflare Pages / Netlify / Vercel (alle drie gratis met private repo support, edge caching wereldwijd) — relevant zodra de repo private moet worden of als de Pages-build te traag wordt
- Supabase MCP / directe SQL-uitvoering vanuit Claude — zodat schema-checks en data-verificatie ter plekke kunnen, terwijl alle wijzigingen nog steeds als `.sql`-migrations in `supabase/migrations/` worden weggeschreven (single source of truth blijft de migration-folder)
- UI-polish ronde — diverse styling/UX-zaken die niet mooi zijn op de PWA-versie (concrete punten verzamelen tijdens dagelijks gebruik)
- Loading-skeletons doortrekken naar `history`, `friends`, `friend-day/week/month` en `add-food` (vandaag alleen `day` gedaan als demo)
- A11y-pass voor pre-launch: `aria-label` op icon-only knoppen (✓/✗/⋯/‹›), `role="progressbar"` op hero-bar, kleurcontrast WCAG AA, `viewport: user-scalable=no` weghalen (double-tap-zoom is al via CSS+JS opgelost)
- Account-delete + data-export self-service in Settings (relevant bij publieke launch / >10 echte users; tot die tijd via Supabase Dashboard)

## Afgerond ✅

| Datum | Item |
|-------|------|
| 2026-04-26 | A. Foundation (Supabase, Auth via magic link, PWA, GitHub Pages deploy) |
| 2026-04-26 | B. Solo tracking MVP (dashboard, gedeelde producten, invoer, doelen) |
| 2026-04-27 | C. Historie & terugwerkende invoer (date-aware day-view met ‹ › nav, Historie-tab met week/maand toggle + anchor-stable navigation, individuele entry-rijen met edit-sheet + swipe-undo, `profile_history` tabel voor historisch correcte target/max-snapshots) |
| 2026-04-28 | D-A. Vrienden basis (handle, verzoeken met auto-accept bij wederzijdse intentie, per-gebruiker deel-niveau, Vrienden-tab met zoek + secties, vergelijk-carousel op dashboard, read-only friend dag-view) |
| 2026-04-29 | D-vervolg. Vrienden in week/maand-historie (friend day/week/month-views met ‹ › nav, gedeelde Dag/Week/Maand-header), één-klik kopiëren per-entry en per-maaltijd vanuit friend dag-view met date-picker bottom-sheet, `get_friend_period` RPC) |
| 2026-04-30 | F-A. NEVO seed (~2300 NL-staples in shared products-tabel met `source`/`nevo_code`/`synonyms`-kolommen, gecureerde `unit_grams` voor stukbare items, ranking-aware zoeken met synoniem-match en accent-strip, NEVO-attributie in Settings, Supabase CLI workflow + 14-digit migration-naamgeving) |
| 2026-05-01 | Update-prompt cache-invalidation fix: tap "Vernieuwen" leidt nu in één tap tot een schone reload op de nieuwe SW (root cause was stale bytes uit GitHub-Pages HTTP-cache tijdens SW-install — opgelost met `Request(..., { cache: 'reload' })`); door-gebruiker-bestuurde activatie via `SKIP_WAITING` postMessage + `controllerchange`-listener; subtiele app-versie onderaan Settings live uit `caches.keys()` |
| 2026-05-03 | J-A. Rollen & moderation: producten editten (drie rollen `user`/`editor`/`admin` op `profiles`, editors/admins kunnen alle user-producten wijzigen via potlood-knop in portion-screen, admin-rolbeheer in Settings, light edit-trail via server-trigger, decimaal-input fix voor stuks op iOS Safari, RPC alias-fix) |

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

### F. Open Food Facts integratie + barcode scanning
**Status:** open

- Producten zoeken via OFF API (eerst goed testen, vorige keer werkte deze API niet lekker)
- Barcode scannen via camera (gebruikt OFF voor product-data)
- Eigen producten cache uitbreiden met OFF data

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

## Afgerond ✅

| Datum | Item |
|-------|------|
| 2026-04-26 | A. Foundation (Supabase, Auth via magic link, PWA, GitHub Pages deploy) |
| 2026-04-26 | B. Solo tracking MVP (dashboard, gedeelde producten, invoer, doelen) |
| 2026-04-27 | C. Historie & terugwerkende invoer (date-aware day-view met ‹ › nav, Historie-tab met week/maand toggle + anchor-stable navigation, individuele entry-rijen met edit-sheet + swipe-undo, `profile_history` tabel voor historisch correcte target/max-snapshots) |
| 2026-04-28 | D-A. Vrienden basis (handle, verzoeken met auto-accept bij wederzijdse intentie, per-gebruiker deel-niveau, Vrienden-tab met zoek + secties, vergelijk-carousel op dashboard, read-only friend dag-view) |
| 2026-04-29 | D-vervolg. Vrienden in week/maand-historie (friend day/week/month-views met ‹ › nav, gedeelde Dag/Week/Maand-header), één-klik kopiëren per-entry en per-maaltijd vanuit friend dag-view met date-picker bottom-sheet, `get_friend_period` RPC) |

# Sub-projecten A + B — Foundation + Solo tracking MVP

**Status:** Brainstorm afgerond — klaar voor review
**Datum start:** 2026-04-26

## Scope

Deze spec bundelt **A. Foundation** (Supabase, auth, PWA, deploy) en **B. Solo tracking MVP** (dashboard, producten beheer, calorieën-invoer, doelen) omdat ze samen een minimale werkende app vormen.

Doel: een werkende app waarmee één gebruiker dagelijks calorieën kan tracken, opgehangen aan een persoonlijk streefdoel + max.

## Beslissingen

### Doelen instellen
- MVP: gebruiker voert handmatig **streefdoel** (kcal) en **absolute max** (kcal) in
- Berekening op basis van gewicht/lengte/leeftijd/activiteit (Mifflin-St Jeor) — **later** (zie ROADMAP G)

### Maaltijdtypes
- MVP: invoer wordt gelabeld met een **maaltijdtype**: ontbijt, lunch, diner, snack
- Dashboard toont per maaltijd een sub-totaal naast het dagtotaal
- Reden: geeft veel meer waarde aan dashboard én is makkelijker om nu in te bouwen dan later te retrofitten (vooral i.v.m. "maaltijden delen met vrienden" in sub-project D)

### Producten model
- Elk product heeft: `id`, `name`, `kcal_per_100g` (verplicht), `unit_grams` (optioneel — gewicht van één stuk), `created_by` (FK naar `auth.users`), `created_at`
- **Producten zijn gedeeld** tussen alle gebruikers — iedereen draagt bij aan de gezamenlijke database
- Bij invoer kiest gebruiker: aantal **gram** OF aantal **stuks** (alleen beschikbaar als `unit_grams` is gezet)
- Sluit aan op Open Food Facts data structuur (sub-project F)
- Voorbeeld: banaan = 88 kcal/100g, unit_grams = 102 → "1.5 stuks" of "150 gram" werken beide

### RLS policies producten
- `SELECT`: alle ingelogde gebruikers
- `INSERT`: alle ingelogde gebruikers (`created_by` automatisch `auth.uid()`)
- `UPDATE` / `DELETE`: alleen rijen waar `created_by = auth.uid()`

### Authentication
- MVP: **email + wachtwoord** via Supabase Auth (signUp + signInWithPassword)
- Email-bevestiging staat UIT in Supabase project (account direct bruikbaar na registratie)
- Reden voor afwijking van originele magic-link plan: Supabase free tier heeft een rate limit van 2 mails per uur per project (totaal, ongeacht email-adres) waardoor magic link voor zelfs 1 enkele tester onbruikbaar is. Email + wachtwoord vereist geen mails en heeft geen rate limit.
- Magic link kan later terugkomen als alternatieve methode zodra custom SMTP (Resend) is opgezet — zie ROADMAP G

### App-structuur
- **Single-page application (SPA)**: één `index.html`, JS swap views via mini hash-router
- Geen build step (vanilla JS, ES modules direct)
- Reden: vloeiende app-ervaring op iPhone (geen page-flash), past bij PWA karakter

### Views in MVP
| # | View | Doel |
|---|---|---|
| 1 | **Login** | Magic link sturen + landingsscherm na klik op link |
| 2 | **Onboarding** | Verplichte setup van doelen na eerste login |
| 3 | **Dashboard (home)** | Dag-overzicht: kcal ingenomen / over / per maaltijd |
| 4 | **Voeg eten toe** | Zoek bestaand product OF + nieuw product. Daarna portie + maaltijd kiezen. Aparte pagina (geen modal) i.v.m. ruimte voor toekomstige features (favorieten, recent, barcode). |
| 5 | **Instellingen** | Streefdoel + max-doel + uitloggen |

### Navigatie
- Bottom nav met **3 tabs**: Home · Voeg toe · Instellingen
- Login en onboarding hebben geen bottom nav
- Voeg-toe-pagina ook bereikbaar via knop op dashboard (zelfde view)

### Visuele stijl
- **Dark sporty** als basis (donkere achtergrond, fluo-groene accent #00e676)
- Sfeer: motiverend, energiek, "doel halen"
- Past bij naam Unfat (krachtig, doel-gericht)
- Light mode kan later als optie in instellingen — zie ROADMAP G

### Onboarding (eerste keer login)
- Na de eerste succesvolle magic-link login → direct naar **verplicht setup-scherm**: "Welkom! Stel je dagdoel en max in."
- Pas na save → dashboard
- Daarna kan de gebruiker doelen wijzigen via Instellingen

### Visuele feedback (3 staten)
Het hero-card op het dashboard wisselt van kleur op basis van actuele stand:

| Staat | Conditie | Kleur | Tekst |
|---|---|---|---|
| Groen | `gehad ≤ streefdoel` | gradient #00e676 → #00b248 | "Nog beschikbaar: X kcal" |
| Oranje | `streefdoel < gehad ≤ max` | gradient #ffa726 → #fb8c00 | "Boven streefdoel" + waarschuwingsbadge |
| Rood | `gehad > max` | gradient #ef5350 → #c62828 | "Max overschreden" + kritieke badge |

App blokkeert nooit invoer — visuele signalen zijn voldoende.

---

## Datamodel

Vier tabellen: ingebouwde `auth.users`, plus drie eigen tabellen.

### Enum: `meal_type`
```sql
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
```

### Tabel: `profiles`
Eén-op-één met `auth.users`. Bevat doelen.

| Kolom | Type | Notitie |
|---|---|---|
| `id` | uuid PK | FK naar `auth.users.id`, on delete cascade |
| `daily_target_kcal` | int not null | Streefdoel in kcal |
| `daily_max_kcal` | int not null | Absoluut max in kcal |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | trigger update on change |

**RLS:**
- `SELECT`/`INSERT`/`UPDATE`/`DELETE`: alleen waar `id = auth.uid()`

### Tabel: `products` (gedeeld)
Door één gebruiker aangemaakt, voor iedereen zichtbaar.

| Kolom | Type | Notitie |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `name` | text not null | |
| `kcal_per_100g` | int not null | check > 0 |
| `unit_grams` | int nullable | gewicht van 1 stuk; NULL = alleen per gram invoerbaar |
| `created_by` | uuid not null | FK auth.users |
| `created_at` | timestamptz | default `now()` |

**RLS:**
- `SELECT`: alle ingelogde gebruikers
- `INSERT`: alle ingelogde gebruikers (`created_by = auth.uid()`)
- `UPDATE`/`DELETE`: alleen rijen waar `created_by = auth.uid()`

**Indexen:** `lower(name)` voor case-insensitive zoeken.

### Tabel: `entries`
Eén rij per ingevoerde maaltijd-item. `kcal` is **snapshot** bij invoer (zie ontwerpkeuze hieronder).

| Kolom | Type | Notitie |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid not null | FK auth.users |
| `product_id` | uuid not null | FK products |
| `amount_grams` | numeric(10,2) not null | omgerekend uit user-invoer |
| `kcal` | int not null | snapshot bij invoer (`amount_grams * product.kcal_per_100g / 100`) |
| `meal_type` | meal_type not null | enum |
| `date` | date not null | dag van consumptie (default `current_date`) |
| `created_at` | timestamptz | default `now()` |

**RLS:** alle CRUD alleen waar `user_id = auth.uid()`.

**Indexen:** `(user_id, date)` voor snel dagoverzicht.

### Ontwerpkeuzes datamodel
- **`kcal` als snapshot in `entries`**: bij invoer berekend en opgeslagen. Voorkomt dat historische dagen veranderen als productdata later wordt aangepast.
- **`date` als losse kolom (geen timestamp)**: gebruiker kiest expliciet voor welke dag een invoer telt. Maakt back-dating in sub-project C eenvoudig.

---

## Pages & routes

| Route | View | Bottom nav | Wanneer |
|---|---|---|---|
| `#/login` | Login | verborgen | Niet ingelogd |
| `#/onboarding` | Setup-doelen | verborgen | Eerste keer login, nog geen `profiles`-rij |
| `#/` | Dashboard | Home actief | Standaard na login |
| `#/add` | Voeg eten toe (search) | Voeg toe actief | Optionele query `?meal=<type>` om vanaf dashboard een maaltijd voor te selecteren |
| `#/add/portion?product=<id>&meal=<type>` | Portie + maaltijd kiezen | Voeg toe actief | Na product-selectie. `meal` parameter optioneel |
| `#/add/new` | Nieuw product aanmaken | Voeg toe actief | Bij "kan niet vinden" — query `?meal=<type>` wordt doorgegeven |
| `#/settings` | Instellingen | Settings actief | |

## Flows

### Flow 1 — Login (magic link)
1. Gebruiker landt op `#/login`. Eén input (e-mail) + knop "Stuur login-link"
2. Klik → Supabase verstuurt mail. Bevestiging op scherm: "Check je mail"
3. Gebruiker klikt link in mail → Supabase redirect naar de app met sessie-token in URL hash
4. JS leest token, zet sessie, redirect naar `#/` (of `#/onboarding` als nog geen profile)

### Flow 2 — Onboarding
1. App detecteert: ingelogd, maar geen rij in `profiles`
2. Forceer `#/onboarding`. Twee inputs: streefdoel + max. Save
3. Profile wordt aangemaakt via INSERT → redirect `#/`

### Flow 3 — Dashboard `#/`
- Header: "Vandaag — vrijdag 26 april" (dynamisch in NL)
- Hero-card (groen/oranje/rood) met grote "Nog beschikbaar" of "Boven streefdoel"-tekst
- Vier maaltijd-rijen (ontbijt/lunch/diner/snack), elk met sub-totaal
- Lege maaltijd-rijen tonen "+ toevoegen"
- Tap op maaltijd-rij → naar `#/add?meal=<type>` met die maaltijd alvast geselecteerd
- Bottom nav

### Flow 4 — Voeg eten toe (de meest gebruikte flow)

**Stap A — `#/add`** Zoek-pagina:
- Header met "← Terug" knop
- Zoekbalk (lokaal filter op productnaam, case-insensitive)
- Scrollbare productenlijst met `name` + `kcal/100g`
- Onderaan: prominente **"+ Nieuw product aanmaken"** knop (altijd zichtbaar)

**Stap B — `#/add/portion?product=<id>`** Portie-pagina:
- Geselecteerd product bovenaan (groene card met naam + kcal/100g)
- Toggle: gram OF stuks (stuks alleen als product `unit_grams` heeft)
- Number-input voor hoeveelheid
- Live preview: "= X kcal"
- Maaltijd-selector (4 grote buttons: ontbijt/lunch/diner/snack), pre-selected uit URL `meal` parameter
- Save-knop (volledige breedte, accent kleur)
- Save → INSERT in `entries` → terug naar `#/` met toast "Toegevoegd: X kcal"

**Sub-flow — `#/add/new`** Nieuw product:
- Form: naam + kcal/100g + optioneel unit_grams
- Save → INSERT in `products` → meteen redirect naar Stap B met dat product geselecteerd

### Flow 5 — Instellingen `#/settings`
- Streefdoel-input
- Max-doel-input
- Save-knop (UPDATE in `profiles`)
- Onderaan: "Uitloggen" knop (Supabase signOut → redirect `#/login`)
- Onderaan klein: e-mailadres + "geregistreerd op [datum]"

---

## Architectuur

### File-structuur
```
/                                # repo root
  src/                           # ← deze map wordt gepubliceerd op GitHub Pages
    index.html                   # SPA entry, laadt app.js
    manifest.json                # PWA manifest
    sw.js                        # Service worker
    css/style.css                # Main styles (dark sporty)
    js/
      app.js                     # Init: router + session check
      router.js                  # Mini hash-router (~30 regels)
      supabase.js                # Supabase client init
      config.js                  # Supabase URL + anon key (publiek)
      auth.js                    # Magic link, session helpers
      views/                     # Eén bestand per view
        login.js
        onboarding.js
        dashboard.js
        add-food.js              # Stap A: search
        add-food-portion.js      # Stap B: portie + maaltijd
        add-food-new.js          # Nieuw product
        settings.js
      db/                        # Database queries per tabel
        profiles.js
        products.js
        entries.js
    icons/                       # PWA icons (192, 512)
  supabase/
    migrations/
      20260426_initial.sql       # Schema, RLS, enum
  docs/                          # (bestaat al)
  .github/workflows/deploy.yml   # GitHub Pages deploy
  CLAUDE.md
```

### Module verantwoordelijkheden
- `app.js` — single entry point. Init Supabase, init router, trigger session check
- `router.js` — luistert op `hashchange`, mapt route → view module + render in `<main>` element
- `supabase.js` — exporteert geïnitialiseerde Supabase client
- `auth.js` — `sendMagicLink(email)`, `getSession()`, `onAuthChange(cb)`, `signOut()`
- `db/*.js` — pure CRUD-helpers per tabel, zonder UI
- `views/*.js` — exporteert `render(container, params)` functie

### Supabase configuratie
- `js/config.js` bevat **Supabase URL + anon key**, in code, gecommit naar git
- Anon key is publiek — beveiliging zit in RLS policies, niet in geheimhouding van de key
- Service role key NIET in client (niet nodig voor MVP)

---

## PWA setup

### `manifest.json`
```json
{
  "name": "Unfat",
  "short_name": "Unfat",
  "description": "Calorietracker met motivatie en sociale features",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0f12",
  "theme_color": "#00e676",
  "lang": "nl",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service worker (`sw.js`)
- Bij `install`: cache `index.html`, `css/`, `js/`, `icons/`, `manifest.json`
- Bij `fetch`: **cache-first** voor static assets, **network-first** voor `*.supabase.co` requests
- Versie-string in cache-naam (`unfat-v1`); bij nieuwe deploy wijzigt deze → oude cache invalideren
- Web Push komt later in sub-project E

---

## Deploy naar GitHub Pages

`.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]
permissions:
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: src/
      - uses: actions/deploy-pages@v4
```

Push naar main → app live op `https://<github-naam>.github.io/Unfat/` binnen 1-2 minuten.

---

## Local development

- Open `src/index.html` met Live Server VS Code extensie (port 5500)
- Supabase is cloud-gehost, dus geen lokale database setup
- Geen build step, geen `npm install`, geen tests
- PWA features (service worker, install) werken alleen via HTTPS — testen na eerste deploy

---

## Buiten scope (niet in MVP)

- Geen geautomatiseerde tests (handmatig testen in browser via Live Server)
- Geen build step / bundler
- Geen state management library
- Geen historie of back-dating (sub-project C)
- Geen vrienden of sociale features (D)
- Geen badges, push notifications, motivatie-teksten (E)
- Geen Open Food Facts of barcode scanning (F)
- Geen macro's (eiwit/koolhydraten/vet) — zie ROADMAP G
- Geen sport / verbrande calorieën — zie ROADMAP G
- Geen favorieten of recent gebruikt — komt eventueel als toevoeging op Voeg-toe pagina, niet voor MVP

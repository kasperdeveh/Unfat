# Sub-project D — Vrienden & sociale features (basis)

**Status:** Brainstorm afgerond — klaar voor review
**Datum start:** 2026-04-27

## Scope

Doel: gebruikers kunnen elkaar vinden via username, vriendschapsverzoeken sturen en accepteren, en op het dashboard een swipe-carousel zien met de dag-voortgang van hun vrienden — gefilterd op een per-gebruiker instelbaar deel-niveau.

Deze ronde dekt **scope A** uit roadmap-item D:
- Vrienden zoeken via username
- Verzoek sturen / accepteren / weigeren / intrekken / vriend verwijderen
- Per-gebruiker deel-niveau (niets / totaal / per maaltijd / entries)
- Vergelijk-widget op dashboard (swipe-carousel)
- Friend dag-view (vandaag) — vriend's dag inzien volgens hun deel-niveau

**Scope B** (vrienden in week/maand-historie) is **niet** in deze ronde, maar het ontwerp houdt er rekening mee zodat geen breaking changes nodig zijn:
- `get_friend_day` RPC accepteert al elke `day` parameter, niet alleen `current_date`
- Friend dag-view is een aparte route die later ‹ › navigatie kan krijgen zonder rewrite
- `profile_history` lookup voor target/max op willekeurige dag werkt al

**Niet in deze ronde**: blokkeren, realtime updates, push-notificaties, producten/maaltijden kopiëren van vrienden, competitie-element, vriend in week/maand-historie.

## Beslissingen

### Vriendschapsmodel — één tabel met status (Approach 1)
- Eén rij per relatie: `friendships(user_id_a, user_id_b, requested_by, status, ...)` met PK `(a, b)` en CHECK `a < b`
- Status: `'pending'` (verzoek uit) of `'accepted'` (vrienden)
- Verzoek versturen = INSERT pending; accepteren = UPDATE → accepted; weigeren / intrekken / unfriend = DELETE
- Geen aparte `friend_requests`-tabel: voorkomt sync-issues en dubbel RLS-werk
- App sorteert UUIDs voor insert/lookup; view `my_friends` verbergt de `case when`-logica voor leesqueries

### Auto-accept bij wederzijdse intentie
`send_friend_request` is idempotent en lift verzoeken automatisch naar `accepted` als de andere partij al een verzoek heeft openstaan. Vier mogelijke uitkomsten:

| Bestaande situatie | Resultaat | RPC-return |
|---|---|---|
| Geen rij | INSERT pending | `'requested'` |
| Verzoek staat al uit van mij | no-op | `'already_pending'` |
| Verzoek staat uit naar mij | UPDATE → accepted | `'auto_accepted'` |
| Al vrienden | no-op | `'already_friends'` |

Voordeel: race conditions worden geen errors maar features; idempotente UI; "wij stuurden allebei tegelijk" wordt automatisch een vriendschap.

### Username/handle
- 3-20 tekens, regex `^[A-Za-z0-9_-]+$`
- Opgeslagen zoals ingevoerd (`Kasper`), uniciteit + zoeken case-insensitive via `unique index on lower(handle)`
- Verplicht in onboarding voor nieuwe gebruikers
- Optioneel/leeg voor bestaande gebruikers tot ze de Vrienden-tab openen → modal blokkeert tab tot handle is gezet
- Handle later wijzigen kan in Settings (vrienden zien nieuwe naam bij volgende refresh)

### Privacy-niveaus (per gebruiker, niet per vriend)
Eén globale instelling per gebruiker, default = `entries`:

| `share_level` | Wat vrienden zien | UI-label (NL) |
|---|---|---|
| `none` | Niets behalve handle | Niets |
| `total` | + dag-totaal kcal, target, max | Totaal |
| `per_meal` | + per-maaltijd kcal-cijfers | Per maaltijd |
| `entries` | + lijst van entries (product-naam, hoeveelheid, kcal, maaltijd) | Alles |

Gekozen voor concrete enum-waarden (`entries`) i.p.v. abstract (`detailed`) omdat de waarde 1-op-1 mapt op de tabel waar de data vandaan komt.

### Friend-data via RPC, niet via RLS
Friend's `entries` en `profile_history` blijven strict eigen via RLS. Toegang voor vrienden gaat via **`SECURITY DEFINER` RPC `get_friend_day(friend_user_id, day)`** die intern het `share_level` van de vriend respecteert en alleen het juiste subset teruggeeft. Reden: RLS kan geen geaggregeerd-vs-detail granulariteit afdwingen; RPC wel.

### Vrienden-tab toegevoegd aan bottom nav
Bottom nav wordt: **Dashboard · Voeg toe · Historie · Vrienden · Instellingen** (5 tabs).
Vrienden-tab krijgt een rood badge-bolletje met getal bij inkomende verzoeken.

### Vergelijk-widget op dashboard — swipe-carousel
Onder eigen voortgangsblok. Eén kaart per vriend, swipe horizontaal, dot-indicator. Geen vrienden = geen widget (geen lege placeholder).

Kaartinhoud schaalt met `share_level` van die vriend:
- `none` → handle + "Sanne deelt geen voortgang"
- `total` → + progress bar + totaal/target
- `per_meal` → + 4 maaltijd-cijfertjes
- `entries` → bovenstaande, met entries beschikbaar in friend dag-view

Tap op een kaart opent altijd de friend dag-view, ongeacht `share_level`. De dag-view rendert intern dezelfde scaled inhoud (inclusief de "deelt geen voortgang"-state bij `none`).

### Friend dag-view
Aparte route `#/friend?id=<uuid>&date=YYYY-MM-DD` (date default = vandaag). Toont vriend's dag volgens `share_level`. In scope A geen ‹ › nav. Voorbereid voor scope B.

### Geen blokkeren, geen notificaties
Beide YAGNI in scope A. Push-notificaties bij verzoeken horen bij sub-project E (badges/notifications).

### Geen realtime
Vergelijk-widget en Vrienden-tab refreshen bij open / pull-to-refresh. Realtime via Supabase channels = YAGNI.

---

## Datamodel

### Wijzigingen op `profiles`

| Kolom | Type | Notitie |
|---|---|---|
| `handle` | text nullable | 3-20 chars, regex `^[A-Za-z0-9_-]+$` via CHECK |
| `share_level` | text not null default `'entries'` | CHECK in (`none`, `total`, `per_meal`, `entries`) |

**Constraints:**
- `unique index on lower(handle) where handle is not null` — case-insensitive uniciteit
- CHECK regex op handle-format (alleen als handle is not null)

**RLS:** ongewijzigd (`profiles_*_own`). Friend-zichtbaarheid van handle/share_level loopt via RPC's, niet via directe SELECT.

### Nieuwe tabel: `friendships`

| Kolom | Type | Notitie |
|---|---|---|
| `user_id_a` | uuid not null | FK `auth.users` on delete cascade |
| `user_id_b` | uuid not null | FK `auth.users` on delete cascade |
| `requested_by` | uuid not null | FK `auth.users` on delete cascade |
| `status` | text not null | CHECK in (`pending`, `accepted`) |
| `created_at` | timestamptz | default `now()` |
| `accepted_at` | timestamptz nullable | gezet bij accept |

**Constraints:**
- `PRIMARY KEY (user_id_a, user_id_b)`
- `CHECK (user_id_a < user_id_b)` — vaste ordering, voorkomt dubbele rijen voor één paar
- `CHECK (requested_by in (user_id_a, user_id_b))`
- `CHECK ((status = 'accepted' and accepted_at is not null) or (status = 'pending' and accepted_at is null))`

**Indexen:** PK volstaat voor "rijen voor mij" via `auth.uid() in (a, b)` — Postgres kan beide PK-kolommen scannen. Geen extra indexen nodig op deze schaal.

**RLS-policies:**
- SELECT: `auth.uid() in (user_id_a, user_id_b)`
- INSERT: `requested_by = auth.uid()` AND `status = 'pending'` AND `auth.uid() in (user_id_a, user_id_b)`
- UPDATE: alleen pending → accepted, alleen door de ontvanger (`auth.uid() in (a,b) and auth.uid() != requested_by`)
- DELETE: `auth.uid() in (user_id_a, user_id_b)` (beide partijen mogen verwijderen)

### View: `my_friends`

```sql
create view my_friends as
select
  case when user_id_a = auth.uid() then user_id_b else user_id_a end as friend_id,
  status,
  requested_by,
  created_at,
  accepted_at
from friendships
where auth.uid() in (user_id_a, user_id_b);
```

Verbergt de `case when`-logica voor app-code. Respecteert RLS van onderliggende tabel automatisch.

### RPC's

Alle RPC's zijn `SECURITY DEFINER` waar nodig en valideren `auth.uid()` zelf.

#### `search_users(query text) returns table(...)`
- Lower-cased prefix-match: `lower(handle) like lower(query) || '%'`
- LIMIT 20
- Return per rij: `user_id`, `handle` (zoals opgeslagen), `friendship_status` (`null`, `'pending_outgoing'`, `'pending_incoming'`, `'accepted'`)
- Filtert `auth.uid()` zelf uit resultaat
- Filtert rijen met `handle is null`

#### `send_friend_request(target_user_id uuid) returns text`
- Errors: `target_user_id = auth.uid()` ("not_self"), target heeft geen handle ("invalid_target")
- Sorteert UUIDs intern → `(min, max)`
- Logica:
  - Geen rij → INSERT pending → return `'requested'`
  - Pending van mij → no-op → return `'already_pending'`
  - Pending van ander → UPDATE → accepted → return `'auto_accepted'`
  - Accepted → no-op → return `'already_friends'`
- Implementatie via `INSERT ... ON CONFLICT (user_id_a, user_id_b) DO UPDATE SET status='accepted', accepted_at=now() WHERE friendships.status='pending' AND friendships.requested_by != auth.uid() RETURNING ...`

#### `respond_friend_request(other_user_id uuid, accept bool) returns void`
- Verifieert: paar bestaat, status = `pending`, `auth.uid() != requested_by`
- Accept: UPDATE status = `accepted`, accepted_at = `now()`
- Reject: DELETE rij

#### `unfriend(other_user_id uuid) returns void`
- DELETE rij voor het paar (werkt zowel voor pending — eigen verzoek intrekken — als voor accepted — unfriend)
- Geen error als paar niet bestaat (idempotent)

#### `get_friend_day(friend_user_id uuid, day date) returns jsonb`
- Verifieert: jullie zijn `accepted` vrienden (anders error `'not_friends'`)
- Leest `share_level` uit vriend's `profiles`
- Leest target/max uit vriend's `profile_history` voor `day` (zelfde `valid_from <= day ORDER BY valid_from DESC LIMIT 1` lookup als eigen historie)
- Return-shape (jsonb):

```json
{
  "share_level": "entries",
  "handle": "Sanne",
  "target": 1800,         // alleen bij total/per_meal/entries
  "max": 2000,            // idem
  "total_kcal": 1450,     // idem
  "per_meal": {           // alleen bij per_meal/entries
    "breakfast": 320, "lunch": 580, "dinner": 550, "snack": 0
  },
  "entries": [            // alleen bij entries
    { "product_name": "Boterham bruin", "amount_grams": 70, "kcal": 175, "meal_type": "breakfast" },
    ...
  ]
}
```

- `share_level = 'none'` → return `{ share_level: 'none', handle }` (geen verdere data)
- `target/max = null` als vriend op die dag nog geen `profile_history`-rij heeft (relevant voor scope B)

### Migration

`supabase/migrations/<datum>_friends.sql`:

```sql
-- profiles uitbreiding
alter table profiles add column handle text;
alter table profiles add column share_level text not null default 'entries'
  check (share_level in ('none', 'total', 'per_meal', 'entries'));
alter table profiles add constraint profiles_handle_format
  check (handle is null or handle ~ '^[A-Za-z0-9_-]{3,20}$');
create unique index profiles_handle_lower_idx on profiles (lower(handle))
  where handle is not null;

-- friendships
create table friendships (
  user_id_a uuid not null references auth.users(id) on delete cascade,
  user_id_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_id_a, user_id_b),
  check (user_id_a < user_id_b),
  check (requested_by in (user_id_a, user_id_b)),
  check (
    (status = 'accepted' and accepted_at is not null)
    or (status = 'pending' and accepted_at is null)
  )
);

alter table friendships enable row level security;

create policy "friendships_select_own_pair"
  on friendships for select
  using (auth.uid() in (user_id_a, user_id_b));

create policy "friendships_insert_as_requester"
  on friendships for insert
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and auth.uid() in (user_id_a, user_id_b)
  );

create policy "friendships_update_accept_only"
  on friendships for update
  using (
    auth.uid() in (user_id_a, user_id_b)
    and auth.uid() != requested_by
  );

create policy "friendships_delete_either_party"
  on friendships for delete
  using (auth.uid() in (user_id_a, user_id_b));

-- view
create view my_friends as
select
  case when user_id_a = auth.uid() then user_id_b else user_id_a end as friend_id,
  status,
  requested_by,
  created_at,
  accepted_at
from friendships
where auth.uid() in (user_id_a, user_id_b);

-- RPC's: search_users, send_friend_request, respond_friend_request, unfriend, get_friend_day
-- (zie sectie hierboven voor logica; SQL volgt in implementation plan)
```

---

## Pages & routes

| Route | View | Bottom nav | Wanneer |
|---|---|---|---|
| `#/friends` | Vrienden-tab (zoek + verzoeken + lijst) | Vrienden | Tab tap |
| `#/friend?id=<uuid>&date=YYYY-MM-DD` | Friend dag-view | Vrienden | Tap vriend in lijst of carousel-kaart bij `entries`-niveau |
| `#/onboarding` | Onboarding (bestaand) — uitgebreid met handle-stap | — | Nieuwe gebruiker |
| `#/settings` | Settings (bestaand) — uitgebreid met handle + share_level | Instellingen | — |
| `#/` | Dashboard (bestaand) — uitgebreid met vergelijk-widget | Dashboard | — |

**Belangrijke keuzes:**
- `date` parameter in `#/friend` is optioneel (default = vandaag). Bereidt scope B voor.
- `id` parameter is verplicht — ontbreekt of niet-vriend → redirect naar `#/friends`.
- Geen aparte `#/friends/requests` route — verzoeken zijn gewoon een sectie in `#/friends`.

---

## Flows

### Flow 1 — Onboarding nieuwe gebruiker
1. Onboarding doelen-stap → Volgende → **handle-stap** (nieuw)
2. Type "Kasper" → debounced check serverside (300ms): "Beschikbaar ✓"
3. Klik Voltooien → UPDATE `profiles.handle = 'Kasper'` → INSERT `profile_history` (zoals nu) → redirect `#/`

### Flow 2 — Bestaande gebruiker zonder handle opent Vrienden-tab
1. Tap Vrienden-tab → `#/friends`
2. Detect `profiles.handle is null` → render blokkerende modal "Kies een username"
3. Type handle → live availability-check → Voltooien
4. Modal sluit, Vrienden-tab is normaal bruikbaar

### Flow 3 — Vriend zoeken en verzoek sturen
1. Vrienden-tab → typ "san" in zoekveld → `search_users('san')` na debounce
2. Resultaten verschijnen onder zoekveld: "Sanne — [Toevoegen]"
3. Tap [Toevoegen] → `send_friend_request(sanne_id)` → return `'requested'`
4. Toast "Verzoek verstuurd aan Sanne" + zoekresultaat-knop wordt "Verzoek verstuurd" (disabled)
5. Verstuurde-verzoeken-sectie krijgt nieuwe rij

### Flow 4 — Auto-accept (wederzijds verzoek)
1. Sanne heeft eerder verzoek aan Kasper gestuurd (Kasper ziet 'm in inkomende verzoeken)
2. Kasper zoekt Sanne via username, tap [Toevoegen] (zonder eerst Accept te tappen)
3. `send_friend_request` detecteert pending van Sanne → UPDATE → accepted → return `'auto_accepted'`
4. Toast "Jij en Sanne zijn nu vrienden" + Vrienden-tab refresht (verzoek weg, vriend in lijst)

### Flow 5 — Inkomend verzoek accepteren
1. Vrienden-tab toont "Inkomende verzoeken (1) — Sanne ✓ ✗"
2. Tap ✓ → `respond_friend_request(sanne_id, true)`
3. Verzoek-rij verdwijnt, Sanne verschijnt in vrienden-lijst, badge op tab-icoon verdwijnt

### Flow 6 — Vergelijk-widget op dashboard
1. Open `#/` → dashboard rendert eigen voortgang
2. Parallel: voor elke vriend in `my_friends` (status accepted) → `get_friend_day(friend_id, today)`
3. Render carousel met één kaart per vriend, scaled naar `share_level`
4. Swipe horizontaal → volgende vriend
5. Tap een kaart → `#/friend?id=<uuid>&date=<today>` (ongeacht `share_level`)

### Flow 7 — Friend dag-view
1. `#/friend?id=<sanne>&date=2026-04-27`
2. Render: header met handle + datum, hero (target/max/totaal kleuren), maaltijd-secties met entries
3. Tonen alleen wat `share_level` toelaat:
   - `none` → toont "Sanne deelt geen voortgang"
   - `total` → alleen hero, geen maaltijd-secties
   - `per_meal` → hero + maaltijd-totalen, geen entry-rijen
   - `entries` → volledig (read-only, geen edit/delete)
4. Geen ‹ › nav (scope A); back-knop → `#/friends`

### Flow 8 — Privacy wijzigen
1. Settings → Wat deel je met vrienden → tap dropdown
2. Kies "Per maaltijd" → UPDATE `profiles.share_level = 'per_meal'`
3. Toast "Bijgewerkt"
4. Vrienden zien nieuwe niveau bij volgende refresh van hun widget/dag-view

### Flow 9 — Vriend verwijderen
1. Vrienden-tab → tap menu naast vriend-rij → "Verwijderen"
2. Bevestig-dialog → `unfriend(friend_id)`
3. Vriend verdwijnt uit lijst, vergelijk-widget verliest die kaart

### Flow 10 — Verstuurd verzoek intrekken
1. Vrienden-tab → Verstuurde verzoeken-sectie → tap "Intrekken" naast rij
2. `unfriend(target_id)` (zelfde RPC werkt voor pending uit ons)
3. Rij verdwijnt

---

## Architectuur

### Nieuwe modules
```
src/js/
  views/
    friends.js                  NIEUW — Vrienden-tab (zoek + verzoeken + lijst)
    friend-day.js               NIEUW — Read-only dag-view voor een vriend
    components/
      compare-widget.js         NIEUW — Swipe-carousel voor dashboard
      handle-input.js           NIEUW — Handle-veld met live availability-check
  db/
    friendships.js              NIEUW — RPC-wrappers (searchUsers, sendRequest,
                                respondRequest, unfriend, listFriendships,
                                getFriendDay)
```

### Wijzigingen op bestaande modules

| Module | Wijziging |
|---|---|
| `views/onboarding.js` | Extra stap "Kies username" tussen doelen en voltooien; gebruikt `handle-input` component |
| `views/settings.js` | Twee nieuwe rijen: handle (wijzigbaar via sheet) en deel-niveau (segmented control) |
| `views/day.js` | Render `compare-widget` onder eigen voortgangsblok; alleen als `my_friends` (accepted) niet leeg is |
| `db/profiles.js` | Helpers `updateHandle(handle)`, `updateShareLevel(level)` |
| `router.js` | Routes `#/friends` en `#/friend` toegevoegd |
| `index.html` | Bottom nav krijgt 5e tab "Vrienden" met badge-element |
| `css/style.css` | Carousel-styles (horizontale scroll, snap), Vrienden-tab layout, handle-input states (✓/✗/loading), badge-bolletje op tab-icoon |
| `supabase.js` | RPC-call helpers indien niet al aanwezig |

### Module verantwoordelijkheden

- **`views/friends.js`** — top-level Vrienden-tab. Beheert zoek-input (debounced), rendert drie secties (inkomend, verstuurd, vrienden), routeert naar `#/friend` of opent unfriend-confirm.
- **`views/friend-day.js`** — pure render-view. Roept `getFriendDay(id, date)` en rendert resultaat scaled naar `share_level`. Geen edit/delete.
- **`views/components/compare-widget.js`** — pure component: `mount(container, friends)`. Beheert swipe-state, dot-indicator, lazy-fetcht `getFriendDay` per vriend (parallel `Promise.all`).
- **`views/components/handle-input.js`** — pure component: `mount(container, { initial, onValid })`. Beheert debounce (300ms), live RPC-check, error-states. Herbruikbaar in onboarding én Settings.
- **`db/friendships.js`** — dunne RPC-wrappers. Geen business-logica.

### Performance-overweging
- Vergelijk-widget op dashboard fetcht voor élke vriend `get_friend_day` — bij 10 vrienden = 10 RPC-calls. Acceptabel op deze schaal; bij groei eventueel batch-RPC `get_friends_day(date)`.
- Search debounce 300ms voorkomt overbelasting.
- Vrienden-tab fetcht bij open: één query `my_friends`, één query verzoeken (gebundeld in `my_friends` via status filter), één RPC voor handles van betrokkenen — overweging: combineer in één RPC `list_friends_with_handles()` voor minder round-trips.

---

## Buiten scope (niet in sub-project D-A)

- **Vrienden in week/maand-historie** (scope B-vervolg): `#/friend` krijgt dan ‹ › navigatie, en Historie-tab krijgt vriend-context-toggle
- **Producten of maaltijden kopiëren** van vriend naar eigen entries (scope C)
- **Competitie-element** "wie blijft deze week vaakst binnen z'n doel" (scope C)
- **Push-notificaties** bij inkomend verzoek (sub-project E)
- **Realtime updates** via Supabase channels
- **Blokkeren / mute** van gebruikers
- **Handle-verandering met rename-history** of vriend-melding
- **Geautomatiseerde tests** — handmatig testen via Live Server, conform project-conventie

---

## Manuele testchecklist

### Onboarding nieuwe gebruiker
- [ ] Nieuwe signup → handle-stap verschijnt na doelen
- [ ] Live check toont "Beschikbaar ✓" voor unieke handle
- [ ] Live check toont "Al in gebruik" voor duplicate (test: andere user heeft "kasper" → typ "Kasper")
- [ ] Live check blokkeert te korte (<3) en te lange (>20) handles, en ongeldige tekens (spaties, emoji)
- [ ] Voltooien-knop disabled tot handle geldig + uniek

### Bestaande gebruiker zonder handle
- [ ] Open Vrienden-tab → modal verschijnt
- [ ] Modal kan niet weg-getapt worden zonder handle te zetten
- [ ] Na zetten: modal sluit, Vrienden-tab is leeg/zoekbaar

### Zoeken en verzoek versturen
- [ ] Typ <3 chars → geen RPC-call
- [ ] Typ "san" → na 300ms verschijnen resultaten
- [ ] Eigen handle staat niet in resultaten
- [ ] Tap [Toevoegen] → toast "Verzoek verstuurd"
- [ ] Knop wordt direct "Verzoek verstuurd" (disabled)
- [ ] Verstuurde-verzoeken-sectie krijgt nieuwe rij

### Auto-accept flow
- [ ] User A stuurt verzoek aan B → A ziet "verstuurd", B ziet inkomend
- [ ] User B zoekt A en tapt [Toevoegen] (zonder Accept) → toast "Jij en A zijn nu vrienden"
- [ ] Beide users: verzoek weg, vriend in lijst

### Verzoek accepteren / weigeren
- [ ] Inkomend verzoek tonen met ✓ ✗
- [ ] Tap ✓ → vriend verschijnt in lijst, badge-teller op tab-icoon -1
- [ ] Tap ✗ → verzoek weg, andere user ziet "verstuurd verzoek" verdwijnen bij refresh

### Verzoek intrekken
- [ ] Verstuurd verzoek → tap "Intrekken" → rij weg
- [ ] Andere user: inkomend verzoek verdwijnt bij refresh

### Vriend verwijderen
- [ ] Tap menu naast vriend → "Verwijderen" → bevestig
- [ ] Vriend weg uit lijst, vergelijk-widget verliest kaart
- [ ] Andere user: vriend weg uit lijst bij refresh

### Vergelijk-widget op dashboard
- [ ] 0 vrienden → geen widget zichtbaar
- [ ] 1 vriend → 1 kaart, geen swipe-indicator nodig (of subtiel)
- [ ] 3 vrienden → swipe werkt, dots tonen positie
- [ ] Tap op elke kaart (alle deel-niveaus) → opent `#/friend?id=...&date=today`
- [ ] Kaart bij `share_level = 'none'` → toont "X deelt geen voortgang" + tap opent dag-view die zelfde melding toont

### Privacy-niveaus
- [ ] Settings → kies "Niets" → vriend ziet alleen handle in widget en dag-view
- [ ] Kies "Totaal" → vriend ziet target/max/totaal, geen maaltijd-uitsplitsing of entries
- [ ] Kies "Per maaltijd" → bovenstaande + 4 maaltijd-cijfers, geen entries
- [ ] Kies "Alles" (default) → volledige inzage in entries
- [ ] Wijziging zichtbaar bij vriend na refresh (niet realtime)

### Friend dag-view
- [ ] Open via tap kaart of vriend-lijst → toont vriend's dag van vandaag
- [ ] Header toont handle + datum
- [ ] Hero kleurt volgens vriend's target/max
- [ ] Bij `share_level = 'none'` → "Sanne deelt geen voortgang"
- [ ] Read-only: geen + toevoegen, geen edit-tap, geen swipe-delete
- [ ] Back-knop → terug naar `#/friends`

### Edge cases
- [ ] User probeert verzoek aan zichzelf (via gemanipuleerde call) → RPC errored
- [ ] User probeert `get_friend_day` voor non-vriend → RPC errored, frontend toast
- [ ] Vriend verwijdert account → ON DELETE CASCADE → friendship-rij weg → widget refresh
- [ ] Twee users tegelijk willen handle "test123" claimen → unique index, tweede update faalt → frontend toont validatie-error
- [ ] User wijzigt eigen handle → vrienden zien nieuwe naam bij volgende refresh
- [ ] User wijzigt deel-niveau → ook reeds-geopende widgets/dag-views tonen nieuwe niveau bij refresh

### Migration veiligheid
- [ ] Bestaande users behouden hun profiles-rij; krijgen `handle = null` en `share_level = 'entries'`
- [ ] Geen data-verlies in `entries` of `profile_history`
- [ ] Bestaande RLS-policies op andere tabellen ongewijzigd

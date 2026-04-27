# Sub-project C — Historie & terugwerkende invoer

**Status:** Brainstorm afgerond — klaar voor review
**Datum start:** 2026-04-27

## Scope

Doel: gebruiker kan eerdere dagen, weken en maanden inzien én entries voor het verleden toevoegen, wijzigen of verwijderen. Historisch correcte beoordeling: een dag wordt gekleurd op basis van de target/max die op die dag gold, niet de huidige.

Dit is een uitbreiding op sub-projecten A+B (foundation + solo MVP). Datamodel `entries` heeft al een `date` kolom — backdating is data-technisch al mogelijk; deze spec voegt UI, navigatie en target-snapshotting toe.

## Beslissingen

### Architectuur — hybrid
- **Dashboard wordt date-aware** met ‹ › pijltjes om naar recente dagen te navigeren
- **Nieuwe 4e tab "Historie"** in bottom nav voor langere termijn (week/maand-overzicht)
- Eén dag-view (`day.js`) wordt gedeeld door `#/` (vandaag) en `#/day?date=...` (verleden)

### Historie-tab — Week / Maand toggle
- Toggle bovenaan tussen Week-view en Maand-view
- **Week-view**: 7 dag-rijen (ma-zo), elk met dagnaam, datum, voortgangsbalk in status-kleur, kcal-totaal
- **Maand-view**: kalendergrid, elke cel toont datumnummer + kcal-totaal in status-kleur. Dagen vóór maand-start grijs, dagen zonder invoer "—", vandaag heeft accent-rand.
- Bovenaan periode-header: gemiddelde kcal/dag + "doel gehaald: X / Y"

### Periode-navigatie
- Pijlen ‹ › navigeren tussen periodes (week of maand afhankelijk van toggle)
- Sub-regel onder periode-titel:
  - Bij huidige periode: statisch label `Week 17 · deze week` of `april · deze maand`
  - Bij andere periode: `Week 15 · ⌖ vandaag` (pill is klikbaar, springt naar huidige periode)
- Pijl-positie verandert nooit — pill vervangt de tekst, niet de layout
- Pijl ‹ disabled bij datum vóór account-creatie; pijl › disabled na vandaag

### Dag-view (gedeeld voor vandaag en verleden)
- Header: dagnaam + datum (bv. "Donderdag 16 april") + back-knop
- Hero-card (groen/oranje/rood) met aangepaste tekst per context:
  - Vandaag, onder doel: "Nog beschikbaar: X kcal"
  - Vandaag/verleden, doel gehaald: "Doel gehaald" + onder-aantal
  - Boven streefdoel: "Boven streefdoel · +X"
  - Boven max: "Boven max · +X"
- 4 maaltijd-secties met **individuele entry-rijen** (vervangt de huidige `·`-gescheiden string)
- Per entry: tap = bottom-sheet edit, swipe-left = quick delete
- Per maaltijd onderaan: "+ toevoegen" knop → add-flow met datum + meal alvast geselecteerd

### Entry-bewerken
- **Tap entry** → bottom-sheet met: hoeveelheid-input, gram/stuks-toggle, maaltijdtype-selector, opslaan-knop, delete-knop
- **Swipe-left** → quick delete + undo-toast (4 sec)
  - Tap "Undo" → re-INSERT met dezelfde gegevens (kcal, amount_grams, meal_type, date)
  - Na 4 sec → DELETE definitief

### Backdating-routes
1. **Via Historie-tab**: tap dag → dag-view → "+ toevoegen" per maaltijd
2. **Via dashboard-pijltjes**: ‹ naar gisteren → "+ toevoegen" per maaltijd
3. Globale "+" tab in bottom nav blijft altijd vandaag (geen date-context)

### Datum-scope
- Onbeperkt terug tot account-creatie (impliciete grens via disabled ‹)
- Geen toekomstige dagen — pijl › disabled na vandaag, planning is buiten scope

### Target/max snapshotting
- Nieuwe tabel `profile_history` houdt bij vanaf welke dag een target/max gold
- Bij elke wijziging in Settings: UPSERT op `(user_id, today)`
- Bij dag-render: lookup target/max via `WHERE valid_from <= dag ORDER BY valid_from DESC LIMIT 1`
- Backdating klopt altijd: ook een vergeten dag uit het verleden krijgt zijn historisch correcte target

### Bottom nav — 4 tabs
Home · Voeg toe · **Historie** · Settings

---

## Datamodel

### Nieuwe tabel: `profile_history`

| Kolom | Type | Notitie |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid not null | FK `auth.users` on delete cascade |
| `daily_target_kcal` | int not null | check > 0 |
| `daily_max_kcal` | int not null | check > 0 |
| `valid_from` | date not null | vanaf welke dag deze waardes gelden |
| `created_at` | timestamptz | default `now()` |

**Constraints:** `UNIQUE(user_id, valid_from)` — voorkomt dubbele rijen op dezelfde dag (UPSERT-vriendelijk).

**RLS:** alle CRUD alleen waar `user_id = auth.uid()`.

**Indexen:** `(user_id, valid_from DESC)` voor snelle most-recent lookup.

### Geen schema-wijzigingen op bestaande tabellen
- `profiles` blijft (snel pad voor dashboard van vandaag)
- `entries` blijft — heeft al `date` kolom, backdating is technisch al mogelijk

### Schrijfgedrag profile_history
- Bij **onboarding** (eerste profile-INSERT): ook INSERT in profile_history met `valid_from = today` en zelfde target/max
- Bij **Settings save** (profile-UPDATE):
  - Als target óf max daadwerkelijk verandert: UPSERT in profile_history op `(user_id, today)` met de nieuwe waardes
  - Als waardes hetzelfde zijn: niks
- Meerdere wijzigingen op één dag: UPSERT zorgt dat alleen de laatste waarde voor die dag overblijft

### Leesgedrag
- "Huidige target" (dashboard van vandaag): uit `profiles` (geen extra query)
- "Target op datum X" (verleden dagen, week/maand-view): uit `profile_history`
- Voor week/maand-view: één query `listProfileHistory()` + één query `listEntriesForDateRange()`, daarna in-memory grouping per dag — geen N+1

### Migration

`supabase/migrations/20260427_history.sql`:

```sql
create table profile_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_target_kcal int not null check (daily_target_kcal > 0),
  daily_max_kcal int not null check (daily_max_kcal > 0),
  valid_from date not null,
  created_at timestamptz not null default now(),
  unique (user_id, valid_from)
);

create index profile_history_user_valid_from_idx
  on profile_history (user_id, valid_from desc);

alter table profile_history enable row level security;

create policy "own rows select" on profile_history
  for select using (user_id = auth.uid());
create policy "own rows insert" on profile_history
  for insert with check (user_id = auth.uid());
create policy "own rows update" on profile_history
  for update using (user_id = auth.uid());
create policy "own rows delete" on profile_history
  for delete using (user_id = auth.uid());

-- Eenmalige seeding voor bestaande users
insert into profile_history (user_id, daily_target_kcal, daily_max_kcal, valid_from)
select id, daily_target_kcal, daily_max_kcal, created_at::date
from profiles
on conflict (user_id, valid_from) do nothing;
```

---

## Pages & routes

| Route | View | Bottom nav | Wanneer |
|---|---|---|---|
| `#/` | dag-view voor vandaag | Home | Standaard |
| `#/day?date=YYYY-MM-DD` | dag-view voor andere datum | Home of Historie afhankelijk van bron | Vanuit Historie of dashboard ‹ |
| `#/history` | Week-view, huidige week | Historie | Default Historie-tab |
| `#/history?view=week&start=YYYY-MM-DD` | Week-view, gegeven week | Historie | Bij week-navigatie |
| `#/history?view=month&start=YYYY-MM-01` | Maand-view, gegeven maand | Historie | Bij toggle naar maand |
| `#/add?meal=<type>&date=YYYY-MM-DD` | Search (bestaand) | Voeg toe | `date` optioneel — default vandaag |
| `#/add/portion?product=<id>&meal=<type>&date=YYYY-MM-DD` | Portie (bestaand) | Voeg toe | `date` doorgegeven |
| `#/add/new?meal=<type>&date=YYYY-MM-DD` | Nieuw product (bestaand) | Voeg toe | `date` doorgegeven |
| `#/settings` | Settings (bestaand) | Settings | + UPSERT in profile_history bij doel-wijziging |

**Belangrijke keuzes:**
- `#/` en `#/day?date=...` gebruiken **dezelfde view-module** (`day.js`) — `#/` rendert met date=today, `#/day` met param
- `date` parameter wordt doorgevoerd door de hele add-flow (search → portion → save schrijft entry met die date)
- Globale "+" tab geeft géén date door = altijd vandaag
- History-route bevat alle state in URL — refresh of deeplink werkt direct

---

## Flows

### Flow 1 — Backdating via Historie-tab
1. Tab "Historie" → kalender/week-view
2. Tap dag (bv. 16 april) → `#/day?date=2026-04-16`
3. Tap "+ toevoegen" onder een maaltijd → `#/add?meal=lunch&date=2026-04-16`
4. Search → portion → Save
5. INSERT in `entries` met `date=2026-04-16`
6. Toast "Toegevoegd aan lunch op 16 april" → terug naar `#/day?date=2026-04-16`

### Flow 2 — Backdating via dashboard-pijltjes
1. `#/` (vandaag) → pijl ‹ → `#/day?date=<gisteren>`
2. Vanaf hier identiek aan Flow 1 stap 3+

### Flow 3 — Entry bewerken
1. In dag-view, tap entry-rij → bottom-sheet (modal-style, geen route-change)
2. Wijzig hoeveelheid, gram/stuks, of maaltijdtype
3. Save → UPDATE in `entries` (kcal recompute via `amount_grams * product.kcal_per_100g / 100`) → sheet sluit, dag-view herlaadt

### Flow 4 — Swipe-to-delete met undo
1. Swipe entry-rij naar links → rij animeert weg
2. DELETE in `entries`
3. Toast onderaan: "Verwijderd · ↶ Undo" — 4 sec
4. Tap "Undo" → re-INSERT met dezelfde gegevens (in-memory state)
5. Na 4 sec → DELETE definitief

### Flow 5 — Historie-tab navigatie
1. Bottom-nav "Historie" → `#/history` (week-view, huidige week)
2. Toggle Maand → `#/history?view=month&start=2026-04-01`
3. Pijl ‹ of › → vorige/volgende periode (URL update)
4. Pill `⌖ vandaag` (alleen bij niet-huidige periode) → terug naar huidige
5. Tap dag-cel → `#/day?date=...`

### Flow 6 — Doel wijzigen + impact op historie
1. Settings → wijzig target en/of max → Save
2. UPDATE `profiles` (huidige waarde, voor snelle dashboard-render vandaag)
3. UPSERT `profile_history` op `(user_id, today)` met nieuwe waardes — alleen als minstens één van target/max veranderde
4. Toast "Doelen bijgewerkt"
5. Historie van vóór vandaag blijft op oude target gekleurd; vanaf vandaag op nieuwe

### Flow 7 — Eerste profile-creatie (onboarding)
1. Onboarding-form → Save
2. INSERT `profiles` (zoals nu)
3. **Nieuw:** INSERT `profile_history` met `valid_from = today` en zelfde target/max
4. Redirect naar `#/`

---

## Architectuur

### Nieuwe modules
```
src/js/
  views/
    day.js                       NIEUW — date-aware dag-view, vervangt dashboard.js
    history.js                   NIEUW — Historie-tab met week/maand toggle
    components/
      week-view.js               NIEUW — week-rendering helper (7 dag-rijen)
      month-view.js              NIEUW — kalender-grid helper
      edit-entry-sheet.js        NIEUW — bottom-sheet voor entry edit
  db/
    profile_history.js           NIEUW — listProfileHistory, upsertProfileHistory, getTargetForDate
  utils/
    dates.js                     NIEUW — weekStart, monthStart, isoWeekNumber, NL-formatters
```

### Wijzigingen op bestaande modules

| Module | Wijziging |
|---|---|
| `views/dashboard.js` | Verplaatst naar `views/day.js` — neemt `date` als param. Logica blijft, maar date-aware hero-tekst en individuele entry-rendering. |
| `views/add-food.js` | `date` param uit URL accepteren, doorgeven aan portion + new |
| `views/add-food-portion.js` | `date` param accepteren, INSERT in entries met die date i.p.v. `current_date` |
| `views/add-food-new.js` | `date` param doorgeven aan portion redirect |
| `views/onboarding.js` | Bij Save: ook INSERT in `profile_history` (valid_from=today) |
| `views/settings.js` | Bij Save: UPSERT in `profile_history` op `(user_id, today)` als waardes wijzigen |
| `db/entries.js` | Nieuwe helpers: `updateEntry(id, fields)`, `deleteEntry(id)`, `listEntriesForDateRange(start, end)` |
| `router.js` | Routes `#/day`, `#/history` toegevoegd. `#/` rendert dezelfde `day.js` met date=today. |
| `index.html` | Bottom nav krijgt 4e tab "Historie" |
| `css/style.css` | Styles voor toggle, kalender-grid, edit-sheet (slide-up), swipe-undo-toast, dag-rijen |

### Module verantwoordelijkheden

- **`views/day.js`** — eén view voor `#/` (vandaag) en `#/day?date=X`. Haalt entries op + target via `profile_history` lookup. Rendert hero, maaltijdrijen, entry-rijen. Hooks voor edit-sheet en swipe-delete.
- **`views/history.js`** — top-level Historie-tab. Beheert toggle-state (week/maand) + periode-state. Render-logica delegeert aan `week-view.js` of `month-view.js`.
- **`views/components/edit-entry-sheet.js`** — pure component: `open(entry, onSave, onDelete)`. Beheert sheet-DOM, focus, dismiss op overlay-tap.
- **`db/profile_history.js`** — `listProfileHistory()`, `upsertProfileHistory(target, max, validFrom)`, `getTargetForDate(history, date)` (pure helper, neemt array + datum).
- **`utils/dates.js`** — week/maand-grenzen, ISO weeknummer, NL-formatters.

### Performance-overweging
Voor maand-view (30+ dagen): één query `listEntriesForDateRange(monthStart, monthEnd)` + één query `listProfileHistory()` per render, dan in-memory grouping per dag. Geen N+1 lookups.

---

## Buiten scope (niet in sub-project C)

- **Stats & aggregaties** (sub-project H): "deze maand X keer doel gehaald", gemiddelde lunch-kcal, lijngrafieken, doel-streaks
- **Vooruit plannen** / toekomstige dagen invoeren — pijl › disabled na vandaag
- **Filters op maaltijdtype in Historie** — week/maand tonen totalen, geen filter
- **Entry verplaatsen tussen dagen via drag-drop** — kan via edit-sheet (mealtype + datum), niet via gesture
- **Bulk operations** (kopieer hele dag, "gisteren = vandaag" knop)
- **Wijzigen van profile_history-rijen zelf** (handmatige correctie van oude target-snapshots)
- **Export / import** van entries
- **Geautomatiseerde tests** — handmatig testen via Live Server, conform project-conventie

---

## Manuele testchecklist

### Backdating-flow
- [ ] Historie → tap gisteren → check dag-view klopt (datum-header, totalen, juiste hero-staat)
- [ ] + toevoegen onder Lunch → search → portie → save → check entry verschijnt op gisteren met juiste datum
- [ ] Toast verschijnt en redirect terug naar `#/day?date=<gisteren>`
- [ ] Globale "+" tab → defaulten naar vandaag (geen date-param)
- [ ] Pijl ‹ op `#/` → naar gisteren; opnieuw ‹ → eergisteren

### Entry bewerken (edit-sheet)
- [ ] Tap entry → sheet opent met huidige waardes voorgevuld
- [ ] Wijzig hoeveelheid → save → kcal recompute klopt, lijst geüpdatet
- [ ] Wijzig maaltijdtype (lunch → diner) → entry verschuift naar andere maaltijd
- [ ] Wijzig gram ↔ stuks toggle → conversie klopt
- [ ] Sluit sheet zonder save (overlay-tap of swipe-down) → niks gewijzigd
- [ ] Delete-knop in sheet → entry weg + sheet sluit

### Swipe-to-delete + undo
- [ ] Swipe entry naar links → animatie + entry weg + undo-toast verschijnt
- [ ] Tap "Undo" binnen 4 sec → entry komt terug, zelfde plek/waarden
- [ ] Wacht 4 sec → toast verdwijnt, entry blijft weg (definitief)
- [ ] Twee entries snel achter elkaar verwijderen → toast vervangt of stapelt; gedrag bevestigen

### Historie-tab — week-view
- [ ] Open Historie tab → toont week-view, huidige week (ma-zo)
- [ ] Header toont datum-range + "Week 17 · deze week", géén pill
- [ ] Gemiddelde + doel-counter klopt
- [ ] Pijl ‹ → vorige week, header verandert, pill `⌖ vandaag` verschijnt
- [ ] Tap pill → terug naar huidige week, pill verdwijnt
- [ ] Pijl › na huidige week → disabled
- [ ] Tap dag-rij → naar `#/day?date=...`

### Historie-tab — maand-view
- [ ] Toggle Maand → kalendergrid voor huidige maand
- [ ] Dagen vóór 1ste van maand grijs
- [ ] Dagen zonder invoer tonen "—" (grijs)
- [ ] Dagen mét invoer tonen kcal in status-kleur (groen/oranje/rood)
- [ ] Vandaag heeft accent-rand
- [ ] Tap kalendercel → naar `#/day?date=...`
- [ ] Pijl ‹ / › → maand vorige/volgende, pill werkt identiek

### Doel wijzigen + impact op historie
- [ ] Settings → wijzig target van 2200 → 1800 → save
- [ ] Ga naar Historie → check eerdere dagen behouden hun originele kleur
- [ ] Ga naar `#/` (vandaag) → hero gebruikt nieuwe target (1800)
- [ ] Wijzig op dezelfde dag nog eens (1800 → 1900) → check `profile_history` bevat slechts één rij voor vandaag (UPSERT)
- [ ] Wijzig naar exact dezelfde waardes → check géén nieuwe rij in profile_history

### Edge cases
- [ ] Account vandaag aangemaakt, pijl ‹ → disabled bij dag vóór account-creatie
- [ ] Backdate entry op dag vóór account-creatie via direct URL `#/day?date=<oudedatum>` → niet bereikbaar of geblokkeerd
- [ ] Maand-view in maand met deels geen entries → grijs voor lege dagen
- [ ] Switch toggle Week ↔ Maand op niet-huidige periode → blijft op die periode

### Profile-history seeding (eenmalig na migration)
- [ ] Bestaande user uit MVP-fase krijgt na migration één rij in profile_history met huidige target/max + valid_from = profiles.created_at
- [ ] Historie-view voor die user toont oude entries met correcte kleur

# Sub-project D-vervolg — Vrienden in historie + kopiëren

**Status:** Brainstorm afgerond — klaar voor review
**Datum start:** 2026-04-29
**Bouwt voort op:** D-A (basis-vrienden, afgerond 2026-04-28)

## Scope

Doel: gebruiker kan door de week- en maand-historie van een vriend bladeren met dezelfde UI als de eigen Historie-tab, en met één-klik losse entries of hele maaltijden van die vriend overnemen naar een gekozen datum in eigen account.

Deze ronde dekt **scope B + kopiëren uit C** uit roadmap-item D:
- Friend dag-view krijgt ‹ › datum-navigatie (begrensd op vriend's account-creatie)
- Friend week-view (bars per dag) en friend maand-view, bereikbaar via Dag/Week/Maand-toggle in friend-views
- Per-entry én per-maaltijd kopiëren vanuit friend dag-view
- Bottom-sheet date-picker bij elke kopieer-actie (default = vandaag)

**Niet in deze ronde** (geparkeerd op ROADMAP):
- Per-dag-kopiëren (4× per-maaltijd volstaat als workaround)
- Vergelijk-widget verfijning (per-vriend ster of Settings-dropdown)
- Competitie-element ("wie blijft deze week vaakst binnen z'n doel")
- Notificeren van vriend bij kopieer-actie

## Beslissingen

### Entry point friend-historie — toggle in friend dag-view (Approach B)
Friend dag-view, friend week-view en friend maand-view delen één gemeenschappelijke header met handle + segmented `Dag | Week | Maand`-toggle. Toggle switcht alleen tussen views van dezelfde vriend; vriend wisselen gebeurt via `‹ Vrienden`-back-knop.

Reden: schone scheiding met eigen Historie-tab (blijft puur "mijn historie"), en het is de natuurlijke spiegel van de eigen Vandaag/Historie-flow. Toggle-in-eigen-historietab (mengt context) en kebab-menu-in-vrienden-tab (extra UI) afgewogen en afgevallen.

### Granulariteit kopiëren — entry + maaltijd (Approach B)
Twee kopieer-knoppen in friend dag-view bij `share_level = 'entries'`:
- Op elke meal-section-header: "Kopieer" → kopieert alle entries van die maaltijd
- Op elke entry-row: "Kopieer" → kopieert alleen die entry

Per-dag-kopiëren afgevallen omdat het simpelweg 4× per-maaltijd is en YAGNI; later toevoegen kan zonder herontwerp.

### Datum-keuze — bottom-sheet picker (Approach B)
Elke kopieer-tap opent een bottom-sheet met date-picker. Default = vandaag (`today_iso()`). Gebruiker bevestigt of wijzigt → kopiëren gebeurt naar gekozen datum.

Reden: gebruiker wil expliciete controle over de doel-datum. "Altijd vandaag" laat het scenario "ik vergat gisteren te tracken, kopieer piet's gisteren naar mijn gisteren" liggen. "Mirror op zichtbare datum" is impliciet en kan verwarrend zijn.

### Conflict-handling — altijd toevoegen
Kopiëren voegt altijd toe aan bestaande entries op de doel-datum. Geen vervang/merge-dialog. Bestaand swipe-undo-mechanisme regelt fouten.

Reden: matcht bestaand `createEntry`-pattern; in praktijk kopieer je juist als je doel-maaltijd nog leeg is; extra dialog na de date-picker maakt de flow zwaar.

### meal_type — automatisch overgenomen
Vriend's `lunch` → jouw `lunch`. Geen keuze om naar een andere maaltijd te kopiëren.

### Friend-views: read-only
Geen edit, swipe-delete of toevoegen op friend-views — alleen kopiëren. Patroon van D-A blijft consistent.

### Friend ‹ › nav-grens
- **Linkergrens**: vriend's `profiles.created_at`-datum. Knop disabled op die dag.
- **Rechtergrens**: vandaag. Knop disabled op vandaag.

In tegenstelling tot eigen day-view kun je dus voorbij je eigen account-creatie navigeren als de vriend eerder begon.

### Week/maand-format identiek aan eigen Historie-tab
Bars per dag, gekleurd volgens vriend's hero-state (groen = doel gehaald, oranje = boven streefdoel, rood = boven max). Anchor-stable navigation zoals eigen historie. Klik op een bar = navigate naar `#/friend-day` op die datum.

Verschil met eigen historie:
- Bars zijn gebaseerd op vriend's `total_kcal` per dag i.c.m. vriend's `target/max`-snapshots uit `profile_history`
- Geen entry-rijen of edit-flow
- Header-toggle heeft Dag-optie (eigen Historie heeft alleen Week/Maand omdat Dag = Vandaag-tab)

### share_level filter
Kopieer-knoppen verschijnen alleen bij `share_level = 'entries'`. Bij `total` of `per_meal` zijn er geen entries om te kopiëren. Bij `none` is heel de friend-view leeg (huidige gedrag blijft).

Friend week/maand-views zijn beschikbaar bij `total`, `per_meal` én `entries` (alle leveren `total_kcal` per dag). Bij `none` toont week/maand "Vriend deelt geen voortgang" (zoals dag-view nu al doet).

---

## Datamodel

### Migratie `20260429_friends_history.sql`

#### 1. Update `get_friend_day` — voeg `id` en `product_id` toe aan entries

Bij `share_level = 'entries'` moet de entries-array per item bevatten:
- `id` — entry-id van de vriend (voor selectief kopiëren)
- `product_id` — product-id (nodig voor `createEntry` re-create)
- `product_name`, `amount_grams`, `kcal`, `meal_type` — bestaand

```sql
-- in bestaand get_friend_day, replace de entries-aggregatie:
if v_share_level = 'entries' then
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'product_id', e.product_id,
    'product_name', p.name,
    'amount_grams', e.amount_grams,
    'kcal', e.kcal,
    'meal_type', e.meal_type
  ) order by e.created_at), '[]'::jsonb) into v_entries
  from public.entries e
  join public.products p on p.id = e.product_id
  where e.user_id = friend_user_id and e.date = day;
  result := result || jsonb_build_object('entries', v_entries);
end if;
```

Ook toevoegen aan top-level result: `friend_created_at` (vriend's `profiles.created_at`-datum) — nodig voor ‹ ›-grens. Door dit in `get_friend_day` mee te sturen voorkomen we een extra round-trip per dag-view-render.

#### 2. Nieuwe RPC `get_friend_period`

```sql
create or replace function public.get_friend_period(
  friend_user_id uuid,
  start_date date,
  end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  a uuid := least(caller, friend_user_id);
  b uuid := greatest(caller, friend_user_id);
  is_friend boolean;
  v_handle text;
  v_share_level text;
  v_friend_created date;
  v_days jsonb;
  result jsonb;
begin
  if caller is null then raise exception 'not_authenticated'; end if;

  select exists(
    select 1 from public.friendships
    where user_id_a = a and user_id_b = b and status = 'accepted'
  ) into is_friend;
  if not is_friend then raise exception 'not_friends'; end if;

  select handle, share_level, created_at::date
    into v_handle, v_share_level, v_friend_created
    from public.profiles where id = friend_user_id;

  result := jsonb_build_object(
    'share_level', v_share_level,
    'handle', v_handle,
    'friend_created_at', v_friend_created
  );

  if v_share_level = 'none' then
    return result;
  end if;

  -- per dag: total_kcal + target/max snapshot uit profile_history
  with date_series as (
    select generate_series(start_date, end_date, interval '1 day')::date as d
  ),
  totals as (
    select date as d, coalesce(sum(kcal), 0)::int as total_kcal
    from public.entries
    where user_id = friend_user_id
      and date between start_date and end_date
    group by date
  ),
  snapshots as (
    select ds.d,
      (select daily_target_kcal from public.profile_history
        where user_id = friend_user_id and valid_from <= ds.d
        order by valid_from desc limit 1) as target,
      (select daily_max_kcal from public.profile_history
        where user_id = friend_user_id and valid_from <= ds.d
        order by valid_from desc limit 1) as max
    from date_series ds
  )
  select jsonb_agg(jsonb_build_object(
    'date', ds.d,
    'total_kcal', coalesce(t.total_kcal, 0),
    'target', s.target,
    'max', s.max
  ) order by ds.d)
  into v_days
  from date_series ds
  left join totals t on t.d = ds.d
  left join snapshots s on s.d = ds.d;

  result := result || jsonb_build_object('days', v_days);
  return result;
end;
$$;

grant execute on function public.get_friend_period(uuid, date, date) to authenticated;
```

**Return-shape (jsonb):**

```json
{
  "share_level": "entries",
  "handle": "Sanne",
  "friend_created_at": "2026-03-15",
  "days": [
    { "date": "2026-04-22", "total_kcal": 1820, "target": 2000, "max": 2200 },
    { "date": "2026-04-23", "total_kcal": 2350, "target": 2000, "max": 2200 },
    ...
  ]
}
```

Bij `share_level = 'none'` → geen `days` array.

---

## Pages & routes

| Route | View | Wanneer |
|---|---|---|
| `#/friend-day?id=<uuid>&date=<iso>` | `friend-day.js` (bestaand, uitgebreid) | Tap kaart in vergelijk-widget; tap vriend-rij in Vrienden-tab; klik op bar in friend week/maand-view |
| `#/friend-week?id=<uuid>&anchor=<iso>` | `friend-week.js` (nieuw) | Tap "Week" in Dag/Week/Maand-toggle |
| `#/friend-month?id=<uuid>&anchor=<iso>` | `friend-month.js` (nieuw) | Tap "Maand" in Dag/Week/Maand-toggle |

**Routing-notitie:** Bestaande route was `#/friend?id=...` — wordt **`#/friend-day?id=...`** gehernoemd voor consistentie (`-day`, `-week`, `-month`). Eén edit in `router.js` en de plekken die navigeren (`compare-widget`, `friends.js`).

`anchor` parameter werkt zoals in eigen Historie-tab: punt-in-tijd dat gerendered moet worden, met `‹ ›` voor week/maand-stappen.

---

## Flows

### Flow 1 — Friend ‹ › datum-nav
1. `#/friend-day?id=<piet>&date=2026-04-28`
2. Render header: handle + datum + Dag/Week/Maand-toggle (Dag actief).
3. ‹-knop: navigate naar `?date=2026-04-27` (gedisabled als = `friend_created_at`).
4. ›-knop: navigate naar `?date=2026-04-29` (gedisabled als date = vandaag).
5. Re-fetch `get_friend_day` bij elke nav.

### Flow 2 — Switch naar Week-view
1. Vanuit `#/friend-day?id=<piet>&date=2026-04-28`, tap "Week" in toggle.
2. Navigate naar `#/friend-week?id=<piet>&anchor=2026-04-28`.
3. Header: handle + Dag/Week/Maand-toggle (Week actief).
4. Render bars (Mo–Su rond anchor): kleur per dag uit `total_kcal` vs `target/max`.
5. ‹ ›-knoppen schuiven anchor 7 dagen op. Linkergrens: anchor's week mag niet eerder dan vriend's `friend_created_at`. Rechtergrens: anchor's week mag niet later dan vandaag.
6. Tap een bar → navigate naar `#/friend-day?id=<piet>&date=<bar_date>`.

### Flow 3 — Switch naar Maand-view
Idem als Week, maar 28-31 bars en ‹ ›-knoppen schuiven per maand.

### Flow 4 — Per-entry kopiëren
1. In `#/friend-day` met `share_level = 'entries'`: tap "Kopieer" op een entry-row.
2. Bottom-sheet opent: titel "Kopieer naar...", date-picker (default = vandaag), Bevestig-knop.
3. Tap Bevestig → roep `createEntry({ product_id, amount_grams, kcal, meal_type, date: target_date })`.
4. Sheet sluit, toast "Gekopieerd naar 28 apr".
5. Friend day-view blijft open (geen navigate weg).

### Flow 5 — Per-maaltijd kopiëren
1. In `#/friend-day` met `share_level = 'entries'`: tap "Kopieer" op een meal-header.
2. Bottom-sheet opent: titel "Kopieer hele lunch naar...", date-picker, Bevestig.
3. Tap Bevestig → loop over alle entries van die meal: roep `createEntry` per entry.
4. Sheet sluit, toast "X entries gekopieerd naar 28 apr".

### Flow 6 — Empty state per-maaltijd-kopieer
1. Vriend's lunch is leeg → `entries.filter(e => e.meal_type === 'lunch').length === 0`.
2. Render meal-header zonder Kopieer-knop (of disabled).
3. Voorkomt verwarrende lege kopieer-acties.

### Flow 7 — share_level mismatch tijdens flow
1. Bottom-sheet open. Vriend wijzigt `share_level` van `entries` naar `total`.
2. Bevestig-tap → `get_friend_day` zou geen entries meer leveren bij refresh, maar de sheet werkt op de cached lijst.
3. Acceptabel: kopieer slaagt (gebaseerd op laatst bekende state), volgende refresh ververst de view.

---

## Architectuur

### Nieuwe modules
```
src/js/
  views/
    friend-week.js              NIEUW — Week-bars voor vriend
    friend-month.js             NIEUW — Maand-bars voor vriend
    components/
      friend-header.js          NIEUW — Gedeelde header (handle + Dag/Week/Maand toggle)
      copy-date-sheet.js        NIEUW — Bottom-sheet met date-picker, returnt gekozen datum
```

### Wijzigingen op bestaande modules

| Module | Wijziging |
|---|---|
| `views/friend-day.js` | (1) gebruik `friend-header` ipv hard-coded back-knop+title; (2) ‹ › datum-nav-knoppen rond hero; (3) "Kopieer"-knoppen op meal-headers en entry-rows bij `share_level='entries'`; (4) integreer `copy-date-sheet` voor kopieer-flow |
| `db/friendships.js` | Nieuwe wrappers: `getFriendPeriod(friendId, startDate, endDate)`. `getFriendDay` blijft (return-shape uitgebreid met `id`, `product_id`, `friend_created_at`). |
| `db/entries.js` | `createEntry({ product_id, amount_grams, kcal, meal_type, date })` blijft hergebruikt — geen wijziging. |
| `router.js` | Hernoem route `#/friend` → `#/friend-day`. Voeg toe `#/friend-week`, `#/friend-month`. |
| `views/friends.js` | Update `navigate()`-call van `#/friend` naar `#/friend-day`. |
| `views/components/compare-widget.js` | Update tap → `#/friend-day` ipv `#/friend`. |
| `css/style.css` | Friend-header styles, Dag/Week/Maand-segmented control, kopieer-knop styles, copy-date-sheet (bottom-sheet, date-picker). |

### Module verantwoordelijkheden

- **`views/friend-week.js`** — pure render-view. Roept `getFriendPeriod(id, weekStart, weekEnd)`, rendert friend-header + bars + ‹ ›-nav. Klik op bar = navigate naar `friend-day` op die datum. Hergebruikt week-bar-styling van eigen `history.js` waar mogelijk (eventueel utility-functie extraheren).
- **`views/friend-month.js`** — analoog aan week-view, maar voor 28–31 dagen.
- **`views/components/friend-header.js`** — pure component: `mount(container, { handle, friendId, currentView })`. Rendert handle + segmented toggle. Toggle navigeert naar `friend-day` / `friend-week` / `friend-month` met juiste anchor (huidige date of vandaag bij eerste switch).
- **`views/components/copy-date-sheet.js`** — pure component: `open({ title, defaultDate, minDate, maxDate, onConfirm })`. Rendert bottom-sheet, beheert datum-state, roept `onConfirm(date)` bij bevestig. Geen kennis van entries/copy-logic — caller regelt de kopieer-actie zelf.

### Performance-overweging
- Friend-week-view: één `get_friend_period`-call per week (7 dagen). Acceptabel.
- Friend-month-view: één call per maand (~30 dagen). Acceptabel.
- ‹ ›-navigatie binnen week/maand: nieuwe call per stap. Geen cache (consistent met eigen Historie-tab).
- Kopieer-flow: `createEntry`-loop client-side. Bij 5-entry-maaltijd = 5 round-trips. Acceptabel; later eventueel batch-RPC `create_entries(entries[])`.

---

## Buiten scope

- **Per-dag-kopiëren** — workaround = 4× per-maaltijd
- **Vergelijk-widget verfijning** (per-vriend ster, Settings-dropdown) — geparkeerd op ROADMAP
- **Competitie-element** ("wie blijft deze week vaakst binnen z'n doel") — geparkeerd op ROADMAP
- **Notificeren van vriend** bij kopieer-actie
- **Batch-RPC `create_entries`** — niet nodig op huidige schaal
- **Realtime updates** — refresh-on-open volstaat
- **Geautomatiseerde tests** — handmatig via Live Server, conform project-conventie

---

## Manuele testchecklist

### Friend dag-view ‹ › nav
- [ ] Open `#/friend-day?id=<piet>&date=<vandaag>` → ›-knop disabled, ‹-knop actief
- [ ] Tap ‹ → navigate naar gisteren, content updatet
- [ ] Navigeer terug tot vriend's `created_at` → ‹-knop disabled
- [ ] Vriend's `created_at` < jouw eigen `created_at` → kunnen we voorbij eigen creation navigeren (verschil met eigen day-view)

### Dag/Week/Maand-toggle
- [ ] Vanuit `friend-day` op datum X: tap Week → `friend-week?anchor=X`
- [ ] Tap Maand → `friend-month?anchor=X`
- [ ] Tap Dag vanuit week → `friend-day?date=X` (gebruikt anchor als datum)
- [ ] Toggle is zichtbaar bij alle drie de friend-views

### Friend week-view
- [ ] Open `#/friend-week?id=<piet>&anchor=<datum>` → 7 bars Mo–Su
- [ ] Bars gekleurd volgens vriend's hero-state
- [ ] Tap bar → navigate naar `friend-day` op die datum
- [ ] ‹-knop schuift week 7 dagen terug; gedisabled als nieuwe weekstart < vriend's `created_at`
- [ ] ›-knop schuift week 7 dagen vooruit; gedisabled als nieuwe week vandaag bevat (of erna)

### Friend maand-view
- [ ] Open `#/friend-month?id=<piet>&anchor=<datum>` → 28-31 bars
- [ ] ‹ ›-knoppen schuiven per maand
- [ ] Klik bar → friend-day

### Per-entry kopiëren
- [ ] In friend-day met `share_level='entries'`: zie "Kopieer"-knop op elke entry-row
- [ ] Tap → bottom-sheet opent met date-picker default vandaag
- [ ] Bevestig → toast "Gekopieerd naar <datum>", entry verschijnt in eigen `entries` op die datum, met juiste meal_type
- [ ] kcal in eigen entry = vriend's kcal (geen herberekening)
- [ ] Friend day-view blijft open na kopiëren

### Per-maaltijd kopiëren
- [ ] Zie "Kopieer"-knop op elke meal-header met entries
- [ ] Geen knop bij lege meal
- [ ] Tap → bottom-sheet
- [ ] Bevestig → alle entries van die meal komen in eigen `entries` op gekozen datum
- [ ] Toast toont aantal: "3 entries gekopieerd naar 28 apr"

### Date-picker grenzen
- [ ] Picker laat geen datum > vandaag toe
- [ ] Picker laat geen datum < jouw `created_at` toe (analoog aan eigen day/history)

### Conflict-handling
- [ ] Eigen lunch heeft al 2 entries; kopieer piet's lunch (3 entries) → totaal 5 entries op eigen lunch (geen vervang)
- [ ] Swipe-undo werkt op gekopieerde entries (zoals normaal)

### share_level filter
- [ ] Vriend `share_level='entries'` → kopieer-knoppen zichtbaar
- [ ] Vriend `share_level='per_meal'` → geen kopieer-knoppen, wel meal-totalen
- [ ] Vriend `share_level='total'` → geen kopieer-knoppen, alleen hero
- [ ] Vriend `share_level='none'` → "deelt geen voortgang", geen Dag/Week/Maand-toggle (consistent met huidige dag-view)

### Friend week/maand bij verschillende share_levels
- [ ] `total`, `per_meal`, `entries` → bars per dag op basis van `total_kcal`
- [ ] `none` → "deelt geen voortgang"-melding, geen bars

### Edge cases
- [ ] Vriend ontvriendt mid-flow (sheet open) → bevestig-tap → `not_friends` exception → toast + navigate `#/friends`
- [ ] Vriend wijzigt `share_level` van `entries` naar `total` tijdens kopieer-flow → kopieer slaagt (cached entries), volgende refresh toont geen entries meer
- [ ] Kopiëren naar dag met geen vriend-entries (bv. lege meal-header werd niet getoond) → niet mogelijk te triggeren
- [ ] Vriend's `created_at` = vandaag → ‹-knop direct disabled in friend-day
- [ ] Vriend met handle-wijziging → header toont nieuwe handle bij next refresh

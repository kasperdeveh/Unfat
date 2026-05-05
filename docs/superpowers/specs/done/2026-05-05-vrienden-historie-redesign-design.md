# Sub-project N — Vrienden & historie redesign

**Status:** Brainstorm afgerond — klaar voor review
**Datum start:** 2026-05-05
**Bouwt voort op:** D-A (basis-vrienden, afgerond 2026-04-28), D-vervolg (friend-views in week/maand, afgerond 2026-04-29), C (eigen historie, afgerond 2026-04-27)

## Scope

Doel: Historie-pagina en friend-views unificeren tot **één gedeelde pagina** met een persoon-selector. Standaard zie je je eigen historie; je kunt één vriend "aanzetten" om diens stats er als overlay naast te zien. Vergelijken gebeurt **op één pagina**, je hoeft niet te wisselen tussen views.

Deze ronde dekt:
- **N1**: Historie- en friend-views unificeren (één route `#/history`); dag-view toegevoegd; maand-view consistent (kalender-style)
- **N2**: Vergelijken on one page (hero, week, maand) via een vriend-overlay

**Niet in deze ronde** (op ROADMAP onder D):
- **N3**: Per-vriend `share_level` override (globale default + per-vriend uitzondering)
- **N4**: Kiezen welke vrienden zichtbaar zijn op het dashboard (compare-widget filter)
- Meerdere vrienden tegelijk vergelijken (max 1 voor nu; multi-select komt later)

## Beslissingen

### Eén gedeelde Historie-pagina (Approach A)
`#/history` wordt dé plek voor "kijken naar wiens historie". Persoon-selector bovenaan; "Ik" zit er altijd in (niet uit te schakelen); een vriend-pill aanzetten = vergelijk-modus aan. De aparte routes `#/friend-day`, `#/friend-week`, `#/friend-month` worden verwijderd.

Reden: vergelijken on one page wordt natuurlijk; geen wissel-flow nodig; minder code-duplicatie.

### Persoon-selector — avatar-pills, scrollbaar
Horizontaal scrollende rij avatar-pills onder de page-title. Eerste pill = "Ik", daarna alle vrienden. Inactive = donker-grijs zonder swatch. **Active pills** ("Ik" plus eventuele vriend) hebben oranje outline + mini-bar-swatch (vol voor "Ik", gestreept voor de actieve vriend) — dat is de visuele legenda voor de bars in de view eronder. De swatch verschijnt dus alleen op pills die je daadwerkelijk in de bars terugziet.

### "Ik" altijd aan, max 1 vriend tegelijk
- "Ik" is `pill-locked`: visueel altijd active, klik = no-op (geen toast nodig).
- Tap op vriend-pill = die vriend wordt actief (URL-param `friend=<uuid>`).
- Tap nogmaals op dezelfde vriend = uit (terug naar solo-modus).
- Tap op een andere vriend terwijl al iemand actief is = vorige uit, nieuwe aan (single-select).

Voor nu max 1 vriend — multi-select op ROADMAP.

### Vergelijk-conventie: kleur = state, patroon = persoon
- **Bar-kleur** = doel-staat (groen = doel gehaald, oranje = boven streefdoel, rood = boven max)
- **Bar-patroon** = persoon (vol = ik, diagonaal gestreept = vriend)
- Diagonaal i.p.v. horizontaal: leesbaarder op kleine maand-cel-bars

Geen aparte persoon-kleuren (oranje/blauw) meer in de bars zelf. De pill toont de persoon-identiteit via mini-bar-swatch.

### Dag-view ook op Historie-tab
De dag-view op `#/history?view=day&date=<iso>` deelt **dezelfde view-module** als `#/` en `#/day?date=<iso>` (de bestaande `day.js`). Edit-sheet, swipe-delete en "+ toevoegen" werken identiek.

In vergelijk-modus aan vriend-kant: read-only met kopieer-knoppen (zoals huidige `friend-day.js`).

### Layout per view in vergelijk-modus

**Dag-view**:
- **Hero**: 2 progress-bars onder elkaar (vol = ik, gestreept = vriend), state-kleur op basis van eigen target/max per persoon. 2 kolommen met kcal-totaal (jij | vriend).
- **Maaltijden**: per maaltijd vertikaal gestapeld — eerst jouw blok (entries + edit/add zoals nu), dan vriend's blok (read-only entries + kopieer-knoppen, op basis van haar `share_level`).

**Week-view**:
- Per dag-rij: dagnaam-label + 2 horizontale bars onder elkaar (vol + gestreept) + kcal-getallen rechts (jouw boven, vriend onder).

**Maand-view**:
- Kalender-grid (zoals huidige history maand-view).
- Cel-content: 2 mini verticale bars onder elkaar (vol + gestreept), kleur = state. **Geen kcal-getal** in cel — tap voor detail (= navigate naar dag-view in vergelijk-modus).
- Cel-achtergrond: neutraal donker-grijs (in vergelijk-modus). State-kleur zit in de bars zelf.

**Stats-blok** (boven content, onder period-nav):
- Solo: zoals nu (gemiddeld per dag · doel gehaald)
- Vergelijk: 2 kolommen (jij | vriend) voor beide stats

### Friend-month wordt kalender-style
De huidige friend-month-view (verticale bars per dag) wordt vervangen door kalender-grid (consistent met history-maand). Dit geldt zowel in solo- als vergelijk-modus.

### Maand-cel: tap-target i.p.v. cijfers
Door het ontbreken van het kcal-getal in vergelijk-modus is de maand-view minder informatief op zich. Compromis: tap op cel = navigate naar dag-view (in dezelfde modus) van die datum. In solo-modus blijft het gedrag onveranderd (cel toont kcal + state-kleur).

### Compare-widget op dashboard blijft
De huidige compare-widget op `#/` (today-view) blijft bestaan, ongewijzigd in deze ronde. Tap op kaart navigeert nu naar `#/history?friend=<id>&view=day&date=<vandaag>` i.p.v. `#/friend-day`.

N4 (welke vrienden tonen) is uit scope.

### Vrienden-tab blijft, maar is nu management-only
De Vrienden-tab (`#/friends`) blijft de plek voor: lijst, verzoeken, zoeken, unfriend. Tap op vriend in lijst → `#/history?friend=<id>&view=day&date=<vandaag>` (huidige flow blijft direct dezelfde landing maar op een andere route).

### Bottom-nav-state
Bij `#/history` is de **Historie-tab** actief, ook als er een vriend is geselecteerd. Anders dan nu, waar `#/friend-*` de Vrienden-tab actief liet.

### Share-level handling in vergelijk-modus

| `share_level` vriend | Pill | Hero | Week/Maand bars | Dag meal-info |
|---|---|---|---|---|
| `none` | Grijs (disabled-look). Klik = toast "Sanne deelt geen voortgang". | n.v.t. | n.v.t. | n.v.t. |
| `total` | Selecteerbaar | 2 progress-bars (totaal kcal) | Bars op total_kcal | Vriend-meal-blokken niet gerenderd (hero toont totaal; meals = jouw kant only) |
| `per_meal` | Selecteerbaar | 2 progress-bars | Bars op total_kcal | Vriend-blok per maaltijd: kcal-totaal, geen entries, geen kopieer |
| `entries` | Selecteerbaar | 2 progress-bars | Bars op total_kcal | Vriend-blok per maaltijd: entries + kopieer-knoppen (per entry én per meal) |

### Geen DB-schema wijzigingen
Bestaande RPCs `get_friend_day` en `get_friend_period` leveren al alle benodigde data. Solo-data via bestaande `listEntriesForDateRange()` + `listProfileHistory()` + `getMyProfile()`.

---

## Datamodel

**Geen migration in deze ronde.**

Bestaande tabellen/RPCs hergebruikt:
- `profiles` — `share_level` blijft globaal (per-vriend override = N3, geparkeerd)
- `friendships` — ongewijzigd
- `entries`, `profile_history` — ongewijzigd
- `get_friend_day(friend_user_id, day)` — bestaand, ongewijzigd
- `get_friend_period(friend_user_id, start, end)` — bestaand, ongewijzigd

---

## Pages & routes

| Route | View-modus | Wanneer |
|---|---|---|
| `#/history` | Solo, default = week, anchor = vandaag | Tap Historie-tab |
| `#/history?view=day&date=<iso>` | Solo dag-view | Toggle Dag in solo-modus, of via maand-cel-tap |
| `#/history?view=<week\|month>&anchor=<iso>` | Solo week/maand | Toggle Week/Maand of period-nav |
| `#/history?friend=<uuid>&view=...&anchor=<iso>` of `&date=<iso>` | Vergelijk-modus | Tap vriend-pill, of tap vriend in Vrienden-tab, of tap kaart in compare-widget |

**Verwijderd:**
- `#/friend-day`, `#/friend-week`, `#/friend-month` — geen redirect (geen externe links te beschermen; bookmarks zijn intern).

**Niet gewijzigd:**
- `#/friends` — Vrienden-tab voor management
- `#/`, `#/day?date=<iso>` — dashboard/eigen day-view (blijft als entry-point voor vandaag/edit-flow)

---

## Flows

### Flow 1 — Solo Historie-tab openen
1. Tap Historie in bottom-nav → `#/history`
2. Render: persoon-selector ("Ik" actief), Dag/Week/Maand-toggle (Week default), period-nav, stats, week-rijen.
3. Toggle Dag → `#/history?view=day&date=<vandaag>` — gedeelde `day.js` view rendert (zoals dashboard).

### Flow 2 — Vriend toevoegen aan vergelijk
1. Vanaf `#/history?view=week`, tap Sanne-pill.
2. URL → `#/history?friend=<sanne_id>&view=week&anchor=<huidig>`.
3. Re-render in vergelijk-modus: hero/stats 2 kolommen, week-rijen tonen 2 bars per dag.
4. Tap nogmaals op Sanne-pill → `friend` param weg, terug naar solo.

### Flow 3 — Vanuit Vrienden-tab op vriend tikken
1. `#/friends` → tap Sanne-rij.
2. Navigate `#/history?friend=<sanne_id>&view=day&date=<vandaag>`.
3. Bottom-nav: Historie actief (niet Vrienden).
4. Persoon-selector toont "Ik" actief + Sanne actief; vergelijk-modus dag-view.

### Flow 4 — Vanuit dashboard compare-widget
1. `#/` → tap Sanne-kaart in compare-widget.
2. Navigate `#/history?friend=<sanne_id>&view=day&date=<vandaag>`.
3. Idem als Flow 3.

### Flow 5 — Switchen tussen vrienden
1. In `#/history?friend=<sanne>`, tap Piet-pill.
2. URL → `#/history?friend=<piet>&view=...&anchor=...` (Sanne uit, Piet aan).

### Flow 6 — Maand-cel inzoomen in vergelijk-modus
1. In `#/history?friend=<sanne>&view=month`, tap cel "10 mei".
2. Navigate `#/history?friend=<sanne>&view=day&date=2026-05-10`.

### Flow 7 — Edit/add aan jouw kant in vergelijk-modus
1. In `#/history?friend=<sanne>&view=day&date=<x>`, tap "+ toevoegen" onder jouw lunch.
2. Navigate `#/add?meal=lunch&date=<x>` (zoals huidige flow).
3. Na save → terug naar dezelfde URL → vergelijk-modus opnieuw gerendered.

### Flow 8 — Kopieer aan vriend-kant in vergelijk-modus
1. In `#/history?friend=<sanne>&view=day&date=<x>` met share_level=`entries`: tap kopieer-knop op een entry of meal-header in Sanne's blok.
2. Bottom-sheet date-picker (huidige `copy-date-sheet`) opent.
3. Bevestig → entries gekopieerd naar gekozen datum (zoals huidige flow).

### Flow 9 — share_level=none vriend
1. Tap vriend-pill van vriend met `share_level=none`.
2. Pill blijft inactive (niet aan-state); toast: "Sanne deelt geen voortgang".
3. URL niet gewijzigd; solo-modus blijft.

---

## Architectuur

### Nieuwe modules
```
src/js/views/components/
  person-selector.js      NIEUW — avatar-pill rij; emit selection-events
  compare-day.js          NIEUW — dag-view in vergelijk-modus (hero 2-koloms + meal-blokken gestapeld)
  compare-week.js         NIEUW — week-rijen met 2 bars per dag
  compare-month.js        NIEUW — kalender-grid met mini-bars per cel
```

### Wijzigingen op bestaande modules

| Module | Wijziging |
|---|---|
| `views/history.js` | Renderlaag uitgebreid: persoon-selector mounten; bij `friend` URL-param doorschakelen naar compare-* render i.p.v. solo render. Dag-toggle toegevoegd; in solo-dag delegeren naar `day.js`. |
| `views/day.js` | Geen functie-wijziging. Wordt nu ook door `history.js` aangeroepen voor solo dag-view (route-onafhankelijk). |
| `views/components/week-view.js` | `renderWeekRows()` blijft voor solo. Vergelijk-versie krijgt eigen `compare-week.js`. |
| `views/components/month-view.js` | `renderMonthGrid()` blijft voor solo. Vergelijk-versie krijgt eigen `compare-month.js`. |
| `views/components/copy-date-sheet.js` | Geen wijziging — hergebruikt door `compare-day.js`. |
| `views/friends.js` | `navigate()`-call van `#/friend-day` → `#/history?friend=<id>&view=day&date=<vandaag>`. |
| `views/components/compare-widget.js` | `navigate()`-call van `#/friend-day` → `#/history?friend=<id>&view=day&date=<dateIso>`. |
| `router.js` | Routes `#/friend-day`, `#/friend-week`, `#/friend-month` verwijderen. |
| `ui.js` (`renderBottomNav`) | `isFriendDay`-logica weg; bij `#/history` is Historie-tab actief, ongeacht `friend`-param. |
| `index.html` | Geen wijziging. |
| `css/style.css` | Persoon-selector pill-styles (vol vs gestreept-swatch); 2-koloms hero + meal-blokken; week-rij dual-bars; maand-cel mini-bars; diagonale streep-patroon (`repeating-linear-gradient`). |

### Verwijderde modules
```
src/js/views/
  friend-day.js              VERWIJDERD — opgegaan in history.js + compare-day.js
  friend-week.js             VERWIJDERD — opgegaan in compare-week.js
  friend-month.js            VERWIJDERD — opgegaan in compare-month.js
  components/
    friend-header.js         VERWIJDERD — niet meer nodig (persoon-selector vervangt het)
```

### Module verantwoordelijkheden

- **`views/history.js`** — top-level orchestrator. Leest URL-params (`view`, `anchor`/`date`, `friend`), bepaalt modus (solo vs compare), mount persoon-selector, view-toggle, period-nav. Delegeert content-render aan `day.js` (solo dag), `week-view.js` / `month-view.js` (solo week/maand) of `compare-day/week/month.js` (vergelijk).
- **`views/components/person-selector.js`** — `mount(container, { friends, currentFriendId, onSelect })`. Render avatar-pills + scroll-container. "Ik"-pill is locked; vriend-pill tap = `onSelect(friendId | null)` (null bij toggle-off).
- **`views/components/compare-day.js`** — `render(container, { date, myData, friendData, friendHandle, friendShareLevel })`. Render hero 2-kol + per-maaltijd vertikaal gestackte blokken. Hergebruikt `edit-entry-sheet`, `copy-date-sheet`. Roept `createEntry`, `updateEntry`, `deleteEntry` aan jouw kant.
- **`views/components/compare-week.js`** — `render(container, { weekStart, myDays, friendDays, ... })`. Render 7 rijen met dagnaam-label + 2 horizontale bars + kcal-getallen.
- **`views/components/compare-month.js`** — `render(container, { monthStart, myDays, friendDays, ... })`. Render kalender-grid met cel-mini-bars (geen kcal-getal in cel). Tap-handler navigeert naar dag-view in dezelfde modus.

### Performance-overweging
- Solo-modus: huidige `listEntriesForDateRange()` + `listProfileHistory()` blijven (geen extra calls).
- Vergelijk-modus: één extra `getFriendDay` of `getFriendPeriod` call. Acceptabel; consistent met huidige friend-views.
- Geen client-side cache — refresh bij elke navigation, zoals nu.

### CSS-conventie voor patroon
Diagonaal streep-patroon via `repeating-linear-gradient(45deg, <state-color> 0px, <state-color> 2px, <darker> 2px, <darker> 4px)`. Drie state-pattern-classes (`bar-fr-ok`, `bar-fr-warn`, `bar-fr-bad`) of dynamisch via CSS-variabelen.

Voor de pill-swatch een 6×16 px verticaal element (vol of gestreept).

---

## Buiten scope (volgende rondes)

- **N3 — Per-vriend `share_level` override** (op ROADMAP onder D)
- **N4 — Welke vrienden zichtbaar in dashboard compare-widget** (op ROADMAP onder D)
- **Meerdere vrienden tegelijk** in vergelijk (max 1 voor nu)
- **Andere maaltijd-layout in vergelijk-dag-view** (bv. swipe tussen jij/vriend, tab-style); huidig: vertikaal stacken
- **Realtime-updates van vriend-data** (refresh-on-open volstaat)
- **Geautomatiseerde tests** — handmatig via Live Server, conform project-conventie

---

## Manuele testchecklist

### Solo-modus (regressie)
- [ ] `#/history` opent met week-view, anchor = vandaag
- [ ] Toggle Maand → kalender met state-kleuren + kcal-getallen (ongewijzigd t.o.v. huidige Historie-tab)
- [ ] Toggle Dag → `#/history?view=day&date=<vandaag>` met dezelfde dag-view UI als `#/`
- [ ] Edit-sheet, swipe-delete, "+ toevoegen" werken in dag-view
- [ ] Period-nav ‹ › schuift week/maand/dag
- [ ] Pill `⌖ vandaag` verschijnt op niet-huidige periode

### Persoon-selector
- [ ] "Ik"-pill is altijd actief en niet uit te schakelen (klik = no-op)
- [ ] Tap Sanne-pill → URL krijgt `friend=<sanne_id>`, vergelijk-modus rendert
- [ ] Sanne-pill toont oranje rand + gestreept mini-bar-swatch
- [ ] Tap Sanne nogmaals → terug naar solo
- [ ] Tap Piet terwijl Sanne actief is → Sanne uit, Piet aan
- [ ] Pill-rij scrollt horizontaal als er > 4 vrienden zijn

### Vergelijk-modus dag-view
- [ ] Hero toont 2 progress-bars (vol = ik, gestreept = Sanne) onder elkaar; state-kleuren correct per persoon
- [ ] Hero toont 2 kolommen kcal-totaal (jij | Sanne)
- [ ] Per maaltijd: jouw blok eerst (met edit/add/swipe-delete), Sanne's blok eronder (read-only)
- [ ] Bij `share_level=entries`: kopieer-knoppen op vriend-entries en vriend-meal-headers
- [ ] Bij `share_level=per_meal`: vriend-blok toont alleen kcal-totaal (geen entries, geen kopieer)
- [ ] Bij `share_level=total`: alleen jouw maaltijd-blokken zichtbaar; hero toont wel beide totalen
- [ ] "+ toevoegen" aan jouw kant → add-flow met `meal` en `date` correct

### Vergelijk-modus week-view
- [ ] Per dag-rij: dagnaam + 2 horizontale bars (vol + gestreept) + 2 kcal-getallen rechts
- [ ] Bar-kleur = state per persoon (groen/oranje/rood)
- [ ] Tap rij → navigate naar `#/history?friend=<id>&view=day&date=<x>`

### Vergelijk-modus maand-view
- [ ] Kalender-grid (zoals history-month nu)
- [ ] Cel toont 2 mini verticale bars (vol + gestreept), geen kcal-getal
- [ ] Cel-achtergrond neutraal donker-grijs (bar-kleur is state)
- [ ] Tap cel → navigate naar `#/history?friend=<id>&view=day&date=<x>`
- [ ] Cellen buiten de maand grijs/transparant; toekomstige cellen empty

### Stats-blok in vergelijk-modus
- [ ] 2 kolommen: jouw avg kcal + days-met | Sanne's avg + days-met
- [ ] Zelfde berekening per persoon (gemiddelde over dagen met entries; days-met op basis van eigen target)

### share_level edge cases
- [ ] Vriend `share_level=none` → tap pill → toast "Sanne deelt geen voortgang"; URL niet gewijzigd; pill niet active
- [ ] Vriend wijzigt share_level mid-flow van `entries` naar `total` → next refresh: meal-detail aan vriend-kant verdwijnt
- [ ] Tap pill van een vriend met geen profile_history-rijen voor die periode → bars renderen op 0 / no-target placeholder

### Routes & nav-state
- [ ] Bottom-nav: bij `#/history` is Historie-tab actief, ook met `friend`-param
- [ ] `#/friend-day`, `#/friend-week`, `#/friend-month` bestaan niet meer (404 / fallback to home)
- [ ] Tap vriend-rij in `#/friends` → `#/history?friend=<id>&view=day&date=<vandaag>` (Historie-tab actief)
- [ ] Tap kaart in dashboard compare-widget → idem
- [ ] Tap "‹ Vrienden"-knop bestaat niet meer (was friend-header) — vervangen door simpelweg tap op een andere bottom-nav-tab

### Eigen ‹ › navigatie-grenzen in vergelijk-modus
- [ ] Aan jouw kant: ‹-knop disabled bij eigen `created_at`-datum
- [ ] Aan vriend-kant impliciet: zijn data is gewoon leeg (target/max nullable) op datums vóór vriend's `created_at`; UI toont 0/empty
- [ ] ›-knop disabled na vandaag

### Backwards-compatibility
- [ ] Bestaande `friend-*.js` files verwijderd; build/lint klaagt nergens
- [ ] Geen import-statements verwijzen meer naar verwijderde modules
- [ ] Service worker `CACHE_NAME` gebumpt zodat oude bookmarks redirecten via update-prompt

# Pagina stabiel houden bij mutatie van een entry — design

**Datum:** 2026-05-04
**Sub-project:** Stable scroll on mutate (was ROADMAP "Pagina stabiel houden bij verwijderen van een entry")
**Status:** spec → plan

## Doel

Voorkom dat de browser naar boven springt wanneer de gebruiker op de day-view (dashboard) een entry muteert. Vandaag bouwt elke mutatie de hele view-DOM opnieuw via `container.innerHTML = …`, met als gevolg dat `window.scrollY` op 0 wordt gereset en de skeleton-tussenstand kort de pagina inkort.

## Scope

**In:**
- Day-view (`src/js/views/day.js`) — zowel "Vandaag" als historische dagen via ‹ ›-nav
- Vier mutatie-momenten die nu re-renderen — verspreid over drie call-sites in `day.js`:
  - Swipe-delete (entry-rij naar links swipen)
  - Edit-sheet `onChange` (zowel save als 🗑 — beide gaan via dezelfde callback)
  - Undo-toast `onUndo` (entry terugzetten)
- Tijdelijke A/B-toggle in Settings om aan te voelen welke variant het beste werkt; verwijderen na keuze.

**Out:**
- Friend-day, history, andere views (geen mutaties vanuit eigen view, of mutaties leiden via `navigate()` ipv `render()`)
- Eerste navigatie naar day-view via tab/`‹›`-pijlen — daar willen we het skelet juist behouden (lege container)
- Optie C uit het brainstorm-traject (handmatige DOM-mutatie zonder re-render). Niet nodig als A/B het probleem oplossen.

## Architectuur

### `render()`-handtekening

`render(container, params)` krijgt een derde optionele parameter:

```js
export async function render(container, params, opts = {}) {
  const { skipSkeleton = false } = opts;
  // …
  if (!skipSkeleton) {
    container.innerHTML = `<div class="day-skeleton">…</div>`;
  }
  // fetch + final innerHTML zoals nu
}
```

Default `skipSkeleton = false` houdt huidige gedrag voor router-navigatie.

### `reloadKeepScroll()`-wrapper

Lokale helper in `day.js` die de drie/vier call-sites samenbrengt:

```js
async function reloadKeepScroll() {
  const y = window.scrollY;
  const skipSkeleton = localStorage.getItem('scrollMode') !== 'skel';
  await render(container, params, { skipSkeleton });
  // requestAnimationFrame zorgt dat de browser eerst de nieuwe DOM gepaint heeft
  // voordat we scrollY zetten — anders kan de scroll-restore "te vroeg" zijn als
  // de pagina nog herberekend wordt na innerHTML.
  requestAnimationFrame(() => window.scrollTo({ top: y }));
}
```

Default-waarde: alles behalve `'skel'` betekent "B / zonder skelet". Dus als de key nog niet gezet is, krijg je B (de aanbevolen variant).

### Call-site veranderingen

In `day.js`:
- swipe-delete handler: `await render(container, params)` → `await reloadKeepScroll()`
- undo-toast: `() => render(container, params)` → `reloadKeepScroll`
- edit-sheet aanroep `openEditSheet(id, entry, () => render(container, params))` → `openEditSheet(id, entry, reloadKeepScroll)` (dekt zowel save als delete-knop)

`edit-entry-sheet.js` zelf hoeft niet aangepast — het roept `onChange()` aan, en de caller in `day.js` past alleen die callback aan.

## Toggle voor test-fase

### UI in Settings

Tijdelijke sectie bovenaan Settings (`src/js/views/settings.js`), bv:

```html
<section class="settings-section">
  <h2>Scroll-modus (test)</h2>
  <p class="settings-help">Probeer beide en kies wat het beste voelt.</p>
  <div class="segmented" id="scroll-mode">
    <button data-mode="skel">Met skelet (A)</button>
    <button data-mode="noskel">Zonder skelet (B)</button>
  </div>
</section>
```

Knop-tap schrijft `localStorage.setItem('scrollMode', mode)` en zet de `active`-class. Default = `'noskel'` (B). Geen reload nodig — bij volgende mutatie pakt `reloadKeepScroll()` de nieuwe waarde op.

### Lifecycle van de toggle

1. Toggle wordt toegevoegd in deze sub-project-PR.
2. Gebruiker test op telefoon, kiest variant.
3. Vervolg-PR (of laatste commit in dezelfde branch): toggle uit Settings, niet-gekozen pad uit `render()` halen, alleen het gekozen gedrag blijft hard-coded.

## UX-overwegingen

**Variant A — met skelet:**
- Visueel: korte skelet-flits tijdens fetch (~100-300ms), pagina wordt kort hoogteloos en `scrollTo` na render zet 'm terug. Op mobiel zichtbare jump-en-terug.
- Pro: 100% zeker dat de gebruiker iets ziet gebeuren (loading-state)
- Con: visuele onrust bij elke delete

**Variant B — zonder skelet:**
- Visueel: oude DOM blijft staan tot fetch + finale `innerHTML` klaar is. Geen flicker, geen sprong.
- Pro: voelt "instant" voor snelle netwerk-fetches
- Con: bij trage verbinding (3G/offline-fallback) lijkt er even niets te gebeuren — maar de toast ("Verwijderd") of de gesloten edit-sheet is al feedback dat iets gaat gebeuren.

## Edge cases

- **Pagina wordt korter na delete:** `scrollY` kan groter zijn dan de nieuwe `scrollHeight`. Browser clampt `scrollTo` automatisch op de maximale scroll. Geen extra check nodig.
- **Hele entry-lijst leeg na laatste delete:** scrollY blijft 0 (was waarschijnlijk al klein), restore is no-op. Werkt vanzelf.
- **Snelle dubbele swipe:** elke swipe roept `reloadKeepScroll()` apart aan. De scrollY-capture gebeurt vóór elke render, dus elke restore klopt met de toestand op dat moment.
- **Tab-switch tijdens re-render:** als gebruiker buiten de view klikt valt het scope buiten deze fix; navigatie via router gaat sowieso naar `#/{newroute}` en gebruikt `render` zonder wrapper.

## Test-plan

Op mobiel via Live Server / GitHub Pages preview:

1. Vandaag-tab → scroll naar Snack (onderaan) → swipe-delete entry
   - Verwacht (B): scroll blijft op Snack, entry weg, hero/totalen kloppen
   - Verwacht (A): korte sprong-flits, daarna scroll terug op Snack
2. Idem met edit-sheet → ✏️ → Opslaan met andere hoeveelheid
3. Idem met edit-sheet → 🗑
4. Idem met undo-toast → ↶ Undo
5. Settings → toggle wisselen → herhaal stappen 1-4 op een historische dag (via ‹ in dag-nav)
6. Edge: open Settings, switch naar `'skel'`, terug naar dashboard, swipe-delete → variant A actief

## Stappen tot afronding

1. Implementatieplan via writing-plans skill (volgende stap)
2. Implementatie + handmatig testen
3. Gebruiker kiest A of B na ervaren
4. Toggle + niet-gekozen pad opruimen
5. CHANGELOG + ROADMAP update
6. Spec → `specs/done/`, plan → `plans/done/`

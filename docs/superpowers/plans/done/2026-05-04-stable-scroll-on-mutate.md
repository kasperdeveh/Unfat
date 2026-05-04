# Stable Scroll On Mutate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behoud `window.scrollY` op de day-view bij entry-mutaties (swipe-delete, edit-sheet save/delete, undo-toast). A/B-toggle in Settings tijdens test-fase.

**Architecture:** `render(container, params, opts)` accepteert een optionele `{ skipSkeleton }`. Lokale `reloadKeepScroll()` in `day.js` capture/restore scrollY en consultert `localStorage.scrollMode`. Toggle staat tijdelijk in Settings; na user-keuze worden toggle en niet-gekozen pad opgeruimd in een tweede commit.

**Tech Stack:** Vanilla HTML/CSS/JS (geen build), Service Worker voor PWA-cache (CACHE_NAME bumpen bij elke deploy), handmatig testen via Live Server (project heeft geen geautomatiseerde tests, zie CLAUDE.md).

**Spec:** `docs/superpowers/specs/2026-05-04-stable-scroll-on-mutate-design.md`

---

## Task 1: render() krijgt skipSkeleton-parameter

**Files:**
- Modify: `src/js/views/day.js:21-38` (render-signatuur en skeleton-block)

- [ ] **Step 1: Pas signature van `render()` aan**

In `src/js/views/day.js`, regel 21:

```js
export async function render(container, params, opts = {}) {
  const { skipSkeleton = false } = opts;
  const dateIso = params?.date || todayIso();
```

- [ ] **Step 2: Maak skeleton-render conditioneel**

Regels 26-38 (`container.innerHTML = ...skeleton...`) wikkel je in een `if (!skipSkeleton)`:

```js
  if (!skipSkeleton) {
    container.innerHTML = `
      <div class="day-skeleton" aria-hidden="true">
        <div class="skeleton-block skeleton-day-nav"></div>
        <div class="skeleton-block skeleton-hero"></div>
        <div class="skeleton-block skeleton-meal-title"></div>
        <div class="skeleton-block skeleton-meal-row"></div>
        <div class="skeleton-block skeleton-meal-title"></div>
        <div class="skeleton-block skeleton-meal-row"></div>
        <div class="skeleton-block skeleton-meal-title"></div>
        <div class="skeleton-block skeleton-meal-row"></div>
        <div class="skeleton-block skeleton-meal-title"></div>
        <div class="skeleton-block skeleton-meal-row"></div>
      </div>`;
  }
```

Niets anders in de fetch/finale-render-flow verandert.

- [ ] **Step 3: Sanity check via Live Server**

Open `src/index.html` met Live Server. Login, ga naar dashboard. Verwacht: identiek gedrag als voorheen — skeleton verschijnt kort, dan day-view. Eerste navigatie heeft `opts = {}` dus `skipSkeleton = false`, dus zelfde gedrag.

- [ ] **Step 4: Commit**

```bash
git add src/js/views/day.js
git commit -m "$(cat <<'EOF'
day-view: render() accepteert skipSkeleton-flag

Voorbereidende stap voor scroll-stabiliteit bij entry-mutaties:
caller kan straks aangeven dat de skeleton-tussenstand niet
nodig is, zodat de oude DOM blijft staan tijdens de re-render.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: reloadKeepScroll-wrapper en drie call-sites

**Files:**
- Modify: `src/js/views/day.js` — voeg wrapper toe binnen `render()`-scope, pas drie call-sites aan

- [ ] **Step 1: Voeg `reloadKeepScroll`-wrapper toe**

Plaats deze functie binnen `render()`, ná de bestaande variabelen-init en vóór `// Render compare-widget for friends ...` (rond regel 167). Sluit dus over `container` en `params` heen via closure:

```js
  async function reloadKeepScroll() {
    const y = window.scrollY;
    const skipSkeleton = localStorage.getItem('scrollMode') !== 'skel';
    await render(container, params, { skipSkeleton });
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }
```

`requestAnimationFrame` zorgt dat de browser de nieuwe DOM eerst paint voordat we scrollY zetten. Default (geen of andere localStorage-waarde) → `skipSkeleton = true` = optie B.

- [ ] **Step 2: Pas swipe-delete call-site aan**

In `src/js/views/day.js`, in de touchend-handler (rond regel 254-256):

```js
        if (entry) {
          row.style.transform = 'translateX(-100%)';
          await deleteEntry(id);
          showUndoToast(entry, reloadKeepScroll);
          await reloadKeepScroll();
        }
```

(Dus zowel het derde argument van `showUndoToast` als de `await render(...)` worden vervangen.)

- [ ] **Step 3: Pas edit-sheet call-site aan**

In `src/js/views/day.js`, in de click-handler op `.entry-row` (rond regel 228):

```js
    row.addEventListener('click', () => {
      if (swiped) return;
      const id = row.getAttribute('data-entry-id');
      const entry = entries.find(e => e.id === id);
      if (!entry) return;
      openEditSheet(id, entry, reloadKeepScroll);
    });
```

(Vervang `() => render(container, params)` door `reloadKeepScroll`.)

- [ ] **Step 4: Verifieer dat undo-toast nu ook via wrapper gaat**

`showUndoToast(entry, reloadKeepScroll)` uit Step 2 betekent dat de undo-actie via dezelfde wrapper loopt. Geen extra wijziging nodig — undo-toast roept `onUndo()` aan, dat is nu `reloadKeepScroll`.

- [ ] **Step 5: Sanity check via Live Server**

Login, dashboard, scroll naar Snack-sectie. Swipe een entry weg. Verwacht: scroll blijft op Snack staan, entry weg, hero-getal klopt. Tap Undo: entry komt terug, scroll blijft staan. Tap een entry → edit-sheet → Opslaan: scroll blijft staan. Idem 🗑.

- [ ] **Step 6: Commit**

```bash
git add src/js/views/day.js
git commit -m "$(cat <<'EOF'
day-view: behoud scrollY bij entry-mutaties

Lokale reloadKeepScroll-wrapper capture/restore window.scrollY
rond elke re-render die volgt op een mutatie (swipe-delete,
edit-sheet save/delete, undo-toast). localStorage.scrollMode
schakelt tussen 'met skelet' (skel) en 'zonder skelet' (default).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: A/B-toggle in Settings

**Files:**
- Modify: `src/js/views/settings.js` — sectie toevoegen + handler

- [ ] **Step 1: Voeg de UI-sectie toe vlak boven de Uitloggen-knop**

In `src/js/views/settings.js`, in de `container.innerHTML` template, vóór de `<hr>` die boven `<button class="btn-secondary btn" id="signout-btn">Uitloggen</button>` staat (regel 83), invoegen:

```html
    <hr style="margin:32px 0;border:0;border-top:1px solid #333;">

    <h2 style="font-size:16px;margin:0 0 12px;">Scroll-modus (test)</h2>
    <p class="text-muted" style="font-size:12px;margin-bottom:12px;">
      Probeer beide en kies wat het beste voelt bij verwijderen of bewerken van een entry op het dashboard.
    </p>
    <div class="segmented" id="scroll-mode-seg">
      <button type="button" data-mode="skel" class="seg-btn">Met skelet (A)</button>
      <button type="button" data-mode="noskel" class="seg-btn">Zonder skelet (B)</button>
    </div>
```

- [ ] **Step 2: Voeg de active-class-init en handler toe**

Na de bestaande share-level-seg event-listeners (zoek naar `#share-level-seg .seg-btn` — staat rond regel 166-180), voeg toe:

```js
  // Scroll-modus toggle (test-fase — wordt later opgeruimd)
  const scrollMode = localStorage.getItem('scrollMode') === 'skel' ? 'skel' : 'noskel';
  container.querySelectorAll('#scroll-mode-seg button').forEach(btn => {
    if (btn.getAttribute('data-mode') === scrollMode) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      localStorage.setItem('scrollMode', mode);
      container.querySelectorAll('#scroll-mode-seg button').forEach(b =>
        b.classList.toggle('active', b === btn));
      showToast(`Scroll-modus: ${mode === 'skel' ? 'A' : 'B'}`);
    });
  });
```

Default-pad: niets in localStorage → `scrollMode = 'noskel'`, knop B krijgt `.active`. Tap op A → `localStorage.scrollMode = 'skel'` → knop A krijgt `.active` → volgende mutatie pakt nieuwe waarde op via `reloadKeepScroll`.

- [ ] **Step 3: Sanity check via Live Server**

Settings → "Scroll-modus (test)"-sectie zichtbaar, B is actief. Tap A → toast "Scroll-modus: A", A wordt actief. Ga naar dashboard, swipe-delete: nu zie je de skelet-flits. Settings → tap B → swipe-delete: geen flits.

- [ ] **Step 4: Bump SW cache (verplicht bij client-side asset change)**

In `src/sw.js`, regel 4:

```js
const CACHE_NAME = 'unfat-v37';
```

(Was `unfat-v36`. Zonder bump zien bestaande gebruikers de wijziging pas na handmatig cache legen — zie CLAUDE.md.)

- [ ] **Step 5: Commit**

```bash
git add src/js/views/settings.js src/sw.js
git commit -m "$(cat <<'EOF'
Settings: tijdelijke A/B-toggle voor scroll-modus

Stelt user in staat om op de telefoon te ervaren of skelet-flits
tijdens entry-mutatie wenselijk is. Sectie + handler worden
verwijderd na de keuze. Bumps SW cache naar v37.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Manueel testen op telefoon (gebruiker-actie)

Geen code-wijziging — dit is een handmatig test-moment dat de gebruiker uitvoert. Implementatie-agent dispatcht hier en levert instructies op.

- [ ] **Step 1: Test-checklist klaarzetten voor de gebruiker**

Toon deze checklist letterlijk aan de gebruiker:

```
Test-stappen op telefoon (na deploy):
1. Open app, ga naar Vandaag.
2. Voeg eventueel een paar entries toe zodat er echt iets te scrollen is.
3. Scroll naar onder (Snack of Diner-sectie).
4. Swipe een entry naar links → kijk of de pagina blijft staan waar ze stond.
5. Tap "↶ Undo" in de toast → idem.
6. Tap een entry → edit-sheet → Opslaan met andere hoeveelheid → idem.
7. Tap een entry → 🗑 → idem.
8. Settings → Scroll-modus → tik op A.
9. Herhaal 3-7. Verschil voelbaar?
10. Settings → tik op B.
11. Welke voelt fijner?
```

- [ ] **Step 2: Wacht op gebruikers-feedback**

Gebruiker beslist: A of B. Plan task 5 wordt op basis daarvan uitgevoerd.

---

## Task 5: Finalisatie na keuze (toggle weg, gekozen pad hard-coden)

**Voorwaarde:** gebruiker heeft variant A of B gekozen.

**Files:**
- Modify: `src/js/views/day.js` — `reloadKeepScroll` simplificeren
- Modify: `src/js/views/settings.js` — toggle-sectie en handler verwijderen
- Modify: `src/sw.js` — CACHE_NAME bumpen
- Modify: `docs/general/CHANGELOG.md` — entry voor 2026-05-04
- Modify: `docs/general/ROADMAP.md` — item verplaatsen naar "Afgerond ✅"

- [ ] **Step 1: `reloadKeepScroll` simplificeren tot gekozen variant**

**Als B (zonder skelet) gekozen** — in `day.js`:

```js
  async function reloadKeepScroll() {
    const y = window.scrollY;
    await render(container, params, { skipSkeleton: true });
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }
```

**Als A (met skelet) gekozen** — in `day.js`:

```js
  async function reloadKeepScroll() {
    const y = window.scrollY;
    await render(container, params);
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }
```

In het A-geval kan de `skipSkeleton`-parameter helemaal weg uit `render()`, want niemand gebruikt 'm meer. Verwijder dan ook de `opts`-parameter en de `if (!skipSkeleton)`-wrap rond het skeleton-block.

- [ ] **Step 2: Toggle-sectie en handler uit `settings.js` verwijderen**

In `src/js/views/settings.js`:
- Verwijder de hele `<hr> + <h2>Scroll-modus (test)</h2> + <p> + <div id="scroll-mode-seg">`-blok uit de innerHTML-template
- Verwijder de bijbehorende `// Scroll-modus toggle ...`-event-listener-block

- [ ] **Step 3: localStorage-key opruimen op nieuwe loads**

Niet nodig: de key is hooguit ongebruikt en oude waarden hinderen niets — `reloadKeepScroll` leest 'm niet meer. Optioneel kan `localStorage.removeItem('scrollMode')` aan `app.js`-init toegevoegd, maar YAGNI.

- [ ] **Step 4: Bump SW cache nogmaals**

In `src/sw.js`, regel 4:

```js
const CACHE_NAME = 'unfat-v38';
```

- [ ] **Step 5: CHANGELOG-entry toevoegen**

In `docs/general/CHANGELOG.md`, onder de bestaande 2026-05-04-bullets (bovenaan) een regel:

```md
- **Day-view: stabiele scrollpositie bij entry-mutaties** — swipe-delete,
  edit-sheet save/🗑, en undo-toast op het dashboard re-rendert nu zonder
  scroll-reset. [variant: B "zonder skelet"] [of: A "met skelet"]
```

(Pas tekst aan op basis van gekozen variant.)

- [ ] **Step 6: ROADMAP bijwerken**

In `docs/general/ROADMAP.md`:
- Verwijder de sectie `### Pagina stabiel houden bij verwijderen van een entry (eerst volgende punt)` (regels 7-8)
- Voeg een rij bovenaan de "Afgerond ✅"-tabel toe:

```md
| 2026-05-04 | Stabiele scroll bij entry-mutatie | Swipe-delete, edit-sheet save/🗑, undo-toast op day-view re-rendert zonder dat de browser naar boven springt. window.scrollY wordt gecaptured vóór re-render en hersteld via requestAnimationFrame na de finale innerHTML |
```

- [ ] **Step 7: Spec en plan archiveren**

```bash
git mv docs/superpowers/specs/2026-05-04-stable-scroll-on-mutate-design.md \
       docs/superpowers/specs/done/
git mv docs/superpowers/plans/2026-05-04-stable-scroll-on-mutate.md \
       docs/superpowers/plans/done/
```

- [ ] **Step 8: Sanity check via Live Server**

Login, swipe-delete onder, edit-save, undo. Verwacht: gekozen gedrag, geen toggle in Settings.

- [ ] **Step 9: Commit (één bundel)**

```bash
git add src/js/views/day.js src/js/views/settings.js src/sw.js \
        docs/general/CHANGELOG.md docs/general/ROADMAP.md \
        docs/superpowers/specs/done/2026-05-04-stable-scroll-on-mutate-design.md \
        docs/superpowers/plans/done/2026-05-04-stable-scroll-on-mutate.md
git commit -m "$(cat <<'EOF'
Stable scroll on mutate — finalisatie [variant X]

Toggle uit Settings, niet-gekozen pad uit day.js verwijderd.
CHANGELOG/ROADMAP bijgewerkt. SW cache bump naar v38.
Spec en plan naar done/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Pas `[variant X]` in de commit-titel aan op basis van A of B.)

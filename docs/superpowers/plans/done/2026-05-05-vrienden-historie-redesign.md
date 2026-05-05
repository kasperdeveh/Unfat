# Sub-project N — Vrienden & historie redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Historie- en friend-views unificeren tot één gedeelde pagina (`#/history`) met persoon-selector. In vergelijk-modus tonen alle drie de views (dag/week/maand) jouw stats én die van één vriend gelijktijdig — kleur = doel-staat, patroon = persoon (vol = ik, diagonaal = vriend).

**Architecture:** Geen DB-wijzigingen — bestaande `get_friend_day` / `get_friend_period` RPCs en eigen `listEntriesForDateRange` blijven leidend. `views/history.js` wordt orchestrator: leest URL-params (`view`, `anchor`/`date`, `friend`) en delegeert naar solo-renderers (`day.js`, bestaande week/month-view-helpers) of vergelijk-renderers (`compare-day.js`, `compare-week.js`, `compare-month.js`). De huidige `friend-day/week/month.js` + `friend-header.js` worden verwijderd; `#/friend-*` routes weg. Verificatie via Live Server.

**Tech Stack:** Vanilla HTML/CSS/JS, Supabase JS SDK, GitHub Pages PWA met service worker cache.

**Spec:** `docs/superpowers/specs/2026-05-05-vrienden-historie-redesign-design.md`

---

## File Structure

**Created:**
- `src/js/views/components/person-selector.js` — avatar-pill rij met "Ik" + alle vrienden; emit selection-events
- `src/js/views/components/compare-week.js` — vergelijk-modus week-rijen (dual horizontal bars per dag)
- `src/js/views/components/compare-month.js` — vergelijk-modus kalender-grid (mini verticale dual-bars per cel)
- `src/js/views/components/compare-day.js` — vergelijk-modus dag-view (hero 2-kol + per-maaltijd vertikaal gestackt blokken)

**Modified:**
- `src/js/views/history.js` — orchestrator: persoon-selector mounten, URL-param `friend` lezen, delegeren naar solo of compare renderers; Dag-toggle toevoegen
- `src/js/views/day.js` — geen functionele wijziging, maar wordt nu ook door `history.js` aangeroepen voor solo dag-view via dezelfde `render()` (al date-aware)
- `src/js/views/friends.js` — `navigate('#/friend-day?id=...')` → `navigate('#/history?friend=...&view=day&date=<vandaag>')`
- `src/js/views/components/compare-widget.js` — kaart-tap navigate target: `#/friend-day` → `#/history?friend=...&view=day&date=<dateIso>`
- `src/js/app.js` — routes `#/friend-day`, `#/friend-week`, `#/friend-month` verwijderen + uit `KNOWN_ROUTES`
- `src/js/ui.js` — `isFriendDay`-detectie weg; bottom-nav active-state alleen op basis van eigen route (Historie altijd active bij `#/history`, ongeacht `friend`-param)
- `src/css/style.css` — nieuwe stijlen: `.person-selector`, `.person-pill`, `.person-pill-active`, `.person-pill-locked`, `.person-swatch` (vol/striped), `.compare-hero` (2-kol), `.compare-meal` (gestackte blokken), `.compare-week-row` (dual-bar layout), `.compare-month-cell` (mini-bars), CSS variabelen voor diagonaal streep-patroon. Verouderde `.friend-view-toggle`, `.period-bar`, `.period-bar-month`, `.period-bars`, `.period-bars-month` en `.period-nav-btn` weghalen
- `src/sw.js` — `CACHE_NAME` bumpen + `STATIC_ASSETS` opschonen (oude friend-views weg, nieuwe componenten erbij)
- `docs/general/CHANGELOG.md` — entry voor 2026-05-05
- `docs/general/ROADMAP.md` — N1+N2 naar afgerond, N3+N4 blijven open onder D

**Deleted:**
- `src/js/views/friend-day.js`
- `src/js/views/friend-week.js`
- `src/js/views/friend-month.js`
- `src/js/views/components/friend-header.js`

---

## Decomposition

13 taken in 7 fases. Na elke fase blijft de app werkend (geen broken state); oude friend-views blijven beschikbaar tot fase 6.

| Fase | Taken | Resultaat |
|---|---|---|
| 1. CSS-grondslag | T1 | Streep-patroon utility + persoon-selector pill stijlen + dual-bar layout-classes klaar (nog niet gebruikt) |
| 2. Person-selector | T2 | Component werkt standalone (mount met fixture-data, console-log onSelect) |
| 3. History orchestrator | T3 | History.js leest `friend` URL-param, mount selector, Dag-toggle erbij, solo-views draaien zoals nu |
| 4. Solo dag-view in history | T4 | `#/history?view=day&date=<x>` rendert dezelfde `day.js`-view; toggle Dag werkt |
| 5. Compare-week | T5 | Vriend-pill aanzetten in week-view → dual-bars per dag |
| 6. Compare-month | T6 | Vriend-pill aan in maand-view → kalender met mini-bars per cel |
| 7. Compare-day | T7 | Vriend-pill aan in dag-view → hero 2-kol + meal-blokken (incl. kopieer aan vriend-kant) |
| 8. Routing/nav cleanup | T8, T9, T10 | `#/friend-*` routes weg, `friends.js` + `compare-widget.js` navigate naar `#/history?friend=...`, ui.js opgeschoond |
| 9. Old views verwijderen | T11 | Vier `.js` files weg, oude CSS opgeschoond |
| 10. SW + docs | T12, T13 | Cache bump, CHANGELOG + ROADMAP bijgewerkt, manuele testchecklist doorlopen |

---

## Phase 1 — CSS-grondslag

### Task 1: Voeg CSS-utilities en pill/dual-bar stijlen toe

**Files:**
- Modify: `src/css/style.css`

- [ ] **Step 1: Append nieuwe stijlen onderaan `style.css`**

Voeg deze CSS-block toe aan het einde van het bestand. Geen bestaande regels aanpassen in deze taak.

```css
/* =========================================================================
   N. Vrienden & historie redesign — gedeelde stijlen
   ========================================================================= */

/* Streep-patroon utility — diagonaal 45° voor vriend-bars per state */
.bar-fr-ok {
  background-image: repeating-linear-gradient(
    45deg, #4caf50 0px, #4caf50 2px,
    #1a3f1c 2px, #1a3f1c 4px
  );
}
.bar-fr-warn {
  background-image: repeating-linear-gradient(
    45deg, #ff9800 0px, #ff9800 2px,
    #4d2d00 2px, #4d2d00 4px
  );
}
.bar-fr-bad {
  background-image: repeating-linear-gradient(
    45deg, #f44336 0px, #f44336 2px,
    #4a1410 2px, #4a1410 4px
  );
}

/* Persoon-selector pill rij */
.person-selector {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 0 14px;
  padding: 4px 0;
  scrollbar-width: none;
}
.person-selector::-webkit-scrollbar { display: none; }

.person-pill {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  padding: 4px 12px 4px 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}
.person-pill-av {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #444;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
}
.person-pill-active {
  outline: 2px solid #ff9800;
  color: var(--text);
}
.person-pill-locked {
  cursor: default;
}
.person-swatch {
  width: 6px;
  height: 16px;
  border-radius: 2px;
  margin-left: 4px;
  flex-shrink: 0;
}
.person-swatch-solid {
  background: #ff9800;
}
.person-swatch-striped {
  background-image: repeating-linear-gradient(
    45deg, #ff9800 0px, #ff9800 2px,
    #663d00 2px, #663d00 4px
  );
}

/* Compare-hero — 2 kolommen totalen + dual progress-bars */
.compare-hero {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}
.compare-hero-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 12px;
}
.compare-hero-col-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.compare-hero-col-num {
  font-size: 22px;
  font-weight: 700;
}
.compare-hero-col-num small {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.7;
}
.compare-hero-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.compare-hero-bar {
  height: 8px;
  background: rgba(0,0,0,0.25);
  border-radius: 4px;
  overflow: hidden;
}
.compare-hero-bar-fill {
  height: 100%;
  border-radius: 4px;
}

/* Compare week-row — 2 horizontale bars per dag */
.compare-week-row {
  display: grid;
  grid-template-columns: 32px 1fr 64px;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--surface-border);
}
.compare-week-row.future { opacity: 0.35; }
.compare-week-row .day-label {
  color: var(--text-muted);
  font-size: 12px;
}
.compare-week-bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.compare-week-bar {
  height: 7px;
  background: rgba(255,255,255,0.06);
  border-radius: 3px;
  overflow: hidden;
}
.compare-week-bar-fill {
  height: 100%;
  border-radius: 3px;
}
.compare-week-kcal {
  text-align: right;
  font-size: 10px;
  color: var(--text);
  line-height: 1.4;
}
.compare-week-kcal small {
  display: block;
  color: var(--text-muted);
}

/* Compare month-cell — mini verticale dual-bars */
.compare-month-cell {
  aspect-ratio: 1;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 3px;
  cursor: pointer;
}
.compare-month-cell.outside { opacity: 0.25; cursor: default; }
.compare-month-cell.future { opacity: 0.4; cursor: default; }
.compare-month-cell.today { outline: 1px solid var(--text-muted); }
.compare-month-cell-num {
  position: absolute;
  top: 3px;
  left: 5px;
  font-size: 10px;
  color: var(--text-muted);
}
.compare-month-cell-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 65%;
  width: 70%;
}
.compare-month-cell-bar {
  flex: 1;
  border-radius: 2px 2px 0 0;
  min-height: 5px;
}

/* Compare day — per-maaltijd 2 blokken vertikaal gestackt */
.compare-meal {
  margin-bottom: 24px;
}
.compare-meal-header {
  display: flex;
  align-items: center;
  font-weight: 600;
  margin-bottom: 8px;
}
.compare-meal-block {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 10px;
}
.compare-meal-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 8px;
}
.compare-meal-block-who {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}
.compare-meal-block-who .person-swatch {
  margin-left: 0;
}
.compare-meal-block-sum {
  font-weight: 600;
}
```

- [ ] **Step 2: Verifieer build via Live Server**

Open `src/index.html` met Live Server. App moet onveranderd werken (de nieuwe stijlen zijn nog niet aan elementen gekoppeld). Geen 404's of CSS-parse-fouten in DevTools console.

- [ ] **Step 3: Commit**

```bash
git add src/css/style.css
git commit -m "css: add person-selector, dual-bar, compare-cell styles + diagonal stripe pattern"
```

---

## Phase 2 — Person-selector component

### Task 2: Bouw `person-selector.js`

**Files:**
- Create: `src/js/views/components/person-selector.js`

- [ ] **Step 1: Maak het component-bestand**

```javascript
import { escapeHtml } from '../../utils/html.js';

const SHARE_LEVELS_OK = new Set(['total', 'per_meal', 'entries']);

/**
 * Mount the person selector pill row.
 *
 * @param {HTMLElement} container — element to render into
 * @param {object} opts
 * @param {Array<{id:string, handle:string, share_level:string}>} opts.friends — accepted friends with handle + share_level
 * @param {string|null} opts.currentFriendId — friend currently in compare mode, or null for solo
 * @param {(friendId:string|null) => void} opts.onSelect — called when user toggles a friend; null = back to solo
 * @param {(friend:{id:string, handle:string}) => void} [opts.onShareNoneTap] — optional callback when user taps a 'none'-share friend
 */
export function mount(container, { friends, currentFriendId, onSelect, onShareNoneTap }) {
  const ikActive = true;
  const ikSwatch = '<span class="person-swatch person-swatch-solid"></span>';
  const friendActive = (id) => id === currentFriendId;
  const friendSwatch = '<span class="person-swatch person-swatch-striped"></span>';

  container.className = 'person-selector';
  container.innerHTML = `
    <button type="button" class="person-pill person-pill-active person-pill-locked" data-locked="1" aria-label="Ik (altijd in beeld)">
      <span class="person-pill-av">Ik</span>Ik${ikSwatch}
    </button>
    ${friends.map(f => `
      <button type="button"
              class="person-pill ${friendActive(f.id) ? 'person-pill-active' : ''}"
              data-friend-id="${escapeHtml(f.id)}"
              data-share-level="${escapeHtml(f.share_level || 'none')}"
              aria-label="${escapeHtml(f.handle)} ${friendActive(f.id) ? '(actief)' : ''}">
        <span class="person-pill-av">${escapeHtml(f.handle.slice(0, 1).toUpperCase())}</span>${escapeHtml(f.handle)}${friendActive(f.id) ? friendSwatch : ''}
      </button>
    `).join('')}
  `;

  // Locked Ik-pill: no-op
  container.querySelector('[data-locked]').addEventListener('click', (e) => {
    e.preventDefault();
  });

  container.querySelectorAll('[data-friend-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-friend-id');
      const share = btn.getAttribute('data-share-level');

      if (share === 'none' || !SHARE_LEVELS_OK.has(share)) {
        if (onShareNoneTap) {
          const f = friends.find(x => x.id === id);
          if (f) onShareNoneTap(f);
        }
        return;
      }

      // Toggle: if same friend already active -> back to solo (null)
      onSelect(currentFriendId === id ? null : id);
    });
  });
}
```

- [ ] **Step 2: Maak een tijdelijk testscherm**

Voeg in `src/index.html` net boven `</body>` een dev-scriptje toe (verwijderen na test):

```html
<script type="module">
  // TEMP — verifieer person-selector.js standalone
  if (location.hash === '#/test-selector') {
    const { mount } = await import('./js/views/components/person-selector.js');
    const root = document.getElementById('app');
    root.innerHTML = '<div id="sel"></div><div id="log" style="padding:1rem;color:#aaa"></div>';
    const log = document.getElementById('log');
    let current = null;
    function render() {
      mount(document.getElementById('sel'), {
        friends: [
          { id: 'a', handle: 'Sanne',  share_level: 'entries' },
          { id: 'b', handle: 'Piet',   share_level: 'per_meal' },
          { id: 'c', handle: 'Marc',   share_level: 'none' },
        ],
        currentFriendId: current,
        onSelect: (id) => { log.textContent = 'Selected: ' + id; current = id; render(); },
        onShareNoneTap: (f) => { log.textContent = f.handle + ' deelt geen voortgang'; },
      });
    }
    render();
  }
</script>
```

- [ ] **Step 3: Test in browser**

Open `http://localhost:5500/src/#/test-selector` (Live Server). Verwacht:
- "Ik"-pill heeft oranje rand + vol-swatch, klik = niets
- Sanne/Piet inactief, klik op Sanne = active state met striped-swatch + log "Selected: a"
- Klik Sanne nogmaals = log "Selected: null", terug naar inactief
- Klik Marc (share_level=none) = log "Marc deelt geen voortgang", geen state-change

- [ ] **Step 4: Verwijder het tijdelijke testscriptje uit `index.html`**

Het `<script type="module">…</script>` blok uit Step 2 verwijderen.

- [ ] **Step 5: Commit**

```bash
git add src/js/views/components/person-selector.js src/index.html
git commit -m "feat: person-selector component (Ik locked, friend toggle, share=none guard)"
```

---

## Phase 3 — History orchestrator

### Task 3: Refactor `history.js` — selector mount, Dag-toggle, friend URL-param

**Files:**
- Modify: `src/js/views/history.js`

- [ ] **Step 1: Vervang volledige inhoud van `history.js`**

```javascript
import { getMyProfile } from '../db/profiles.js';
import { listProfileHistory } from '../db/profile_history.js';
import { listEntriesForDateRange } from '../db/entries.js';
import { listFriendBuckets, getHandlesForUsers } from '../db/friendships.js';
import { supabase } from '../supabase.js';
import {
  parseIso, isoDate, weekStart, weekEnd, monthStart, monthEnd,
  addDays, addMonthsKeepDay, isoWeekNumber, formatWeekRangeNl, formatMonthNl,
} from '../utils/dates.js';
import { renderWeekRows, computeWeekStats } from './components/week-view.js';
import { renderMonthGrid, computeMonthStats } from './components/month-view.js';
import { mount as mountPersonSelector } from './components/person-selector.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../utils/html.js';
import { showToast } from '../ui.js';
import { todayIso } from '../calc.js';

export async function render(container, params) {
  const view = params?.view === 'month' ? 'month' :
               params?.view === 'day'   ? 'day'   : 'week';
  const friendId = params?.friend || null;
  const today = new Date();
  const todayIsoStr = isoDate(today);

  // Anchor (week/month) or date (day) — same fallback chain as before, plus 'date' for day-view.
  let anchor;
  if (params?.anchor) {
    anchor = parseIso(params.anchor);
  } else if (params?.date && view === 'day') {
    anchor = parseIso(params.date);
  } else if (params?.start) {
    const s = parseIso(params.start);
    anchor = view === 'week' ? addDays(s, 3) : addDays(s, 14);
  } else {
    anchor = today;
  }

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  // Load profile + friends list (for selector) in parallel.
  let profile, buckets, handleMap, friendsForSelector;
  try {
    [profile, buckets] = await Promise.all([
      getMyProfile(),
      listFriendBuckets(),
    ]);
    const ids = buckets.accepted.map(r => r.friend_id);
    handleMap = ids.length > 0 ? await getHandlesForUsers(ids) : new Map();

    // Each friend needs share_level for the selector's none-guard. Read in one round-trip.
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, handle, share_level')
        .in('id', ids);
      if (error) throw error;
      friendsForSelector = (data || []).map(p => ({
        id: p.id, handle: p.handle, share_level: p.share_level,
      }));
    } else {
      friendsForSelector = [];
    }
  } catch (err) {
    container.innerHTML = `<p class="error">Kon historie niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  // Build the page shell: selector + view-toggle + content slot
  const dateIso = view === 'day' ? isoDate(anchor) : null;
  const start = view === 'month' ? monthStart(anchor) : view === 'week' ? weekStart(anchor) : null;

  container.innerHTML = `
    <h1 class="page-title">Historie</h1>
    <div id="person-selector-mount"></div>
    <div class="history-toggle">
      <button data-view="day"   class="${view === 'day'   ? 'active' : ''}">Dag</button>
      <button data-view="week"  class="${view === 'week'  ? 'active' : ''}">Week</button>
      <button data-view="month" class="${view === 'month' ? 'active' : ''}">Maand</button>
    </div>
    <div id="history-content"></div>
  `;

  // Mount selector
  mountPersonSelector(container.querySelector('#person-selector-mount'), {
    friends: friendsForSelector,
    currentFriendId: friendId,
    onSelect: (newFriendId) => {
      const params = new URLSearchParams();
      params.set('view', view);
      if (view === 'day') params.set('date', dateIso);
      else params.set('anchor', isoDate(start));
      if (newFriendId) params.set('friend', newFriendId);
      navigate('#/history?' + params.toString());
    },
    onShareNoneTap: (f) => {
      showToast(`${f.handle} deelt geen voortgang`);
    },
  });

  // Wire view-toggle (anchor preservation)
  container.querySelectorAll('.history-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const newView = btn.getAttribute('data-view');
      if (newView === view) return;
      const params = new URLSearchParams();
      params.set('view', newView);
      if (newView === 'day') {
        params.set('date', view === 'day' ? dateIso : isoDate(anchor));
      } else {
        params.set('anchor', view === 'day' ? dateIso : isoDate(anchor));
      }
      if (friendId) params.set('friend', friendId);
      navigate('#/history?' + params.toString());
    });
  });

  // Render content based on (view, friendId)
  const content = container.querySelector('#history-content');

  if (view === 'day' && !friendId) {
    // Solo dag-view: delegate to day.js (full edit-/add-flow). Wired in Task 4.
    const dayMod = await import('./day.js');
    await dayMod.render(content, { date: dateIso });
    return;
  }

  if (view === 'day' && friendId) {
    // Compare dag-view: wired in Task 7
    content.innerHTML = `<p class="text-muted">Compare day-view komt in Task 7.</p>`;
    return;
  }

  if (view === 'week' && !friendId) {
    await renderSoloWeek(content, profile, start);
    return;
  }

  if (view === 'week' && friendId) {
    // Compare week-view: wired in Task 5
    content.innerHTML = `<p class="text-muted">Compare week-view komt in Task 5.</p>`;
    return;
  }

  if (view === 'month' && !friendId) {
    await renderSoloMonth(content, profile, start);
    return;
  }

  // view === 'month' && friendId
  // Compare month-view: wired in Task 6
  content.innerHTML = `<p class="text-muted">Compare month-view komt in Task 6.</p>`;
}

// ---- Solo helpers (extracted from old history.js) ----

async function renderSoloWeek(content, profile, start) {
  const today = new Date();
  const todayIsoStr = isoDate(today);
  const rangeStart = weekStart(start);
  const rangeEnd = weekEnd(start);

  let history, entries;
  try {
    [history, entries] = await Promise.all([
      listProfileHistory(),
      listEntriesForDateRange(isoDate(rangeStart), isoDate(rangeEnd)),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }

  const fbTarget = profile.daily_target_kcal;
  const fbMax = profile.daily_max_kcal;
  const stats = computeWeekStats(start, entries, history, fbTarget, fbMax);
  const title = formatWeekRangeNl(start);
  const isCurrent = isoDate(start) === isoDate(weekStart(today));
  const wnr = isoWeekNumber(start);
  const sub = isCurrent
    ? `Week ${wnr} · deze week`
    : `Week ${wnr} · <button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;

  const prevAnchor = addDays(start, -7);
  const nextAnchor = addDays(start, 7);
  const nextDisabled = isoDate(weekStart(nextAnchor)) > todayIsoStr;

  content.innerHTML = `
    <div class="period-nav">
      <button class="period-arrow" id="prev-period">‹</button>
      <div class="period-title">
        <div class="period-title-main">${title}</div>
        <div class="period-title-sub">${sub}</div>
      </div>
      <button class="period-arrow" id="next-period" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div class="period-stats">
      <div class="period-stat">
        <div class="period-stat-label">Gemiddeld per dag</div>
        <div class="period-stat-value">${stats.avgKcal === 0 ? '—' : stats.avgKcal + ' kcal'}</div>
      </div>
      <div class="period-stat">
        <div class="period-stat-label">Doel gehaald</div>
        <div class="period-stat-value">${stats.daysMet} / ${stats.daysWithEntries}</div>
      </div>
    </div>
    <div class="week-list">${renderWeekRows(start, entries, history, fbTarget, fbMax)}</div>
  `;

  wirePeriodNav(content, 'week', prevAnchor, nextAnchor, todayIsoStr);
}

async function renderSoloMonth(content, profile, start) {
  const today = new Date();
  const todayIsoStr = isoDate(today);
  const rangeStart = monthStart(start);
  const rangeEnd = monthEnd(start);

  let history, entries;
  try {
    [history, entries] = await Promise.all([
      listProfileHistory(),
      listEntriesForDateRange(isoDate(rangeStart), isoDate(rangeEnd)),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }

  const fbTarget = profile.daily_target_kcal;
  const fbMax = profile.daily_max_kcal;
  const stats = computeMonthStats(start, entries, history, fbTarget, fbMax);
  const title = formatMonthNl(start);
  const isCurrent = start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth();
  const sub = isCurrent
    ? 'deze maand'
    : `<button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;

  const prevAnchor = addMonthsKeepDay(start, -1);
  const nextAnchor = addMonthsKeepDay(start, 1);
  const nextDisabled = isoDate(monthStart(nextAnchor)) > todayIsoStr;

  content.innerHTML = `
    <div class="period-nav">
      <button class="period-arrow" id="prev-period">‹</button>
      <div class="period-title">
        <div class="period-title-main">${title}</div>
        <div class="period-title-sub">${sub}</div>
      </div>
      <button class="period-arrow" id="next-period" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div class="period-stats">
      <div class="period-stat">
        <div class="period-stat-label">Gemiddeld per dag</div>
        <div class="period-stat-value">${stats.avgKcal === 0 ? '—' : stats.avgKcal + ' kcal'}</div>
      </div>
      <div class="period-stat">
        <div class="period-stat-label">Doel gehaald</div>
        <div class="period-stat-value">${stats.daysMet} / ${stats.daysWithEntries}</div>
      </div>
    </div>
    ${renderMonthGrid(start, entries, history, fbTarget, fbMax)}
  `;

  wirePeriodNav(content, 'month', prevAnchor, nextAnchor, todayIsoStr);

  // Day-cell tap → solo dag-view in /history
  content.querySelectorAll('.month-cell').forEach(el => {
    if (el.classList.contains('outside') || el.classList.contains('future')) return;
    el.addEventListener('click', () => {
      const iso = el.getAttribute('data-date');
      navigate(`#/history?view=day&date=${iso}`);
    });
  });

  // Week-row tap (when in week-view) — handled inside renderSoloWeek's parent block;
  // for week-list rows we wire here too:
  content.querySelectorAll('.week-row').forEach(el => {
    if (el.classList.contains('outside') || el.classList.contains('future')) return;
    el.addEventListener('click', () => {
      const iso = el.getAttribute('data-date');
      navigate(`#/history?view=day&date=${iso}`);
    });
  });
}

function wirePeriodNav(content, view, prevAnchor, nextAnchor, todayIsoStr) {
  content.querySelector('#prev-period').addEventListener('click', () => {
    navigate(`#/history?view=${view}&anchor=${isoDate(prevAnchor)}`);
  });
  const nextBtn = content.querySelector('#next-period');
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/history?view=${view}&anchor=${isoDate(nextAnchor)}`);
    });
  }
  const todayBtn = content.querySelector('#today-pill');
  if (todayBtn) {
    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`#/history?view=${view}&anchor=${todayIsoStr}`);
    });
  }
}
```

- [ ] **Step 2: Voeg week-row click-handler ook in week-render toe**

In `renderSoloWeek`, voeg na de `wirePeriodNav`-regel toe:

```javascript
  content.querySelectorAll('.week-row').forEach(el => {
    if (el.classList.contains('outside') || el.classList.contains('future')) return;
    el.addEventListener('click', () => {
      const iso = el.getAttribute('data-date');
      navigate(`#/history?view=day&date=${iso}`);
    });
  });
```

(Origineel `history.js` had één gedeeld query-block na de view-render. Door de splitsing in solo-helpers wordt dit nu per render-helper expliciet gewired.)

- [ ] **Step 3: Test in browser**

Open Live Server. Test:
- `#/history` → week-view (default), persoon-selector zichtbaar met "Ik" + alle vrienden
- Tap "Dag" toggle → `#/history?view=day&date=<vandaag>` (toont placeholder "komt in Task 4" — verwacht omdat Task 4 deze rendering wired)

Wacht — eigenlijk delegateert solo-day in stap 1 naar `day.js`. Dat moet werken. Refresh:
- `#/history?view=day&date=<vandaag>` → toont **dezelfde dag-view** als `#/` (hero, meals, edit, add)
- `#/history?view=week` → solo week-rijen zoals voorheen
- `#/history?view=month` → solo kalender zoals voorheen
- Tap een vriend in selector → URL krijgt `friend=<id>`, content toont placeholder voor dat compare-view
- Tap dezelfde vriend nogmaals → terug naar solo
- Tap vriend met share_level=none → toast "Sanne deelt geen voortgang"

- [ ] **Step 4: Commit**

```bash
git add src/js/views/history.js
git commit -m "feat: history orchestrator + person-selector + solo dag-toggle"
```

---

## Phase 4 — Solo dag-view in history (eindbevestiging)

### Task 4: Verifieer dat solo dag-view in `#/history?view=day` volledig werkt

Geen code-wijziging — `day.js` is al date-aware en wordt vanuit history.js aangeroepen. Deze taak verifieert end-to-end via de browser.

**Files:** geen wijzigingen.

- [ ] **Step 1: Browser-test golden path**

Open `#/history?view=day&date=<vandaag>`:
- Hero rendert correct (hero-num, kleur, max-meta)
- Vier meal-secties met entries en + toevoegen
- Tap entry-rij → edit-sheet opent
- Edit + save → re-render met nieuwe waarde, scrollY behouden
- Swipe-left op entry → delete + undo-toast
- + toevoegen lunch → `#/add?meal=lunch&date=<vandaag>` (datum doorgegeven)

- [ ] **Step 2: Browser-test backdating**

Open `#/history?view=day&date=2026-04-30`:
- Toont 30 april dag-view, hero in past-modus (geen "Nog beschikbaar")
- + toevoegen → `#/add?meal=...&date=2026-04-30`
- Save → entry op 30 april zichtbaar

- [ ] **Step 3: Browser-test ‹ › nav**

Day-view heeft eigen ‹ › knoppen (uit `day.js`). Verifieer dat:
- ‹ schuift naar `#/day?date=<gisteren>` (BELANGRIJK: niet `#/history?view=day&date=...`)
- Dit is OK — `day.js` weet niets van de history-route. De toggle naar Week/Maand op de history-pagina blijft werken; ‹ ›-nav binnen day-view stuurt via `#/day` zoals altijd.

- [ ] **Step 4: Commit (alleen als er onverwachts CSS/HTML fixes nodig waren)**

Als alles werkt zonder code-wijziging: skip commit. Anders bundel fixes onder:
```bash
git add -A
git commit -m "fix: history-tab solo day-view smoke fixes"
```

---

## Phase 5 — Compare-week

### Task 5: Bouw `compare-week.js` en wire in history-orchestrator

**Files:**
- Create: `src/js/views/components/compare-week.js`
- Modify: `src/js/views/history.js` (vervang placeholder)

- [ ] **Step 1: Maak `compare-week.js`**

```javascript
import { addDays, isoDate, shortWeekdayNl, weekStart, weekEnd } from '../../utils/dates.js';
import { heroState } from '../../calc.js';
import { getTargetForDate } from '../../db/profile_history.js';
import { listEntriesForDateRange } from '../../db/entries.js';
import { listProfileHistory } from '../../db/profile_history.js';
import { getMyProfile } from '../../db/profiles.js';
import { getFriendPeriod } from '../../db/friendships.js';
import { navigate } from '../../router.js';
import { escapeHtml } from '../../utils/html.js';

/**
 * Render compare week-view: 7 dag-rijen met dual horizontal bars (vol = ik, gestreept = vriend).
 *
 * @param {HTMLElement} content
 * @param {object} opts
 * @param {string} opts.friendId
 * @param {string} opts.friendHandle
 * @param {Date} opts.weekStartDate
 */
export async function render(content, { friendId, friendHandle, weekStartDate }) {
  const startIso = isoDate(weekStartDate);
  const endIso = isoDate(weekEnd(weekStartDate));

  let myProfile, myEntries, myHistory, friendData;
  try {
    [myProfile, myEntries, myHistory, friendData] = await Promise.all([
      getMyProfile(),
      listEntriesForDateRange(startIso, endIso),
      listProfileHistory(),
      getFriendPeriod(friendId, startIso, endIso),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">Kon vergelijking niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (friendData.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:24px;text-align:center;">${escapeHtml(friendHandle)} deelt geen voortgang.</p>`;
    return;
  }

  const fbTarget = myProfile.daily_target_kcal;
  const fbMax = myProfile.daily_max_kcal;
  const todayIsoStr = isoDate(new Date());

  // Index friend days by date for O(1) lookup
  const friendDays = new Map();
  for (const d of (friendData.days || [])) friendDays.set(d.date, d);

  // Build 7 rows
  const rowsHtml = [];
  let myKcalSum = 0, frKcalSum = 0, myDays = 0, frDays = 0, myMet = 0, frMet = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStartDate, i);
    const iso = isoDate(d);
    const isFuture = iso > todayIsoStr;

    const dayEntries = myEntries.filter(e => e.date === iso);
    const myTotal = dayEntries.reduce((s, e) => s + e.kcal, 0);
    const myT = getTargetForDate(myHistory, iso) || { target: fbTarget, max: fbMax };
    const myState = myTotal === 0 ? 'empty' : heroState(myTotal, myT.target, myT.max);
    const myPct = myT.target > 0 ? Math.min(100, Math.round(myTotal / myT.target * 100)) : 0;

    const fr = friendDays.get(iso);
    const frTotal = fr?.total_kcal || 0;
    const frTarget = fr?.target || null;
    const frMax = fr?.max || null;
    const frState = (frTarget != null && frMax != null && frTotal > 0)
      ? heroState(frTotal, frTarget, frMax) : (frTotal === 0 ? 'empty' : 'green');
    const frPct = frTarget > 0 ? Math.min(100, Math.round(frTotal / frTarget * 100)) : 0;

    if (!isFuture && myTotal > 0) { myKcalSum += myTotal; myDays++; if (myTotal <= myT.target) myMet++; }
    if (!isFuture && frTotal > 0) { frKcalSum += frTotal; frDays++; if (frTarget && frTotal <= frTarget) frMet++; }

    const myFillCls = myState === 'empty' ? '' : `state-${myState}`;
    const frFillCls = frState === 'empty' ? '' : `bar-fr-${frState === 'green' ? 'ok' : frState === 'orange' ? 'warn' : frState === 'red' ? 'bad' : 'ok'}`;

    rowsHtml.push(`
      <div class="compare-week-row${isFuture ? ' future' : ''}" data-date="${iso}">
        <span class="day-label">${shortWeekdayNl(d)}</span>
        <div class="compare-week-bars">
          <div class="compare-week-bar"><div class="compare-week-bar-fill ${myFillCls}" style="width:${myPct}%"></div></div>
          <div class="compare-week-bar"><div class="compare-week-bar-fill ${frFillCls}" style="width:${frPct}%"></div></div>
        </div>
        <span class="compare-week-kcal">${myTotal === 0 ? '—' : myTotal}<small>${frTotal === 0 ? '—' : frTotal}</small></span>
      </div>
    `);
  }

  const myAvg = myDays === 0 ? 0 : Math.round(myKcalSum / myDays);
  const frAvg = frDays === 0 ? 0 : Math.round(frKcalSum / frDays);

  content.innerHTML = `
    <div class="period-stats compare-stats">
      <div class="period-stat">
        <div class="period-stat-label">Gemiddeld per dag</div>
        <div class="period-stat-value">${myAvg === 0 ? '—' : myAvg + ' kcal'}<small style="display:block;color:var(--text-muted);">${frAvg === 0 ? '—' : frAvg + ' kcal'}</small></div>
      </div>
      <div class="period-stat">
        <div class="period-stat-label">Doel gehaald</div>
        <div class="period-stat-value">${myMet} / ${myDays}<small style="display:block;color:var(--text-muted);">${frMet} / ${frDays}</small></div>
      </div>
    </div>
    <div class="week-list">${rowsHtml.join('')}</div>
  `;

  content.querySelectorAll('.compare-week-row').forEach(row => {
    if (row.classList.contains('future')) return;
    row.addEventListener('click', () => {
      const iso = row.getAttribute('data-date');
      navigate(`#/history?friend=${friendId}&view=day&date=${iso}`);
    });
  });
}
```

- [ ] **Step 2: Wire in `history.js`**

Vervang in `history.js` de regel:
```javascript
  if (view === 'week' && friendId) {
    content.innerHTML = `<p class="text-muted">Compare week-view komt in Task 5.</p>`;
    return;
  }
```
door:
```javascript
  if (view === 'week' && friendId) {
    const friendHandle = friendsForSelector.find(f => f.id === friendId)?.handle || 'Vriend';
    await renderCompareWeek(content, profile, start, friendId, friendHandle, todayIsoStr);
    return;
  }
```

En voeg helper toe (bovenaan in dezelfde file, of inline in render):
```javascript
async function renderCompareWeek(content, profile, start, friendId, friendHandle, todayIsoStr) {
  // Render period-nav (zonder stats — komt uit compare-week zelf)
  const prevAnchor = addDays(start, -7);
  const nextAnchor = addDays(start, 7);
  const nextDisabled = isoDate(weekStart(nextAnchor)) > todayIsoStr;
  const isCurrent = isoDate(start) === isoDate(weekStart(new Date()));
  const wnr = isoWeekNumber(start);
  const sub = isCurrent
    ? `Week ${wnr} · deze week`
    : `Week ${wnr} · <button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;
  content.innerHTML = `
    <div class="period-nav">
      <button class="period-arrow" id="prev-period">‹</button>
      <div class="period-title">
        <div class="period-title-main">${formatWeekRangeNl(start)}</div>
        <div class="period-title-sub">${sub}</div>
      </div>
      <button class="period-arrow" id="next-period" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div id="compare-week-content"></div>
  `;
  wireComparePeriodNav(content, 'week', prevAnchor, nextAnchor, todayIsoStr, friendId);

  const compareWeek = await import('./components/compare-week.js');
  await compareWeek.render(content.querySelector('#compare-week-content'), {
    friendId, friendHandle, weekStartDate: start,
  });
}

function wireComparePeriodNav(content, view, prevAnchor, nextAnchor, todayIsoStr, friendId) {
  content.querySelector('#prev-period').addEventListener('click', () => {
    navigate(`#/history?friend=${friendId}&view=${view}&anchor=${isoDate(prevAnchor)}`);
  });
  const nextBtn = content.querySelector('#next-period');
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/history?friend=${friendId}&view=${view}&anchor=${isoDate(nextAnchor)}`);
    });
  }
  const todayBtn = content.querySelector('#today-pill');
  if (todayBtn) {
    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`#/history?friend=${friendId}&view=${view}&anchor=${todayIsoStr}`);
    });
  }
}
```

- [ ] **Step 3: Browser-test**

Open `#/history` → week-view. Tap een vriend (Sanne) in selector. Verwacht:
- URL → `#/history?friend=<sanne>&view=week&anchor=<x>`
- 7 rijen, elk met dagnaam-label + 2 bars (vol = ik, gestreept = Sanne) + 2 kcal-getallen rechts
- Stats-blok toont 2 regels (jouw + Sanne's gemiddelde, doel gehaald)
- Tap rij → navigate naar `#/history?friend=<sanne>&view=day&date=<x>` (placeholder voor Task 7)
- ‹ › schuift week, vriend blijft actief
- Tap Sanne nogmaals → terug naar solo-week

Probeer ook met `share_level=per_meal` en `total` vrienden — beide moeten werken (alleen `total_kcal` gebruikt). Vriend met `share_level=none` heeft inactive pill (handled in selector).

- [ ] **Step 4: Commit**

```bash
git add src/js/views/components/compare-week.js src/js/views/history.js
git commit -m "feat: compare week-view (dual horizontal bars + 2-row stats)"
```

---

## Phase 6 — Compare-month

### Task 6: Bouw `compare-month.js` en wire in history-orchestrator

**Files:**
- Create: `src/js/views/components/compare-month.js`
- Modify: `src/js/views/history.js`

- [ ] **Step 1: Maak `compare-month.js`**

```javascript
import { addDays, isoDate, monthStart, monthEnd } from '../../utils/dates.js';
import { heroState } from '../../calc.js';
import { getTargetForDate } from '../../db/profile_history.js';
import { listEntriesForDateRange } from '../../db/entries.js';
import { listProfileHistory } from '../../db/profile_history.js';
import { getMyProfile } from '../../db/profiles.js';
import { getFriendPeriod } from '../../db/friendships.js';
import { navigate } from '../../router.js';
import { escapeHtml } from '../../utils/html.js';

/**
 * Render compare month-view: kalender-grid met 2 mini verticale bars per cel.
 */
export async function render(content, { friendId, friendHandle, monthStartDate }) {
  const start = monthStart(monthStartDate);
  const startIso = isoDate(start);
  const endIso = isoDate(monthEnd(start));

  let myProfile, myEntries, myHistory, friendData;
  try {
    [myProfile, myEntries, myHistory, friendData] = await Promise.all([
      getMyProfile(),
      listEntriesForDateRange(startIso, endIso),
      listProfileHistory(),
      getFriendPeriod(friendId, startIso, endIso),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">Kon vergelijking niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (friendData.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:24px;text-align:center;">${escapeHtml(friendHandle)} deelt geen voortgang.</p>`;
    return;
  }

  const fbTarget = myProfile.daily_target_kcal;
  const fbMax = myProfile.daily_max_kcal;
  const todayIsoStr = isoDate(new Date());

  const friendDays = new Map();
  for (const d of (friendData.days || [])) friendDays.set(d.date, d);

  // Calendar layout: 6 rows × 7 cols starting at Monday of week containing first
  const firstWeekday = start.getDay(); // 0=Sun
  const offsetToMon = (firstWeekday + 6) % 7;
  const gridStart = addDays(start, -offsetToMon);

  let myKcalSum = 0, frKcalSum = 0, myDays = 0, frDays = 0, myMet = 0, frMet = 0;
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const iso = isoDate(d);
    const inMonth = d.getMonth() === start.getMonth();
    const isFuture = iso > todayIsoStr;
    const isToday = iso === todayIsoStr;

    const dayEntries = myEntries.filter(e => e.date === iso);
    const myTotal = dayEntries.reduce((s, e) => s + e.kcal, 0);
    const myT = getTargetForDate(myHistory, iso) || { target: fbTarget, max: fbMax };
    const myState = myTotal === 0 ? null : heroState(myTotal, myT.target, myT.max);
    const myPct = myT.target > 0 ? Math.min(100, Math.round(myTotal / myT.target * 100)) : 0;

    const fr = friendDays.get(iso);
    const frTotal = fr?.total_kcal || 0;
    const frTarget = fr?.target || null;
    const frMax = fr?.max || null;
    const frState = frTotal === 0 ? null
                    : (frTarget != null && frMax != null) ? heroState(frTotal, frTarget, frMax) : 'green';
    const frPct = frTarget > 0 ? Math.min(100, Math.round(frTotal / frTarget * 100)) : 0;

    if (inMonth && !isFuture && myTotal > 0) {
      myKcalSum += myTotal; myDays++;
      if (myTotal <= myT.target) myMet++;
    }
    if (inMonth && !isFuture && frTotal > 0) {
      frKcalSum += frTotal; frDays++;
      if (frTarget && frTotal <= frTarget) frMet++;
    }

    const cls = [
      'compare-month-cell',
      !inMonth ? 'outside' : '',
      isFuture ? 'future' : '',
      isToday ? 'today' : '',
    ].filter(Boolean).join(' ');

    const myFillCls = myState ? `state-${myState}` : '';
    const frFillCls = frState
      ? `bar-fr-${frState === 'green' ? 'ok' : frState === 'orange' ? 'warn' : 'bad'}`
      : '';

    cells.push(`
      <div class="${cls}" data-date="${iso}" data-in-month="${inMonth}">
        <span class="compare-month-cell-num">${d.getDate()}</span>
        ${inMonth && !isFuture ? `
          <div class="compare-month-cell-bars">
            <div class="compare-month-cell-bar ${myFillCls}" style="height:${Math.max(myState ? 10 : 0, myPct * 0.7)}%"></div>
            <div class="compare-month-cell-bar ${frFillCls}" style="height:${Math.max(frState ? 10 : 0, frPct * 0.7)}%"></div>
          </div>
        ` : ''}
      </div>
    `);
  }

  const myAvg = myDays === 0 ? 0 : Math.round(myKcalSum / myDays);
  const frAvg = frDays === 0 ? 0 : Math.round(frKcalSum / frDays);

  content.innerHTML = `
    <div class="period-stats compare-stats">
      <div class="period-stat">
        <div class="period-stat-label">Gemiddeld per dag</div>
        <div class="period-stat-value">${myAvg === 0 ? '—' : myAvg + ' kcal'}<small style="display:block;color:var(--text-muted);">${frAvg === 0 ? '—' : frAvg + ' kcal'}</small></div>
      </div>
      <div class="period-stat">
        <div class="period-stat-label">Doel gehaald</div>
        <div class="period-stat-value">${myMet} / ${myDays}<small style="display:block;color:var(--text-muted);">${frMet} / ${frDays}</small></div>
      </div>
    </div>
    <div class="month-weekdays">
      <div>ma</div><div>di</div><div>wo</div><div>do</div><div>vr</div><div>za</div><div>zo</div>
    </div>
    <div class="month-grid">${cells.join('')}</div>
  `;

  content.querySelectorAll('.compare-month-cell').forEach(cell => {
    if (cell.classList.contains('outside') || cell.classList.contains('future')) return;
    cell.addEventListener('click', () => {
      const iso = cell.getAttribute('data-date');
      navigate(`#/history?friend=${friendId}&view=day&date=${iso}`);
    });
  });
}
```

- [ ] **Step 2: Wire in `history.js`**

Vervang in `history.js`:
```javascript
  if (view === 'month' && friendId) {
    content.innerHTML = `<p class="text-muted">Compare month-view komt in Task 6.</p>`;
    return;
  }
```
door:
```javascript
  if (view === 'month' && friendId) {
    const friendHandle = friendsForSelector.find(f => f.id === friendId)?.handle || 'Vriend';
    await renderCompareMonth(content, profile, start, friendId, friendHandle, todayIsoStr);
    return;
  }
```

Voeg helper toe (in dezelfde file):
```javascript
async function renderCompareMonth(content, profile, start, friendId, friendHandle, todayIsoStr) {
  const prevAnchor = addMonthsKeepDay(start, -1);
  const nextAnchor = addMonthsKeepDay(start, 1);
  const nextDisabled = isoDate(monthStart(nextAnchor)) > todayIsoStr;
  const today = new Date();
  const isCurrent = start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth();
  const sub = isCurrent
    ? 'deze maand'
    : `<button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;
  content.innerHTML = `
    <div class="period-nav">
      <button class="period-arrow" id="prev-period">‹</button>
      <div class="period-title">
        <div class="period-title-main">${formatMonthNl(start)}</div>
        <div class="period-title-sub">${sub}</div>
      </div>
      <button class="period-arrow" id="next-period" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div id="compare-month-content"></div>
  `;
  wireComparePeriodNav(content, 'month', prevAnchor, nextAnchor, todayIsoStr, friendId);

  const compareMonth = await import('./components/compare-month.js');
  await compareMonth.render(content.querySelector('#compare-month-content'), {
    friendId, friendHandle, monthStartDate: start,
  });
}
```

- [ ] **Step 3: Browser-test**

Vanaf `#/history?friend=<sanne>&view=week`, tap "Maand" toggle → `#/history?friend=<sanne>&view=month&anchor=<x>`. Verwacht:
- Kalender-grid met 7 weekdag-headers + cellen
- Cellen die binnen de maand vallen tonen 2 mini bars (vol + gestreept)
- Cellen buiten de maand: dimmed
- Toekomstige cellen: dimmed, geen bars
- Vandaag: outline
- Tap een cel → `#/history?friend=<sanne>&view=day&date=<x>` (placeholder voor Task 7)
- ‹ › schuift maand, vriend blijft actief

- [ ] **Step 4: Commit**

```bash
git add src/js/views/components/compare-month.js src/js/views/history.js
git commit -m "feat: compare month-view (calendar grid + mini dual-bars per cell)"
```

---

## Phase 7 — Compare-day

### Task 7: Bouw `compare-day.js` en wire in history-orchestrator

**Files:**
- Create: `src/js/views/components/compare-day.js`
- Modify: `src/js/views/history.js`

- [ ] **Step 1: Maak `compare-day.js`**

```javascript
import { listEntriesForDate, deleteEntry, createEntry } from '../../db/entries.js';
import { getMyProfile } from '../../db/profiles.js';
import { listProfileHistory, getTargetForDate } from '../../db/profile_history.js';
import { getFriendDay } from '../../db/friendships.js';
import { heroState, todayIso } from '../../calc.js';
import { isoDate, parseIso, formatDayLongNl, addDays } from '../../utils/dates.js';
import { navigate } from '../../router.js';
import { showToast } from '../../ui.js';
import { escapeHtml } from '../../utils/html.js';
import { openEditSheet } from './edit-entry-sheet.js';
import { open as openCopySheet } from './copy-date-sheet.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

function formatEntryMeta(e) {
  return `${Math.round(e.amount_grams)}g · ${e.kcal} kcal`;
}

/**
 * Compare day-view: hero met 2 progress-bars + per-maaltijd jouw blok + vriend-blok.
 */
export async function render(content, { friendId, friendHandle, dateIso, reloadFn }) {
  const date = parseIso(dateIso);
  const isFuture = dateIso > todayIso();

  let myProfile, myEntries, myHistory, friendData;
  try {
    [myProfile, myEntries, myHistory, friendData] = await Promise.all([
      getMyProfile(),
      listEntriesForDate(dateIso),
      listProfileHistory(),
      getFriendDay(friendId, dateIso),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">Kon vergelijking niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (friendData.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:24px;text-align:center;">${escapeHtml(friendHandle)} deelt geen voortgang.</p>`;
    return;
  }

  // My target/max via history
  const myT = getTargetForDate(myHistory, dateIso) || { target: myProfile.daily_target_kcal, max: myProfile.daily_max_kcal };
  const myTotal = myEntries.reduce((s, e) => s + e.kcal, 0);
  const myState = heroState(myTotal, myT.target, myT.max);
  const myPct = myT.target > 0 ? Math.min(100, Math.round(myTotal / myT.target * 100)) : 0;

  const frTotal = friendData.total_kcal || 0;
  const frTarget = friendData.target || null;
  const frMax = friendData.max || null;
  const frState = frTotal === 0 ? 'green'
                  : (frTarget != null && frMax != null) ? heroState(frTotal, frTarget, frMax) : 'green';
  const frPct = frTarget > 0 ? Math.min(100, Math.round(frTotal / frTarget * 100)) : 0;

  // Group my entries
  const myByMeal = {};
  for (const m of MEAL_ORDER) myByMeal[m] = [];
  for (const e of myEntries) myByMeal[e.meal_type]?.push(e);

  // Friend per_meal/entries
  const friendPerMeal = friendData.per_meal || null;
  const friendEntries = friendData.entries || [];
  const friendByMeal = {};
  for (const m of MEAL_ORDER) friendByMeal[m] = [];
  for (const e of friendEntries) friendByMeal[e.meal_type]?.push(e);

  // Hero
  const heroHtml = `
    <div class="compare-hero">
      <div class="compare-hero-cols">
        <div>
          <div class="compare-hero-col-label">Ik</div>
          <div class="compare-hero-col-num">${myTotal}<small> / ${myT.target ?? '?'} kcal</small></div>
        </div>
        <div>
          <div class="compare-hero-col-label">${escapeHtml(friendHandle)}</div>
          <div class="compare-hero-col-num">${frTotal}<small> / ${frTarget ?? '?'} kcal</small></div>
        </div>
      </div>
      <div class="compare-hero-bars">
        <div class="compare-hero-bar"><div class="compare-hero-bar-fill state-${myState}" style="width:${myPct}%"></div></div>
        <div class="compare-hero-bar"><div class="compare-hero-bar-fill bar-fr-${frState === 'green' ? 'ok' : frState === 'orange' ? 'warn' : 'bad'}" style="width:${frPct}%"></div></div>
      </div>
    </div>
  `;

  // Per-meal blocks
  const showFrMealDetail = friendData.share_level === 'per_meal' || friendData.share_level === 'entries';
  const showFrEntries = friendData.share_level === 'entries';

  const mealsHtml = MEAL_ORDER.map(meal => {
    const myItems = myByMeal[meal] || [];
    const mySum = myItems.reduce((s, e) => s + e.kcal, 0);

    const frItems = friendByMeal[meal] || [];
    const frSum = friendPerMeal ? (friendPerMeal[meal] || 0) : 0;

    const myBlock = `
      <div class="compare-meal-block">
        <div class="compare-meal-block-header">
          <div class="compare-meal-block-who">
            <span class="person-swatch person-swatch-solid"></span>Ik
          </div>
          <div class="compare-meal-block-sum">${mySum === 0 ? '' : mySum + ' kcal'}</div>
        </div>
        ${myItems.map(e => `
          <div class="entry-row-wrap">
            <div class="entry-row-bg"><span>🗑 Verwijderen</span></div>
            <div class="entry-row" data-entry-id="${e.id}">
              <div class="entry-info">
                <div class="entry-name">${escapeHtml(e.products?.name || 'Onbekend')}</div>
                <div class="entry-meta">${formatEntryMeta(e)}</div>
              </div>
              <span class="entry-chevron">›</span>
            </div>
          </div>
        `).join('')}
        ${!isFuture ? `<button class="entry-add-btn" data-add-meal="${meal}">+ toevoegen</button>` : ''}
      </div>
    `;

    const frBlock = showFrMealDetail ? `
      <div class="compare-meal-block">
        <div class="compare-meal-block-header">
          <div class="compare-meal-block-who">
            <span class="person-swatch person-swatch-striped"></span>${escapeHtml(friendHandle)}
          </div>
          <div class="compare-meal-block-sum">${frSum === 0 ? '' : frSum + ' kcal'}</div>
        </div>
        ${showFrEntries ? frItems.map(e => `
          <div class="entry-row entry-row-readonly" data-friend-entry-idx="${friendEntries.indexOf(e)}">
            <div class="entry-info">
              <div class="entry-name">${escapeHtml(e.product_name)}</div>
              <div class="entry-meta">${Math.round(e.amount_grams)}g · ${e.kcal} kcal</div>
            </div>
            <button class="entry-copy-btn" data-friend-entry-idx="${friendEntries.indexOf(e)}">Kopieer</button>
          </div>
        `).join('') : ''}
        ${showFrEntries && frItems.length > 0 ? `<button class="meal-copy-btn" data-meal="${meal}">Kopieer hele ${MEAL_LABELS[meal].split(' ')[1].toLowerCase()}</button>` : ''}
      </div>
    ` : '';

    return `
      <section class="compare-meal" data-meal="${meal}">
        <header class="compare-meal-header">${MEAL_LABELS[meal]}</header>
        ${myBlock}
        ${frBlock}
      </section>
    `;
  }).join('');

  content.innerHTML = `
    <p class="page-subtitle" style="text-align:center;margin:0 0 12px;">${formatDayLongNl(date)}</p>
    ${heroHtml}
    ${mealsHtml}
  `;

  // Wire jouw kant: edit + tap + swipe-delete + add — kopieer de exacte
  // implementatie uit day.js zodat het gedrag identiek is.
  // (showUndoToast helper definieer ik onderaan deze file.)
  content.querySelectorAll('.entry-row[data-entry-id]').forEach(row => {
    let startX = null;
    let dx = 0;
    let swiped = false;

    row.addEventListener('click', () => {
      if (swiped) return;
      const id = row.getAttribute('data-entry-id');
      const entry = myEntries.find(e => e.id === id);
      if (!entry) return;
      openEditSheet(id, entry, reloadFn);
    });

    row.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      dx = 0;
      row.style.transition = 'none';
    }, { passive: true });

    row.addEventListener('touchmove', (e) => {
      if (startX == null) return;
      dx = e.touches[0].clientX - startX;
      if (dx < 0) row.style.transform = `translateX(${dx}px)`;
    }, { passive: true });

    row.addEventListener('touchend', async () => {
      if (startX == null) return;
      row.style.transition = 'transform 0.2s';
      if (dx < -100) {
        swiped = true;
        const id = row.getAttribute('data-entry-id');
        const entry = myEntries.find(e => e.id === id);
        if (entry) {
          row.style.transform = 'translateX(-100%)';
          await deleteEntry(id);
          showUndoToast(entry, reloadFn);
          if (reloadFn) await reloadFn();
        }
      } else {
        row.style.transform = '';
      }
      startX = null;
      dx = 0;
    });
  });

  content.querySelectorAll('.entry-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const meal = btn.getAttribute('data-add-meal');
      navigate(`#/add?meal=${meal}&date=${dateIso}`);
    });
  });

  // Wire vriend-kant: kopieer per entry + per meal
  if (showFrEntries) {
    content.querySelectorAll('.entry-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-friend-entry-idx'), 10);
        const entry = friendEntries[idx];
        if (!entry) return;
        await runCopy(friendHandle, [entry], MEAL_LABELS[entry.meal_type] + ' entry');
      });
    });
    content.querySelectorAll('.meal-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const meal = btn.getAttribute('data-meal');
        const items = friendByMeal[meal] || [];
        if (items.length === 0) return;
        await runCopy(friendHandle, items, MEAL_LABELS[meal]);
      });
    });
  }
}

async function runCopy(handle, items, label) {
  const target = await openCopySheet({
    title: `Kopieer ${label} naar...`,
    defaultDate: todayIso(),
  });
  if (!target) return;
  try {
    for (const e of items) {
      await createEntry({
        product_id: e.product_id,
        amount_grams: e.amount_grams,
        kcal: e.kcal,
        meal_type: e.meal_type,
        date: target,
      });
    }
    const n = items.length;
    showToast(`${n} ${n === 1 ? 'entry' : 'entries'} gekopieerd naar ${target}`);
  } catch (err) {
    showToast(`Kopieer-fout: ${err.message}`);
  }
}

// Identiek aan day.js — undo-toast voor swipe-delete (4 sec).
// (Bij volgende refactor evt. extracten naar gedeelde util; nu inline om scope te beperken.)
function showUndoToast(deletedEntry, onUndo) {
  const existing = document.getElementById('undo-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'undo-toast';
  toast.className = 'undo-toast';
  toast.innerHTML = `<span>Verwijderd</span><button id="undo-btn">↶ Undo</button>`;
  document.body.appendChild(toast);

  let undone = false;
  const timer = setTimeout(() => {
    if (!undone) toast.remove();
  }, 4000);

  toast.querySelector('#undo-btn').addEventListener('click', async () => {
    undone = true;
    clearTimeout(timer);
    toast.remove();
    try {
      await createEntry({
        product_id: deletedEntry.products?.id || deletedEntry.product_id,
        amount_grams: deletedEntry.amount_grams,
        kcal: deletedEntry.kcal,
        meal_type: deletedEntry.meal_type,
        date: deletedEntry.date,
      });
      if (onUndo) await onUndo();
    } catch (err) {
      console.warn('Undo failed:', err);
    }
  });
}
```

- [ ] **Step 2: Wire in `history.js`**

Vervang in `history.js`:
```javascript
  if (view === 'day' && friendId) {
    content.innerHTML = `<p class="text-muted">Compare day-view komt in Task 7.</p>`;
    return;
  }
```
door:
```javascript
  if (view === 'day' && friendId) {
    const friendHandle = friendsForSelector.find(f => f.id === friendId)?.handle || 'Vriend';
    const compareDay = await import('./components/compare-day.js');
    const reload = () => render(container, params);
    await compareDay.render(content, { friendId, friendHandle, dateIso, reloadFn: reload });

    // Wire ‹ › nav (re-render history with prev/next date)
    const prevDate = isoDate(addDays(parseIso(dateIso), -1));
    const nextDate = isoDate(addDays(parseIso(dateIso), 1));
    const nextDisabled = nextDate > todayIsoStr;
    const navHtml = `
      <div class="day-nav" style="margin-top:14px;">
        <button class="day-nav-btn" id="prev-day">‹</button>
        <p class="page-subtitle" style="margin:0 1rem;">${formatDayLongNl(parseIso(dateIso))}</p>
        <button class="day-nav-btn" id="next-day" ${nextDisabled ? 'disabled' : ''}>›</button>
      </div>
    `;
    content.insertAdjacentHTML('afterbegin', navHtml);
    content.querySelector('#prev-day').addEventListener('click', () => {
      navigate(`#/history?friend=${friendId}&view=day&date=${prevDate}`);
    });
    const nextBtn = content.querySelector('#next-day');
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.addEventListener('click', () => {
        navigate(`#/history?friend=${friendId}&view=day&date=${nextDate}`);
      });
    }
    return;
  }
```

Zorg dat `formatDayLongNl` ook geïmporteerd wordt bovenaan `history.js`:
```javascript
import {
  parseIso, isoDate, weekStart, weekEnd, monthStart, monthEnd,
  addDays, addMonthsKeepDay, isoWeekNumber, formatWeekRangeNl, formatMonthNl,
  formatDayLongNl,
} from '../utils/dates.js';
```

- [ ] **Step 3: Browser-test compare-day**

Vanaf `#/history?friend=<sanne>&view=week`, tap een dag-rij → `#/history?friend=<sanne>&view=day&date=<x>`. Verwacht:
- Hero met 2 kolommen (jouw en Sanne's totaal) + 2 progress-bars (vol + gestreept)
- Per maaltijd: jouw blok (met entries + edit + add), Sanne's blok eronder (read-only)
- Bij `share_level=entries`: kopieer-knoppen op vriend-entries + meal-kopieer-knop
- Bij `share_level=per_meal`: alleen vriend-meal-totaal, geen entries, geen kopieer
- Bij `share_level=total`: vriend-blokken niet zichtbaar (hero toont totaal)
- Tap entry op jouw kant → edit-sheet
- Save → re-render
- Swipe-delete werkt? (BELANGRIJK: huidige `day.js` heeft swipe-handler op entry-row-wrap; in compare-day moet dit ook werken — maar swipe zit in `day.js` JS, niet hier. Zie Step 4.)

- [ ] **Step 4: Browser-test swipe-delete**

In `#/history?friend=<sanne>&view=day&date=<x>`:
- Swipe-left op jouw entry → undo-toast → tap Undo → entry komt terug
- Swipe-left + 4s wachten → entry definitief weg

- [ ] **Step 5: Commit**

```bash
git add src/js/views/components/compare-day.js src/js/views/history.js
git commit -m "feat: compare day-view (hero 2-col + per-meal stacked blocks + copy/edit/add)"
```

---

## Phase 8 — Routing en nav-state cleanup

### Task 8: Verwijder oude `#/friend-*` routes uit `app.js`

**Files:**
- Modify: `src/js/app.js`

- [ ] **Step 1: Verwijder de drie defineRoute-regels**

Zoek in `src/js/app.js` deze regels (rond regel 40-42):
```javascript
defineRoute('#/friend-day',     () => import('./views/friend-day.js'));
defineRoute('#/friend-week',    () => import('./views/friend-week.js'));
defineRoute('#/friend-month',   () => import('./views/friend-month.js'));
```
Verwijder ze.

- [ ] **Step 2: Update `KNOWN_ROUTES`**

Vervang:
```javascript
const KNOWN_ROUTES = ['#/login', '#/onboarding', '#/', '#/day', '#/history', '#/add', '#/add/portion', '#/add/new', '#/dish/new', '#/dish/edit', '#/dish/log', '#/friends', '#/friend-day', '#/friend-week', '#/friend-month', '#/settings'];
```
door:
```javascript
const KNOWN_ROUTES = ['#/login', '#/onboarding', '#/', '#/day', '#/history', '#/add', '#/add/portion', '#/add/new', '#/dish/new', '#/dish/edit', '#/dish/log', '#/friends', '#/settings'];
```

- [ ] **Step 3: Browser-test**

`#/friend-day?id=<x>` direct invoeren in de URL-bar → fallback naar `#/` (zoals andere onbekende routes). Geen JS-fout. Geen lege pagina.

- [ ] **Step 4: Commit**

```bash
git add src/js/app.js
git commit -m "router: drop #/friend-day, #/friend-week, #/friend-month routes"
```

### Task 9: Update `friends.js` en `compare-widget.js` navigate-targets

**Files:**
- Modify: `src/js/views/friends.js`
- Modify: `src/js/views/components/compare-widget.js`

- [ ] **Step 1: `friends.js`**

Zoek in `src/js/views/friends.js` rond regel 217:
```javascript
      navigate(`#/friend-day?id=${userId}`);
```
Vervang door:
```javascript
      navigate(`#/history?friend=${userId}&view=day&date=${todayIso()}`);
```

Voeg bovenaan toe (na bestaande imports):
```javascript
import { todayIso } from '../calc.js';
```

- [ ] **Step 2: `compare-widget.js`**

Zoek in `src/js/views/components/compare-widget.js` rond regel 67:
```javascript
      navigate(`#/friend-day?id=${id}&date=${dateIso}`);
```
Vervang door:
```javascript
      navigate(`#/history?friend=${id}&view=day&date=${dateIso}`);
```

- [ ] **Step 3: Browser-test**

- Tap vriend-rij in `#/friends` → land op `#/history?friend=<x>&view=day&date=<vandaag>` met compare-day actief
- Tap kaart in dashboard compare-widget op `#/` → idem
- Bottom-nav: Historie-tab actief (NIET Vrienden!) — wordt in Task 10 verder gefixed

- [ ] **Step 4: Commit**

```bash
git add src/js/views/friends.js src/js/views/components/compare-widget.js
git commit -m "router: friends-tap and compare-widget-tap go to #/history?friend=..."
```

### Task 10: Update `ui.js` — bottom-nav state cleanup

**Files:**
- Modify: `src/js/ui.js`

- [ ] **Step 1: Verwijder `isFriendDay`-detectie**

Vervang in `src/js/ui.js` regels 48-65 (de hele logica voor showNav + isActive):

```javascript
export function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  const path = getPath();
  const showNav = path === '#/' || path === '#/day' ||
    NAV_TABS.filter(t => t.hash !== '#/').some(t => path === t.hash || path.startsWith(t.hash + '/'));

  if (!showNav) {
    nav.hidden = true;
    return;
  }

  nav.hidden = false;
  nav.innerHTML = '';

  for (const tab of NAV_TABS) {
    let isActive;
    if (tab.hash === '#/') isActive = (path === '#/' || path === '#/day');
    else isActive = (path === tab.hash || path.startsWith(tab.hash + '/'));

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-item' + (isActive ? ' active' : '');
    btn.setAttribute('aria-label', tab.label);
    if (isActive) btn.setAttribute('aria-current', 'page');
    const badgeCount = tab.badgeKey ? (navBadges[tab.badgeKey] || 0) : 0;
    const badgeHtml = badgeCount > 0 ? `<span class="nav-badge">${badgeCount}</span>` : '';
    btn.innerHTML = `<span class="nav-icon">${NAV_ICONS[tab.icon]}${badgeHtml}</span><span class="nav-label">${tab.label}</span>`;
    btn.addEventListener('click', () => navigate(tab.hash));
    nav.appendChild(btn);
  }
}
```

- [ ] **Step 2: Browser-test bottom-nav**

- `#/history` (solo) → Historie-tab actief
- `#/history?friend=<x>&view=day&date=<vandaag>` → Historie-tab actief (niet Vrienden!)
- `#/friends` → Vrienden-tab actief
- `#/`, `#/day?date=<x>` → Home-tab actief
- `#/settings` → Settings-tab actief

- [ ] **Step 3: Commit**

```bash
git add src/js/ui.js
git commit -m "nav: drop friend-* path detection; #/history is always Historie tab"
```

---

## Phase 9 — Old views verwijderen + CSS opruimen

### Task 11: Verwijder oude friend-views en opgeruimde CSS

**Files:**
- Delete: `src/js/views/friend-day.js`
- Delete: `src/js/views/friend-week.js`
- Delete: `src/js/views/friend-month.js`
- Delete: `src/js/views/components/friend-header.js`
- Modify: `src/css/style.css` (verwijder ongebruikte regels)

- [ ] **Step 1: Verwijder de vier `.js` files**

```bash
rm src/js/views/friend-day.js
rm src/js/views/friend-week.js
rm src/js/views/friend-month.js
rm src/js/views/components/friend-header.js
```

- [ ] **Step 2: Verifieer geen overgebleven imports**

```bash
grep -rn "friend-day\|friend-week\|friend-month\|friend-header" src/ docs/ 2>/dev/null | grep -v node_modules
```
Verwacht: alleen referenties in changelog/docs (verleden) of in deze plan-file. Geen code-imports.

- [ ] **Step 3: Verwijder ongebruikte CSS-blokken**

In `src/css/style.css` zijn deze blokken niet meer in gebruik:

(a) `.friend-view-toggle` block — zoek rond regel 928:
```css
.friend-view-toggle { ... }
.friend-view-toggle button { ... }
.friend-view-toggle button.active { ... }
```
Verwijder dit hele blok.

(b) `.period-bar`, `.period-bar-month`, `.period-bars`, `.period-bars-month`, `.period-nav-btn`, `.period-bar-disabled`, `.period-bar-fill`, `.period-bar-label` — zoek rond regel 1045-1090:
```css
/* friend-week/month ... */
.period-nav-btn { ... }
.period-bars { ... }
.period-bars-month { ... }
.period-bar { ... }
.period-bar-disabled { ... }
.period-bar-fill { ... }
.period-bar-label { ... }
```
Verwijder dit hele blok. **Behoud** `.period-arrow`, `.period-nav`, `.period-title`, `.period-stats`, `.period-stat` — die worden nog gebruikt door `history.js` (solo en compare).

(c) `.back-btn` — alleen ongebruikt als geen andere view het gebruikt:
```bash
grep -rn "back-btn" src/js/ src/index.html
```
Als alleen `friend-header.js` (verwijderd) het gebruikte → ook verwijderen. Zo niet → laten staan.

(d) Kopieer-knoppen (`.meal-copy-btn`, `.entry-copy-btn`) — blijven nodig (compare-day gebruikt ze). **Niet verwijderen**.

- [ ] **Step 4: Browser-test (regressie)**

Volledige rondgang:
- `#/` (today) → werkt
- `#/day?date=2026-04-30` → werkt
- `#/history` → solo werkt
- `#/history?friend=<x>&view=week` → compare-week werkt
- `#/history?friend=<x>&view=month` → compare-month werkt
- `#/history?friend=<x>&view=day&date=<x>` → compare-day werkt
- Geen broken styles, geen JS-fouten in console

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "cleanup: remove friend-day/week/month/header views + obsolete CSS"
```

---

## Phase 10 — SW + docs

### Task 12: Service worker cache bump + asset list

**Files:**
- Modify: `src/sw.js`

- [ ] **Step 1: Bump `CACHE_NAME`**

In `src/sw.js`:
```javascript
const CACHE_NAME = 'unfat-v38';
```
verhogen naar:
```javascript
const CACHE_NAME = 'unfat-v39';
```

- [ ] **Step 2: Update `STATIC_ASSETS`**

Verwijder uit `STATIC_ASSETS`:
```javascript
'./js/views/friend-day.js',
'./js/views/friend-week.js',
'./js/views/friend-month.js',
'./js/views/components/friend-header.js',
```

Voeg toe (alfabetisch tussen bestaande regels):
```javascript
'./js/views/components/person-selector.js',
'./js/views/components/compare-day.js',
'./js/views/components/compare-week.js',
'./js/views/components/compare-month.js',
```

- [ ] **Step 3: Browser-test SW update-prompt**

Niet kritiek voor lokaal testen (SW is uit op localhost). In productie: na deploy verschijnt "Nieuwe versie beschikbaar"-toast bij bestaande gebruikers.

- [ ] **Step 4: Commit**

```bash
git add src/sw.js
git commit -m "sw: bump cache to v39 and refresh static asset list"
```

### Task 13: CHANGELOG + ROADMAP update

**Files:**
- Modify: `docs/general/CHANGELOG.md`
- Modify: `docs/general/ROADMAP.md`

- [ ] **Step 1: CHANGELOG entry**

Voeg bovenaan onder de huidige top-entry een nieuwe sectie toe voor 2026-05-05. Volg het stijl-pattern uit eerdere entries (kort, beschrijvend, in het Nederlands).

```markdown
## 2026-05-05

### N. Vrienden & historie redesign
- **Eén gedeelde Historie-pagina** (`#/history`) vervangt de aparte `#/friend-*` routes. Persoon-selector bovenaan: "Ik" altijd actief, één vriend opt-in voor vergelijken.
- **Dag-view** toegevoegd op de Historie-tab (gedeeld met dashboard `day.js` — edit/add/swipe-delete werken identiek).
- **Vergelijken on one page** in alle drie views:
  - Dag: hero 2-koloms + per-maaltijd jouw blok boven, vriend-blok onder (read-only met kopieer-knoppen)
  - Week: 7 rijen met 2 horizontale bars per dag (vol = ik, diagonaal gestreept = vriend)
  - Maand: kalender-grid met 2 mini verticale bars per cel; tap-cel = inzoom op die dag
- **Bar-conventie**: kleur = doel-staat (groen/oranje/rood), patroon = persoon. Pill-active toont mini-bar-swatch (vol of gestreept) als visuele legenda.
- Verwijderd: `friend-day.js`, `friend-week.js`, `friend-month.js`, `friend-header.js` + bijbehorende CSS-classes.
- Bottom-nav: Historie-tab is nu actief op `#/history`, ook met `friend`-param.
- Geen DB-wijzigingen — bestaande RPCs `get_friend_day` / `get_friend_period` hergebruikt.
```

- [ ] **Step 2: ROADMAP — verplaats N1+N2 naar Afgerond**

In `docs/general/ROADMAP.md`, voeg bovenaan de Afgerond-tabel een nieuwe rij:

```markdown
| 2026-05-05 | N. Vrienden & historie redesign | Eén gedeelde Historie-pagina (`#/history`) met persoon-selector. Dag/Week/Maand-views renderen jouw stats én één vriend in vergelijk-modus. Bar-kleur = doel-staat, bar-patroon = persoon (vol = ik, diagonaal = vriend). Friend-views (`friend-day/week/month/header`) verwijderd; `#/friend-*` routes weg |
```

Onder D. Vrienden — wensen blijven N3 en N4 staan (al gemarkeerd "aparte ronde na N1+N2-redesign" — laten zoals ze zijn).

- [ ] **Step 3: Verplaats spec en plan naar `done/`**

```bash
git mv docs/superpowers/specs/2026-05-05-vrienden-historie-redesign-design.md docs/superpowers/specs/done/
git mv docs/superpowers/plans/2026-05-05-vrienden-historie-redesign.md docs/superpowers/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/general/CHANGELOG.md docs/general/ROADMAP.md
git commit -m "docs: CHANGELOG + ROADMAP update for N. Vrienden & historie redesign + archive spec/plan"
```

---

## Manuele testchecklist (laatste smoke test)

Loop alle items in de **Manuele testchecklist** sectie van de spec door (`docs/superpowers/specs/done/2026-05-05-vrienden-historie-redesign-design.md`). Voor elk groen punt: vink af in de spec niet — dat is een eenmalige spec, geen tracking-document. Gebruik dit gewoon als checklist tijdens hands-on testen op telefoon (Live Server URL via dezelfde Wi-Fi, of via Tailscale/Cloudflare-tunnel).

Aandachtspunten:
- Solo-modus regressie (week/maand exact als voorheen + Dag-toggle nieuw)
- Vergelijk-modus voor `share_level` = total / per_meal / entries
- ‹ › nav binnen elke view + behoud `friend`-param
- Bottom-nav state altijd Historie op `#/history`
- Service worker bump → in productie verschijnt update-prompt

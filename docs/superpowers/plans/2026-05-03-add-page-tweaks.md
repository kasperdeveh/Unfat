# Toevoegen-pagina UX-tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a NEVO-toggle chip and shorten the Recents list on the toevoegen-pagina so users can hide NEVO-products and reach the "+ Nieuw product aanmaken" button quickly.

**Architecture:** One new boolean column on `profiles` for the user-level NEVO preference. UI changes confined to `src/js/views/add-food.js` (+ chip styling in `style.css`). Recents collapse is local view-state, not persisted.

**Tech Stack:** vanilla HTML/CSS/JS, Supabase (PostgreSQL + RLS), Service Worker for offline cache.

**No automated tests:** Project uses manual browser verification via Live Server (CLAUDE.md). Each task ends with explicit "verify in browser" steps.

**Spec:** `docs/superpowers/specs/2026-05-03-add-page-tweaks-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<timestamp>_profiles_hide_nevo.sql` | Add `hide_nevo` column to `profiles`. |
| `src/js/db/profiles.js` | New `updateMyHideNevo(hide)` function. `getMyProfile()` returns the new column automatically (uses `select('*')`). |
| `src/js/views/add-food.js` | Render chip, manage `hideNevo` state, filter logic, Recents collapse, NEVO badge in rows. |
| `src/css/style.css` | New `.chip` (default + active) and `.badge-nevo` rules. |
| `src/sw.js` | Bump `CACHE_NAME` from `unfat-v29` to `unfat-v30`. |

---

## Task 1: Database migration — add `hide_nevo` column

**Files:**
- Create: `supabase/migrations/<UTC-timestamp>_profiles_hide_nevo.sql` (timestamp computed in step 1)

- [ ] **Step 1: Generate the migration filename**

Run:
```bash
echo "supabase/migrations/$(date -u +%Y%m%d%H%M%S)_profiles_hide_nevo.sql"
```

Use the printed path verbatim for the next step. The 14-digit timestamp is per CLAUDE.md ("Migration filenames: `YYYYMMDDHHMMSS_<naam>.sql` met echte UTC-tijdstempel").

- [ ] **Step 2: Write the migration file**

Content:
```sql
-- Migration: add hide_nevo preference to profiles.
-- Used by add-food page to filter out NEVO-products in Recents and search results.

alter table public.profiles
  add column hide_nevo boolean not null default false;
```

- [ ] **Step 3: Apply to cloud DB**

Run:
```bash
supabase db push
```

Expected: `Applying migration <timestamp>_profiles_hide_nevo.sql...` followed by `Finished supabase db push.`

If `supabase` is not on PATH, install it per CLAUDE.md "Supabase CLI" section first.

- [ ] **Step 4: Verify column exists**

Run:
```bash
supabase db pull --schema public --dry-run 2>&1 | grep hide_nevo || \
  echo "Column not found — check the migration was applied"
```

Expected: a line containing `hide_nevo boolean not null default false` (or similar). If empty, re-run `supabase db push`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<timestamp>_profiles_hide_nevo.sql
git commit -m "Add hide_nevo column to profiles for NEVO-filter preference"
```

---

## Task 2: DB helper — `updateMyHideNevo()`

**Files:**
- Modify: `src/js/db/profiles.js` (append after `updateMyShareLevel`, ~line 79)

- [ ] **Step 1: Add the function**

Find the block ending with `updateMyShareLevel` (currently around lines 70-79):
```js
export async function updateMyShareLevel(level) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('profiles')
    .update({ share_level: level })
    .eq('id', session.user.id);
  if (error) throw error;
}
```

Add immediately after it:
```js
// Update only the hide_nevo preference for the current user.
// Used by the toevoegen-pagina chip to persist the filter cross-device.
export async function updateMyHideNevo(hide) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('profiles')
    .update({ hide_nevo: hide })
    .eq('id', session.user.id);
  if (error) throw error;
}
```

- [ ] **Step 2: Verify the file still parses**

Run:
```bash
node --check src/js/db/profiles.js
```

Expected: no output (silent success). If it errors, fix the syntax issue before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/js/db/profiles.js
git commit -m "Add updateMyHideNevo() to profiles DB helper"
```

---

## Task 3: CSS — `.chip` and `.badge-nevo` styles

**Files:**
- Modify: `src/css/style.css` (append at end-of-file)

- [ ] **Step 1: Append the new rules**

Open `src/css/style.css` and append at the bottom:

```css
/* Filter chip — used on the add-food page to toggle NEVO-products visibility. */
.chiprow {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.chip {
  background: transparent;
  border: 1px solid #2a2d33;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  color: #b8babe;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}

.chip:hover {
  border-color: #3a3d43;
  color: #d8dade;
}

.chip[aria-pressed="true"] {
  background: rgba(0, 230, 118, 0.15);
  border-color: var(--accent);
  color: var(--accent);
}

.chip[aria-pressed="true"]::before {
  content: "●";
  font-size: 10px;
}

/* NEVO source badge in product rows on the add-food page. */
.badge-nevo {
  font-size: 10px;
  background: #2a2d33;
  color: #8a8d92;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 6px;
  vertical-align: 1px;
  letter-spacing: 0.3px;
}
```

- [ ] **Step 2: Visual smoke check**

Open `src/index.html` with Live Server (port 5500). Navigate anywhere. The page should still render — there are no breaking changes since the new classes aren't yet used.

Expected: page loads as before, no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/css/style.css
git commit -m "Add chip and badge-nevo styles for add-food page"
```

---

## Task 4: NEVO toggle chip in add-food (UI + state + persistence)

**Files:**
- Modify: `src/js/views/add-food.js`

- [ ] **Step 1: Add imports**

Replace lines 1-4 of `src/js/views/add-food.js`:
```js
import { listProducts } from '../db/products.js';
import { listRecentProductsForUser } from '../db/entries.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../utils/html.js';
```

with:
```js
import { listProducts } from '../db/products.js';
import { listRecentProductsForUser } from '../db/entries.js';
import { getMyProfile, updateMyHideNevo } from '../db/profiles.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import { escapeHtml } from '../utils/html.js';
```

- [ ] **Step 2: Add the chip to the rendered HTML**

Find the existing `container.innerHTML` block (currently lines 13-31). Replace the line:
```html
    <input class="input" id="search" type="search" placeholder="Zoek product..." autocomplete="off">
```

with:
```html
    <input class="input" id="search" type="search" placeholder="Zoek product..." autocomplete="off">

    <div class="chiprow">
      <button class="chip" id="nevo-chip" type="button" aria-pressed="false">NEVO producten verbergen</button>
    </div>
```

- [ ] **Step 3: Load the profile alongside products and add the `hideNevo` state variable**

Find the existing `Promise.all` block (currently lines 46-57):
```js
  let allProducts = [];
  let recentProducts = [];
  try {
    [allProducts, recentProducts] = await Promise.all([
      listProducts(),
      listRecentProductsForUser(TOP_N_DEFAULT),
    ]);
  } catch (err) {
    document.getElementById('results').innerHTML =
      `<p class="error">Kon producten niet laden: ${err.message}</p>`;
    return;
  }
```

Replace with:
```js
  let allProducts = [];
  let recentProducts = [];
  let hideNevo = false;
  try {
    const [products, recents, profile] = await Promise.all([
      listProducts(),
      listRecentProductsForUser(TOP_N_DEFAULT),
      getMyProfile(),
    ]);
    allProducts = products;
    recentProducts = recents;
    hideNevo = !!(profile && profile.hide_nevo);
  } catch (err) {
    document.getElementById('results').innerHTML =
      `<p class="error">Kon producten niet laden: ${err.message}</p>`;
    return;
  }
```

- [ ] **Step 4: Initialize the chip state and wire its click handler**

Find the line:
```js
  const search = document.getElementById('search');
  const resultsEl = document.getElementById('results');
```

Insert the following block immediately after these two lines:
```js
  const chipEl = document.getElementById('nevo-chip');

  function syncChip() {
    chipEl.setAttribute('aria-pressed', String(hideNevo));
    chipEl.textContent = hideNevo ? 'NEVO producten tonen' : 'NEVO producten verbergen';
  }
  syncChip();

  chipEl.addEventListener('click', async () => {
    const previous = hideNevo;
    hideNevo = !hideNevo;
    syncChip();
    renderResults(search.value);
    try {
      await updateMyHideNevo(hideNevo);
    } catch (err) {
      hideNevo = previous;
      syncChip();
      renderResults(search.value);
      showToast('Kon voorkeur niet opslaan');
    }
  });
```

- [ ] **Step 5: Apply the filter in `renderResults`**

Find the current `renderResults` function body (currently lines 62-91):
```js
  function renderResults(query) {
    const q = normalize(query.trim());

    if (!q) {
      if (recentProducts.length > 0) {
        renderList(resultsEl, recentProducts, 'Laatst gegeten', allProducts.length);
      } else {
        resultsEl.innerHTML = `
          <p class="text-muted" style="padding:12px 0;">
            Typ om te zoeken in ${allProducts.length} producten — probeer: appel, brood, yoghurt
          </p>`;
      }
      return;
    }

    const scored = allProducts
      .map(p => ({ p, score: scoreQuery(p, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) =>
        b.score - a.score ||
        a.p.name.length - b.p.name.length ||
        a.p.name.localeCompare(b.p.name, 'nl'))
      .slice(0, TOP_N_SEARCH)
      .map(x => x.p);
    if (scored.length === 0) {
      resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Geen producten gevonden. Maak een nieuw product aan ↓</p>`;
      return;
    }
    renderList(resultsEl, scored, null, null);
  }
```

Replace with:
```js
  function renderResults(query) {
    const q = normalize(query.trim());
    const visibleRecents  = hideNevo ? recentProducts.filter(p => p.source !== 'nevo') : recentProducts;
    const visibleProducts = hideNevo ? allProducts.filter(p => p.source !== 'nevo')    : allProducts;

    if (!q) {
      if (visibleRecents.length > 0) {
        renderList(resultsEl, visibleRecents, 'Laatst gegeten', visibleProducts.length);
      } else {
        resultsEl.innerHTML = `
          <p class="text-muted" style="padding:12px 0;">
            Typ om te zoeken in ${visibleProducts.length} producten — probeer: appel, brood, yoghurt
          </p>`;
      }
      return;
    }

    const scored = visibleProducts
      .map(p => ({ p, score: scoreQuery(p, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) =>
        b.score - a.score ||
        a.p.name.length - b.p.name.length ||
        a.p.name.localeCompare(b.p.name, 'nl'))
      .slice(0, TOP_N_SEARCH)
      .map(x => x.p);
    if (scored.length === 0) {
      resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Geen producten gevonden. Maak een nieuw product aan ↓</p>`;
      return;
    }
    renderList(resultsEl, scored, null, null);
  }
```

- [ ] **Step 6: Verify the file still parses**

Run:
```bash
node --check src/js/views/add-food.js
```

Expected: silent success.

- [ ] **Step 7: Manual browser verification**

Open `src/index.html` via Live Server. Log in, navigate to Voeg eten toe (any maaltijd from a day-view).

Verify:
1. Chip appears below the search bar with text "NEVO producten verbergen", grey/dim styling, no fill.
2. Click the chip → text changes to "NEVO producten tonen", chip turns accent-green with `●` prefix, NEVO products disappear from "Laatst gegeten" and from search results when typing.
3. Refresh the page → chip stays in the same state (persisted via DB).
4. Type a query like "appel" → no NEVO matches when chip is active; full results when chip is inactive.
5. Click chip again → state flips back, NEVO products return.

Expected: all five behaviors work as described. No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/js/views/add-food.js
git commit -m "Add NEVO-filter chip on add-food page"
```

---

## Task 5: NEVO badge in product rows

**Files:**
- Modify: `src/js/views/add-food.js` (the `renderList` helper, currently lines 158-174)

- [ ] **Step 1: Add the badge to the row template**

In `src/js/views/add-food.js`, inside the existing `renderList` function (currently at the bottom of the file), find this single line in the `products.map` template:
```js
        <div>${escapeHtml(p.name)}</div>
```

Replace it with:
```js
        <div>${escapeHtml(p.name)}${p.source === 'nevo' ? '<span class="badge-nevo">NEVO</span>' : ''}</div>
```

No other lines in `renderList` change in this task.

- [ ] **Step 2: Verify the file still parses**

Run:
```bash
node --check src/js/views/add-food.js
```

Expected: silent success.

- [ ] **Step 3: Manual browser verification**

Open Live Server. Navigate to Voeg eten toe.

Verify:
1. Rows where `source='nevo'` (e.g. Banaan, Volkoren brood, Skyr naturel) show a small grey "NEVO" pill behind the product name.
2. Rows where `source='user'` (your own added products, e.g. AH carbonara, Calvé pindakaas) do NOT show the pill.
3. The pill is unobtrusive — same line as the product name, smaller font, faint grey.
4. Search results show the same pattern.

Expected: badge correctly distinguishes NEVO from user products.

- [ ] **Step 4: Commit**

```bash
git add src/js/views/add-food.js
git commit -m "Show NEVO badge in add-food product rows"
```

---

## Task 6: Recents collapse + "Meer tonen" button

**Files:**
- Modify: `src/js/views/add-food.js`

- [ ] **Step 1: Add a constant and view-state**

At the top of the file, find:
```js
const TOP_N_DEFAULT = 20;
const TOP_N_SEARCH  = 50;
```

Replace with:
```js
const TOP_N_DEFAULT = 20;
const TOP_N_SEARCH  = 50;
const RECENTS_VISIBLE = 8;
```

In the `render()` function, find the line declaring `hideNevo`:
```js
  let hideNevo = false;
```

Add the following line immediately below it:
```js
  let recentsExpanded = false;
```

- [ ] **Step 2: Slice Recents in `renderResults` and pass an "expand" callback to `renderList`**

In the `renderResults` function, find:
```js
    if (!q) {
      if (visibleRecents.length > 0) {
        renderList(resultsEl, visibleRecents, 'Laatst gegeten', visibleProducts.length);
      } else {
```

Replace with:
```js
    if (!q) {
      if (visibleRecents.length > 0) {
        const slicedRecents = recentsExpanded
          ? visibleRecents
          : visibleRecents.slice(0, RECENTS_VISIBLE);
        const hiddenCount = visibleRecents.length - slicedRecents.length;
        renderList(resultsEl, slicedRecents, 'Laatst gegeten', visibleProducts.length, hiddenCount);
      } else {
```

- [ ] **Step 3: Add the "Meer tonen" button to `renderList`**

Find the current `renderList` signature:
```js
function renderList(el, products, sectionLabel, totalCount) {
```

Replace the entire `renderList` function with:
```js
function renderList(el, products, sectionLabel, totalCount, moreCount = 0) {
  const header = sectionLabel
    ? `<p class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 4px;">${sectionLabel}</p>`
    : '';
  const moreBtn = moreCount > 0
    ? `<button class="btn-more-recents" id="more-recents-btn" type="button">Meer tonen (${moreCount})</button>`
    : '';
  const footer = totalCount != null
    ? `<p class="text-muted" style="font-size:11px;text-align:center;padding:12px 0;">Typ om te zoeken in ${totalCount} producten</p>`
    : '';
  el.innerHTML = header + `<ul class="list">${products.map(p => `
    <li class="meal-row" data-id="${p.id}">
      <div>
        <div>${escapeHtml(p.name)}${p.source === 'nevo' ? '<span class="badge-nevo">NEVO</span>' : ''}</div>
        <div class="items">${p.kcal_per_100g} kcal/100g${p.unit_grams ? ` · ${p.unit_grams}g/stuk` : ''}</div>
      </div>
      <span>›</span>
    </li>
  `).join('')}</ul>` + moreBtn + footer;
}
```

- [ ] **Step 4: Wire up the "Meer tonen" button click handler**

In `render()`, find the existing click handler on `resultsEl`:
```js
  resultsEl.addEventListener('click', (e) => {
    const row = e.target.closest('.meal-row');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const qs = new URLSearchParams({ product: id });
    if (meal) qs.set('meal', meal);
    if (dateParam) qs.set('date', dateParam);
    navigate(`#/add/portion?${qs}`);
  });
```

Replace with:
```js
  resultsEl.addEventListener('click', (e) => {
    if (e.target.id === 'more-recents-btn') {
      recentsExpanded = true;
      renderResults(search.value);
      return;
    }
    const row = e.target.closest('.meal-row');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const qs = new URLSearchParams({ product: id });
    if (meal) qs.set('meal', meal);
    if (dateParam) qs.set('date', dateParam);
    navigate(`#/add/portion?${qs}`);
  });
```

- [ ] **Step 5: Add the button styling**

Open `src/css/style.css`. Append at the bottom:
```css
/* "Meer tonen" button below Recents on the add-food page. */
.btn-more-recents {
  display: block;
  width: 100%;
  margin: 8px 0 4px;
  padding: 8px;
  background: transparent;
  border: 1px solid #2a2d33;
  border-radius: 8px;
  color: #b8babe;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.btn-more-recents:hover {
  border-color: #3a3d43;
  color: #d8dade;
}
```

- [ ] **Step 6: Verify the file still parses**

Run:
```bash
node --check src/js/views/add-food.js
```

Expected: silent success.

- [ ] **Step 7: Manual browser verification**

Open Live Server. Navigate to Voeg eten toe.

Verify:
1. With more than 8 distinct recent products: Recents shows exactly 8 rows, then a subtle "Meer tonen (X)" button, then the "+ Nieuw product aanmaken" button. The + knop should now be visible without scrolling on a phone-sized viewport.
2. Click "Meer tonen" → all (up to 20) Recents become visible, button disappears.
3. Type a query → Recents disappears, search results appear (no "Meer tonen" in search mode).
4. Navigate away (e.g. to "Vandaag") and back to the toevoegen-pagina → Recents starts collapsed at 8 again. (Note: clearing the search query without leaving the page preserves the expanded state — that is intentional.)
5. With ≤ 8 distinct recents: no "Meer tonen" button shown at all.
6. Toggle the NEVO chip while collapsed: count on the button updates to reflect the filtered Recents count. If the filtered count drops to 8 or below, the button disappears.

Expected: all six behaviors correct.

- [ ] **Step 8: Commit**

```bash
git add src/js/views/add-food.js src/css/style.css
git commit -m "Collapse Recents to 8 with 'Meer tonen' expand button"
```

---

## Task 7: Bump SW cache + final integration test

**Files:**
- Modify: `src/sw.js` (line 4)

- [ ] **Step 1: Bump CACHE_NAME**

Find line 4 in `src/sw.js`:
```js
const CACHE_NAME = 'unfat-v29';
```

Replace with:
```js
const CACHE_NAME = 'unfat-v30';
```

- [ ] **Step 2: Full integration test**

Open `src/index.html` via Live Server. Run through the full spec test-plan:

1. Verse user (delete existing user or fresh login): default state → chip dim, NEVO-rijen zichtbaar in Recents en in zoekresultaten.
2. Chip aan → NEVO-rijen verdwijnen uit Recents én uit live zoekresultaten.
3. Refresh van de pagina → chip-state behouden (komt uit DB).
4. PWA op telefoon (devtools → Application → Service Workers, or test on actual phone): zelfde state als op desktop.
5. Recents-lijst toont eerst 8; klik "Meer tonen (12)" → toont alle 20.
6. Navigeer weg (bv. naar Vandaag) en kom terug → Recents start weer collapsed op 8.
7. NEVO-badge alleen zichtbaar bij rijen met `source='nevo'`, alleen op de toevoegen-pagina (Day, History, Friends day-view → geen badge).

Expected: all 7 scenarios pass. No console errors.

- [ ] **Step 3: Update CHANGELOG.md and ROADMAP.md**

Open `docs/general/CHANGELOG.md`. Add a top-of-list entry under today's date (or create a new date heading):

```markdown
## 2026-05-03

- Toevoegen-pagina: NEVO-toggle chip onder de zoekbalk (state persist per user via `profiles.hide_nevo`); "Laatst gegeten" toont default 8 items met "Meer tonen"-knop; NEVO-badge in product-rijen op deze pagina; SW cache v30
```

Open `docs/general/ROADMAP.md`. In the "Afgerond ✅" tabel, add a new row:
```markdown
| 2026-05-03 | M. Toevoegen-pagina UX-tweaks: NEVO-toggle chip met per-user persist (kolom `profiles.hide_nevo`), Recents collapsed op 8 met "Meer tonen"-knop, NEVO-badge in product-rijen alleen op de toevoegen-pagina |
```

There is currently no "M. Toevoegen-pagina UX-tweaks" section in the open list (only in this plan and the spec); just add the row to the Afgerond table — no removal needed.

- [ ] **Step 4: Move the spec to done/**

Run:
```bash
git mv docs/superpowers/specs/2026-05-03-add-page-tweaks-design.md docs/superpowers/specs/done/
```

- [ ] **Step 5: Move this plan to done/**

Run:
```bash
git mv docs/superpowers/plans/2026-05-03-add-page-tweaks.md docs/superpowers/plans/done/
```

- [ ] **Step 6: Commit**

The `git mv` commands in steps 4-5 already staged the renames. Add the remaining files and commit:
```bash
git add src/sw.js docs/general/CHANGELOG.md docs/general/ROADMAP.md
git commit -m "Bump SW cache to v30 and finalize add-page-tweaks (M)"
```

---

## Spec coverage check

| Spec section | Implementing task |
|---|---|
| Datamodel (`hide_nevo` column) | Task 1 |
| Persistence (`updateMyHideNevo`) | Task 2 |
| Chip UI + state + a11y | Tasks 3 (CSS), 4 (JS) |
| Filter-logica (`source !== 'nevo'`) | Task 4 step 5 |
| NEVO-badge in rijen | Tasks 3 (CSS), 5 (JS) |
| Recents constants + state | Task 6 step 1 |
| "Meer tonen" knop | Task 6 steps 3-5 |
| Service worker bump | Task 7 step 1 |
| Test-plan uit spec | Task 7 step 2 |
| ROADMAP + CHANGELOG | Task 7 step 3 |
| Spec/plan archivering | Task 7 steps 4-5 |

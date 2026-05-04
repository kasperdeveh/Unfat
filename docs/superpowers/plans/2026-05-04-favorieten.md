# L. Favorieten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pin (star) products and dishes for fast access. The toevoegen-pagina gets a fourth filter tab `★` that shows only pinned items; star-toggles appear in list rows, in the portion-screen header, and in the dish-builder edit-mode header.

**Architecture:** Two new tables (`product_favorites`, `dish_favorites`) — one row per (user_id, item_id) — with composite PK + cascade FK + per-user RLS. New DB helper `src/js/db/favorites.js` exposes `getMyFavorites()`, `toggleProductFavorite()`, `toggleDishFavorite()`. UI changes in `add-food.js` (filter + rij-ster + favorites mode), `add-food-portion.js` (header-ster), `dish-builder.js` (header-ster in edit-mode).

**Tech Stack:** vanilla HTML/CSS/JS, Supabase (PostgreSQL + RLS), Service Worker for offline cache.

**No automated tests:** Project uses manual browser verification via Live Server (CLAUDE.md). Each task ends with explicit "verify in browser" steps.

**Spec:** `docs/superpowers/specs/2026-05-04-favorieten-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<timestamp>_favorites.sql` | Create `product_favorites` + `dish_favorites` tables, FKs, RLS policies. |
| `src/js/db/favorites.js` | New DB helper: `getMyFavorites()`, `toggleProductFavorite(id, on)`, `toggleDishFavorite(id, on)`. |
| `src/css/style.css` | New `.btn-fav-row` rules + ster-state colors for `.btn-icon`. |
| `src/js/views/add-food.js` | Fourth filter button, favorites cold-start fetch, ster-toggle in rows, favorites buildList + empty state. |
| `src/js/views/add-food-portion.js` | Ster-knop in `view-header`, naast bestaande potlood. |
| `src/js/views/dish-builder.js` | Ster-knop in `view-header` in edit-mode. |
| `src/sw.js` | Bump `CACHE_NAME` from `unfat-v32` to `unfat-v33`. |
| `docs/general/CHANGELOG.md` | Entry under 2026-05-04. |
| `docs/general/ROADMAP.md` | Move L. Favorieten to "Afgerond ✅" table. |

---

## Task 1: Database migration — favorites tables

**Files:**
- Create: `supabase/migrations/<UTC-timestamp>_favorites.sql` (timestamp computed in step 1)

- [ ] **Step 1: Generate the migration filename**

Run:
```bash
echo "supabase/migrations/$(date -u +%Y%m%d%H%M%S)_favorites.sql"
```

Use the printed path verbatim for step 2. The 14-digit timestamp is per CLAUDE.md ("Migration filenames: `YYYYMMDDHHMMSS_<naam>.sql` met echte UTC-tijdstempel").

- [ ] **Step 2: Write the migration file**

Content:
```sql
-- Migration: handmatige favorieten voor producten en gerechten.
-- Twee aparte tabellen i.p.v. polymorfe relatie zodat foreign keys
-- echte cascade delete + integriteit afdwingen per relatie.

create table public.product_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.dish_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  dish_id    uuid not null references public.dishes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dish_id)
);

alter table public.product_favorites enable row level security;
alter table public.dish_favorites    enable row level security;

create policy "select own product favorites"
  on public.product_favorites for select
  using (auth.uid() = user_id);

create policy "insert own product favorites"
  on public.product_favorites for insert
  with check (auth.uid() = user_id);

create policy "delete own product favorites"
  on public.product_favorites for delete
  using (auth.uid() = user_id);

create policy "select own dish favorites"
  on public.dish_favorites for select
  using (auth.uid() = user_id);

create policy "insert own dish favorites"
  on public.dish_favorites for insert
  with check (auth.uid() = user_id);

create policy "delete own dish favorites"
  on public.dish_favorites for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 3: Apply to cloud DB**

Run:
```bash
supabase db push
```

Expected: `Applying migration <timestamp>_favorites.sql...` followed by `Finished supabase db push.`

If `supabase` is not on PATH, install per CLAUDE.md "Supabase CLI" section first.

- [ ] **Step 4: Verify tables and policies exist**

Run:
```bash
supabase db pull --schema public --dry-run 2>&1 | grep -E "product_favorites|dish_favorites" | head
```

Expected: lines mentioning both `product_favorites` and `dish_favorites`. If empty, re-run `supabase db push`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<timestamp>_favorites.sql
git commit -m "Add product_favorites and dish_favorites tables with RLS"
```

---

## Task 2: DB helper — `src/js/db/favorites.js`

**Files:**
- Create: `src/js/db/favorites.js`

- [ ] **Step 1: Create the file with all three functions**

Write to `src/js/db/favorites.js`:

```js
import { supabase } from '../supabase.js';

// Returns the current user's favorites as two id-Sets.
// Used cold-start by add-food (to render star-state in rows + filter the
// Favorites tab) and by portion-screen / dish-builder (to render the
// header-star). Two parallel SELECTs; PK-indexed and bounded (<50 rows
// realistic) so no pagination needed.
export async function getMyFavorites() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const [pf, df] = await Promise.all([
    supabase.from('product_favorites').select('product_id').eq('user_id', session.user.id),
    supabase.from('dish_favorites').select('dish_id').eq('user_id', session.user.id),
  ]);
  if (pf.error) throw pf.error;
  if (df.error) throw df.error;

  return {
    productIds: new Set(pf.data.map(r => r.product_id)),
    dishIds:    new Set(df.data.map(r => r.dish_id)),
  };
}

// Toggle a product favorite. `on=true` inserts, `on=false` deletes.
// Race-safe: a duplicate insert (PK collision, code 23505) is silently
// ignored — the UI is already in the desired state.
export async function toggleProductFavorite(productId, on) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  if (on) {
    const { error } = await supabase
      .from('product_favorites')
      .insert({ user_id: session.user.id, product_id: productId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('product_favorites')
      .delete()
      .eq('user_id', session.user.id)
      .eq('product_id', productId);
    if (error) throw error;
  }
}

// Toggle a dish favorite. Same race-safety as toggleProductFavorite.
export async function toggleDishFavorite(dishId, on) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  if (on) {
    const { error } = await supabase
      .from('dish_favorites')
      .insert({ user_id: session.user.id, dish_id: dishId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('dish_favorites')
      .delete()
      .eq('user_id', session.user.id)
      .eq('dish_id', dishId);
    if (error) throw error;
  }
}
```

- [ ] **Step 2: Verify the file parses**

Run:
```bash
node --check src/js/db/favorites.js
```

Expected: silent success (no output). If it errors, fix the syntax.

- [ ] **Step 3: Commit**

```bash
git add src/js/db/favorites.js
git commit -m "Add favorites DB helper (getMyFavorites + toggle product/dish)"
```

---

## Task 3: CSS — `.btn-fav-row` + ster-state for `.btn-icon`

**Files:**
- Modify: `src/css/style.css` (append at end of file)

- [ ] **Step 1: Append the new rules**

Open `src/css/style.css` and append at the bottom:

```css
/* Star button inside list rows on the add-food page. Tap = toggle pin
   without navigating. Sized as a 44px square tap-target, so finger-friendly
   on mobile while remaining visually small. */
.btn-fav-row {
  background: transparent;
  border: 0;
  padding: 0 6px;
  width: 32px;
  height: 44px;
  cursor: pointer;
  font-size: 18px;
  line-height: 44px;
  font-family: inherit;
  color: #444;
  flex-shrink: 0;
  transition: color 120ms ease, transform 120ms ease;
}

.btn-fav-row[aria-pressed="true"] {
  color: #ffc107;
}

.btn-fav-row:active {
  transform: scale(0.85);
}

/* Star button reused inside view-header (portion-screen + dish-builder). */
.btn-icon.btn-fav-header {
  color: #888;
}

.btn-icon.btn-fav-header[aria-pressed="true"] {
  color: #ffc107;
}
```

- [ ] **Step 2: Visual smoke check**

Open `src/index.html` with Live Server. Navigate around the app. Pages should still render — there are no breaking changes since the new classes aren't yet used.

Expected: page loads as before, no console errors, no visible style changes.

- [ ] **Step 3: Commit**

```bash
git add src/css/style.css
git commit -m "Add btn-fav-row and ster-state styles for favorites"
```

---

## Task 4: Add-food page — fourth filter button + favorites cold-start fetch

**Files:**
- Modify: `src/js/views/add-food.js`

- [ ] **Step 1: Add the favorites import**

Find line 1-8 of `src/js/views/add-food.js` (the imports). After the existing imports, add a new import line for the favorites helper. The block should become:

```js
import { listProducts } from '../db/products.js';
import { listDishes } from '../db/dishes.js';
import { listRecentItemsForUser } from '../db/entries.js';
import { getMyProfile, updateMyHideNevo } from '../db/profiles.js';
import { getMyFavorites, toggleProductFavorite, toggleDishFavorite } from '../db/favorites.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import { escapeHtml } from '../utils/html.js';
import { normalize, rankProducts } from '../utils/product-search.js';
```

- [ ] **Step 2: Add fourth entry to FILTER_OPTIONS**

Find the `FILTER_OPTIONS` constant (around line 14). Replace it:

```js
const FILTER_OPTIONS = [
  { key: 'all',       label: 'Alles' },
  { key: 'products',  label: 'Producten' },
  { key: 'dishes',    label: 'Gerechten' },
  { key: 'favorites', label: '★', ariaLabel: 'Favorieten' },
];
```

- [ ] **Step 3: Use ariaLabel in the button rendering**

Find the chiprow markup (around line 39):
```js
${FILTER_OPTIONS.map(o => `<button data-filter="${o.key}" type="button">${o.label}</button>`).join('')}
```

Replace with:
```js
${FILTER_OPTIONS.map(o => `<button data-filter="${o.key}" type="button"${o.ariaLabel ? ` aria-label="${o.ariaLabel}"` : ''}>${o.label}</button>`).join('')}
```

- [ ] **Step 4: Add favorites to the cold-start Promise.all**

Find the `Promise.all` block in `render()` (around lines 83-88):
```js
const [products, dishes, recentItems, profile] = await Promise.all([
  listProducts(),
  listDishes(),
  listRecentItemsForUser(TOP_N_DEFAULT),
  getMyProfile(),
]);
```

Replace with:
```js
const [products, dishes, recentItems, profile, favs] = await Promise.all([
  listProducts(),
  listDishes(),
  listRecentItemsForUser(TOP_N_DEFAULT),
  getMyProfile(),
  getMyFavorites(),
]);
```

- [ ] **Step 5: Persist favorites in a closure-scoped variable**

Find the existing block right after the destructured assignment (around lines 89-92):
```js
allProducts = products;
allDishes = dishes;
recents = recentItems;
hideNevo = !!(profile && profile.hide_nevo);
```

Add a new variable declaration *above* this block (around line 75 — group with other `let` declarations like `recentsExpanded`):

Find:
```js
  let recentsExpanded = false;
```

Replace with:
```js
  let recentsExpanded = false;
  let favorites = { productIds: new Set(), dishIds: new Set() };
```

Then in the catch-block area (just below line 92), add:
```js
favorites = favs;
```

The full updated block should read:
```js
allProducts = products;
allDishes = dishes;
recents = recentItems;
hideNevo = !!(profile && profile.hide_nevo);
favorites = favs;
```

- [ ] **Step 6: Disable NEVO chip in favorites filter (mirror gerechten behaviour)**

Find the `syncChip()` function (around lines 104-108):
```js
function syncChip() {
  chipEl.setAttribute('aria-pressed', String(hideNevo));
  chipEl.textContent = hideNevo ? 'NEVO producten tonen' : 'NEVO producten verbergen';
  chipEl.disabled = filter === 'dishes';
}
```

Replace `chipEl.disabled = filter === 'dishes';` with `chipEl.disabled = filter === 'dishes' || filter === 'favorites';` so the full function becomes:

```js
function syncChip() {
  chipEl.setAttribute('aria-pressed', String(hideNevo));
  chipEl.textContent = hideNevo ? 'NEVO producten tonen' : 'NEVO producten verbergen';
  chipEl.disabled = filter === 'dishes' || filter === 'favorites';
}
```

Also find `chipEl.disabled = filter === 'dishes';` in the chipEl click handler's `finally` (around line 141) and replace with:
```js
chipEl.disabled = filter === 'dishes' || filter === 'favorites';
```

- [ ] **Step 7: Verify file parses**

Run:
```bash
node --check src/js/views/add-food.js
```

Expected: silent success.

- [ ] **Step 8: Browser smoke check**

Open `src/index.html` with Live Server. Tap "Voeg eten toe". Expect:
- Four filter buttons: `Alles · Producten · Gerechten · ★`
- Default still highlights `Alles`
- Tapping `★` switches the active state but otherwise renders nothing meaningful yet (Recents disappear, no list shown — that's wired in Task 6)
- NEVO-chip becomes disabled when `★` is active

If any of those break, fix before committing.

- [ ] **Step 9: Commit**

```bash
git add src/js/views/add-food.js
git commit -m "Add fourth filter button + favorites cold-start fetch on add-food"
```

---

## Task 5: Add-food page — star toggle in list rows

**Files:**
- Modify: `src/js/views/add-food.js`

- [ ] **Step 1: Update `renderItemList` to render a star button per row**

Find the `renderItemList` function (around lines 244-268). Replace the entire function:

```js
function renderItemList(items) {
  return `<ul class="list">${items.map(item => {
    if (item.kind === 'dish') {
      const d = item.dish;
      const on = favorites.dishIds.has(d.id);
      return `
        <li class="meal-row" data-kind="dish" data-id="${d.id}">
          <div>
            <div>${escapeHtml(d.name)}<span class="badge-dish">GERECHT</span></div>
            <div class="items">${d.default_meal_type ? `Suggestie: ${MEAL_LABEL_SHORT[d.default_meal_type] || d.default_meal_type}` : 'Bundel van producten'}</div>
          </div>
          <button class="btn-fav-row" data-fav-kind="dish" data-fav-id="${d.id}" aria-label="Favoriet" aria-pressed="${on}">${on ? '★' : '☆'}</button>
          <span>›</span>
        </li>`;
    } else {
      const p = item.product;
      const on = favorites.productIds.has(p.id);
      return `
        <li class="meal-row" data-kind="product" data-id="${p.id}">
          <div>
            <div>${escapeHtml(p.name)}${p.source === 'nevo' ? '<span class="badge-nevo">NEVO</span>' : ''}</div>
            <div class="items">${p.kcal_per_100g} kcal/100g${p.unit_grams ? ` · ${p.unit_grams}g/stuk` : ''}</div>
          </div>
          <button class="btn-fav-row" data-fav-kind="product" data-fav-id="${p.id}" aria-label="Favoriet" aria-pressed="${on}">${on ? '★' : '☆'}</button>
          <span>›</span>
        </li>`;
    }
  }).join('')}</ul>`;
}
```

- [ ] **Step 2: Wire the star button into the existing click handler**

Find the existing click handler on `resultsEl` (around lines 273-294):
```js
resultsEl.addEventListener('click', (e) => {
  if (e.target.closest('#more-recents-btn')) {
    recentsExpanded = true;
    renderResults(search.value);
    return;
  }
  const row = e.target.closest('.meal-row');
  if (!row) return;
  ...
```

Insert a new branch *above* the row-click logic, right after the `more-recents-btn` branch:

```js
resultsEl.addEventListener('click', async (e) => {
  if (e.target.closest('#more-recents-btn')) {
    recentsExpanded = true;
    renderResults(search.value);
    return;
  }

  const favBtn = e.target.closest('.btn-fav-row');
  if (favBtn) {
    e.stopPropagation();
    const kind = favBtn.getAttribute('data-fav-kind');
    const id = favBtn.getAttribute('data-fav-id');
    const wasOn = favBtn.getAttribute('aria-pressed') === 'true';
    const willBe = !wasOn;
    // Optimistic UI flip; revert on error.
    favBtn.setAttribute('aria-pressed', String(willBe));
    favBtn.textContent = willBe ? '★' : '☆';
    if (willBe) {
      (kind === 'dish' ? favorites.dishIds : favorites.productIds).add(id);
    } else {
      (kind === 'dish' ? favorites.dishIds : favorites.productIds).delete(id);
    }
    try {
      if (kind === 'dish') await toggleDishFavorite(id, willBe);
      else                 await toggleProductFavorite(id, willBe);
    } catch (err) {
      // Revert
      favBtn.setAttribute('aria-pressed', String(wasOn));
      favBtn.textContent = wasOn ? '★' : '☆';
      if (wasOn) {
        (kind === 'dish' ? favorites.dishIds : favorites.productIds).add(id);
      } else {
        (kind === 'dish' ? favorites.dishIds : favorites.productIds).delete(id);
      }
      showToast('Kon favoriet niet opslaan');
    }
    return;
  }

  const row = e.target.closest('.meal-row');
  if (!row) return;
  const kind = row.getAttribute('data-kind');
  const id = row.getAttribute('data-id');
  ...
});
```

(Keep the rest of the handler — the `if (kind === 'dish') { … navigate('#/dish/log…') }` and the product navigate — unchanged.)

- [ ] **Step 3: Verify file parses**

Run:
```bash
node --check src/js/views/add-food.js
```

Expected: silent success.

- [ ] **Step 4: Browser smoke check**

Open `src/index.html` with Live Server. Tap "Voeg eten toe". Expect:
- Each row in Recents now shows `★` or `☆` to the right of the name (before the `›`)
- Tap a `☆`: it flips to `★` (yellow) and the row does NOT navigate
- Tap the same row's `★`: flips back to `☆`
- Tap the row's name (not the star): still navigates to portion-screen
- Hard reload: starred items remain starred

If anything misbehaves, fix before committing. Verify the same in search results (type a query).

- [ ] **Step 5: Commit**

```bash
git add src/js/views/add-food.js
git commit -m "Add star toggle button to list rows on add-food"
```

---

## Task 6: Add-food page — favorites filter buildList + empty state

**Files:**
- Modify: `src/js/views/add-food.js`

- [ ] **Step 1: Add favorites branch to `buildList`**

Find `buildList(query)` (around lines 154-191). Locate the empty-query block:
```js
if (!q) {
  let items = recents;
  if (filter === 'products') items = items.filter(r => r.kind === 'product');
  if (filter === 'dishes')   items = items.filter(r => r.kind === 'dish');
  if (hideNevo) items = items.filter(r => r.kind !== 'product' || r.product.source !== 'nevo');

  if (filter === 'dishes') {
    const recentDishIds = new Set(items.map(r => r.dish.id));
    const remaining = allDishes
      .filter(d => !recentDishIds.has(d.id))
      .map(d => ({ kind: 'dish', dish: d }));
    return { kind: 'dishes-all', recents: items, remaining };
  }

  return { kind: 'recents', items };
}
```

Insert a `favorites` branch *above* the dishes-all branch — i.e. between the `if (hideNevo) ...` line and the `if (filter === 'dishes')` line:

```js
if (filter === 'favorites') {
  const favProducts = allProducts
    .filter(p => favorites.productIds.has(p.id))
    .map(p => ({ kind: 'product', product: p }));
  const favDishes = allDishes
    .filter(d => favorites.dishIds.has(d.id))
    .map(d => ({ kind: 'dish', dish: d }));
  const merged = [...favProducts, ...favDishes].sort((a, b) => {
    const an = a.kind === 'dish' ? a.dish.name : a.product.name;
    const bn = b.kind === 'dish' ? b.dish.name : b.product.name;
    return an.localeCompare(bn, 'nl', { sensitivity: 'base' });
  });
  return { kind: 'favorites', items: merged };
}
```

(Note: the favorites branch is reachable from inside the `if (!q)` block since favorites does not depend on a search query at this point. Search-within-favorites is handled in step 2.)

- [ ] **Step 2: Make favorites filter respect search queries too**

Now find the search branch lower in `buildList` (around lines 174-184):
```js
let products = [];
let dishes = [];
if (filter !== 'dishes') {
  products = rankProducts(visibleProducts(), q, TOP_N_SEARCH);
}
if (filter !== 'products') {
  dishes = rankProducts(allDishes, q, TOP_N_SEARCH);
}

const merged = [
  ...dishes.map(d => ({ kind: 'dish', dish: d })),
  ...products.map(p => ({ kind: 'product', product: p })),
];
return { kind: 'search', items: merged };
```

Replace this entire block with:

```js
if (filter === 'favorites') {
  const favProducts = allProducts.filter(p => favorites.productIds.has(p.id));
  const favDishes = allDishes.filter(d => favorites.dishIds.has(d.id));
  const products = rankProducts(favProducts, q, TOP_N_SEARCH);
  const dishes = rankProducts(favDishes, q, TOP_N_SEARCH);
  const merged = [
    ...dishes.map(d => ({ kind: 'dish', dish: d })),
    ...products.map(p => ({ kind: 'product', product: p })),
  ];
  return { kind: 'search', items: merged };
}

let products = [];
let dishes = [];
if (filter !== 'dishes') {
  products = rankProducts(visibleProducts(), q, TOP_N_SEARCH);
}
if (filter !== 'products') {
  dishes = rankProducts(allDishes, q, TOP_N_SEARCH);
}

const merged = [
  ...dishes.map(d => ({ kind: 'dish', dish: d })),
  ...products.map(p => ({ kind: 'product', product: p })),
];
return { kind: 'search', items: merged };
```

- [ ] **Step 3: Render favorites kind in `renderResults`**

Find `renderResults(query)` (around lines 193-242). Locate the empty-state branch:
```js
if ((kind === 'recents' && built.items.length === 0)
    || (kind === 'dishes-all' && built.recents.length === 0 && built.remaining.length === 0)
    || (kind === 'search' && built.items.length === 0)) {
  if (!query.trim()) {
    const noun = filter === 'dishes' ? 'gerechten' : (filter === 'products' ? 'producten' : 'items');
    const totalCount = filter === 'dishes'
      ? allDishes.length
      : (filter === 'products' ? visibleProducts().length : allDishes.length + visibleProducts().length);
    resultsEl.innerHTML = `
      <p class="text-muted" style="padding:12px 0;">
        Typ om te zoeken in ${totalCount} ${noun}
      </p>`;
  } else {
    resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Niets gevonden. Maak iets nieuws aan ↓</p>`;
  }
  return;
}
```

Replace with:
```js
if ((kind === 'recents' && built.items.length === 0)
    || (kind === 'dishes-all' && built.recents.length === 0 && built.remaining.length === 0)
    || (kind === 'favorites' && built.items.length === 0)
    || (kind === 'search' && built.items.length === 0)) {
  if (!query.trim()) {
    if (filter === 'favorites') {
      resultsEl.innerHTML = `
        <p class="text-muted" style="padding:12px 0;">
          Je hebt nog geen favorieten. Tap ☆ bij een product of gerecht om er één toe te voegen.
        </p>`;
      return;
    }
    const noun = filter === 'dishes' ? 'gerechten' : (filter === 'products' ? 'producten' : 'items');
    const totalCount = filter === 'dishes'
      ? allDishes.length
      : (filter === 'products' ? visibleProducts().length : allDishes.length + visibleProducts().length);
    resultsEl.innerHTML = `
      <p class="text-muted" style="padding:12px 0;">
        Typ om te zoeken in ${totalCount} ${noun}
      </p>`;
  } else {
    resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Niets gevonden. Maak iets nieuws aan ↓</p>`;
  }
  return;
}
```

Then find the existing `else` block at the bottom (around line 239-241):
```js
} else {
  resultsEl.innerHTML = renderItemList(built.items);
}
```

This already covers the `favorites` kind (it's the catch-all), so no change is needed there. Verify by reading the file once more.

- [ ] **Step 4: Verify file parses**

Run:
```bash
node --check src/js/views/add-food.js
```

Expected: silent success.

- [ ] **Step 5: Browser smoke check — Favorites flow end-to-end**

Open `src/index.html` with Live Server. Test:

1. Tap "Voeg eten toe", tap `★` filter — empty state text: "Je hebt nog geen favorieten...".
2. Switch back to `Alles`, tap `☆` on 2 products and 1 gerecht.
3. Switch back to `★` — see the 3 items, sorted alphabetically, with `★` (yellow) state on each row.
4. Tap a row name (not star) — navigates correctly to portion-screen / dish-log.
5. In `★` filter, type a query that matches one favorite — only that one shows.
6. In `★` filter, type a query that matches nothing — "Niets gevonden..." text shows.
7. In `★` filter, tap a row's `★` to unstar — it disappears from the list immediately.
8. Hard reload — favorites state persists (stored in DB, not just memory).

If any step fails, fix before committing.

- [ ] **Step 6: Commit**

```bash
git add src/js/views/add-food.js
git commit -m "Add Favorites filter mode + empty state to add-food"
```

---

## Task 7: Portion-screen — star button in header

**Files:**
- Modify: `src/js/views/add-food-portion.js`

- [ ] **Step 1: Add the favorites import**

Find the imports block at the top of `src/js/views/add-food-portion.js` (around lines 1-10). Add a new import line for the favorites helper. The block should include:

```js
import { getMyFavorites, toggleProductFavorite } from '../db/favorites.js';
```

(Place it next to the other `db/` imports for consistency.)

- [ ] **Step 2: Fetch favorites in parallel with the existing data load**

Find where `getProduct(id)` and `getMyProfile()` are awaited (typically near the top of `render()`). Add a parallel `getMyFavorites()` call. Since the exact lines depend on the current file shape, look for the first `Promise.all` in the function (or a sequence of `await` calls) and adapt to add a `favs` value:

```js
const [product, profile, favs] = await Promise.all([
  getProduct(productId),
  getMyProfile(),
  getMyFavorites(),
]);
```

If the file currently does these one-by-one with separate `await`s, leave the existing pattern but add `const favs = await getMyFavorites();` near the others. The goal: by the time the markup is rendered, `favs.productIds` is available.

Add a derived const right after:
```js
let isFav = favs.productIds.has(productId);
```

(`let`, not `const`, because it'll be toggled.)

- [ ] **Step 3: Render the star button in `view-header`**

Find the `view-header` block (around lines 49-56):
```js
container.innerHTML = `
  <div class="view-header">
    <button class="btn-back" id="back-btn">←</button>
    <div>
      <h1>Hoeveelheid</h1>
      <small>${escapeHtml(product.name)}</small>
    </div>
    ${canEdit ? '<button class="btn-icon" id="edit-btn" aria-label="Product bewerken" style="margin-left:auto;">✏️</button>' : ''}
  </div>
```

Replace with:
```js
container.innerHTML = `
  <div class="view-header">
    <button class="btn-back" id="back-btn">←</button>
    <div>
      <h1>Hoeveelheid</h1>
      <small>${escapeHtml(product.name)}</small>
    </div>
    <button class="btn-icon btn-fav-header" id="fav-btn" aria-label="Favoriet" aria-pressed="${isFav}" style="margin-left:auto;">${isFav ? '★' : '☆'}</button>
    ${canEdit ? '<button class="btn-icon" id="edit-btn" aria-label="Product bewerken">✏️</button>' : ''}
  </div>
```

Note: the `margin-left:auto` moves to the favorite button so it's the first right-aligned element; the edit button (when present) sits to its right naturally.

- [ ] **Step 4: Wire the toggle handler**

Find the existing `edit-btn` event listener (currently around lines 92-98). Add a new event listener for `fav-btn` immediately above it:

```js
const favBtn = document.getElementById('fav-btn');
favBtn.addEventListener('click', async () => {
  const wasOn = isFav;
  isFav = !isFav;
  favBtn.setAttribute('aria-pressed', String(isFav));
  favBtn.textContent = isFav ? '★' : '☆';
  try {
    await toggleProductFavorite(productId, isFav);
  } catch {
    isFav = wasOn;
    favBtn.setAttribute('aria-pressed', String(isFav));
    favBtn.textContent = isFav ? '★' : '☆';
    showToast('Kon favoriet niet opslaan');
  }
});
```

If `showToast` is not yet imported in this file, add it to the imports:
```js
import { showToast } from '../ui.js';
```

(Check the imports list first; it may already be there.)

- [ ] **Step 5: Verify file parses**

Run:
```bash
node --check src/js/views/add-food-portion.js
```

Expected: silent success.

- [ ] **Step 6: Browser smoke check**

Open `src/index.html` with Live Server. Tap "Voeg eten toe" → tap any product → portion-screen opens.

- The header right side shows `★` or `☆` (yellow if pinned, grey if not).
- For an editor/admin: ster sits LEFT of the potlood `✏️`; both visible.
- For a normal user: only ster visible (no potlood).
- Tap the ster: state flips immediately, no error.
- Back to add-food → switch to `★` filter → the product is now in the list (or removed, depending on direction).
- The rij-ster on add-food list is in sync with the toggle done in portion-screen on next render.

If any step fails, fix before committing.

- [ ] **Step 7: Commit**

```bash
git add src/js/views/add-food-portion.js
git commit -m "Add star toggle to portion-screen header"
```

---

## Task 8: Dish-builder — star button in header (edit-mode only)

**Files:**
- Modify: `src/js/views/dish-builder.js`

- [ ] **Step 1: Add the favorites import**

Find the imports block at the top of `src/js/views/dish-builder.js` (lines 1-6). Add a new import:

```js
import { getMyFavorites, toggleDishFavorite } from '../db/favorites.js';
```

- [ ] **Step 2: Fetch favorites alongside profile + dish (edit-mode)**

Find the `try` block (around lines 32-54) where `getMyProfile()` and `getDish()` are called. Inside the `try` block, add a `getMyFavorites()` call when `isEdit`:

Replace lines 32-50 (the existing try-block):
```js
try {
  const profile = await getMyProfile();
  if (isEdit) {
    const dish = await getDish(dishId);
    initialName = dish.name;
    ...
  }
} catch (err) { ... }
```

With:
```js
try {
  const profile = await getMyProfile();
  if (isEdit) {
    const [dish, favs] = await Promise.all([getDish(dishId), getMyFavorites()]);
    initialName = dish.name;
    initialMeal = dish.default_meal_type || '';
    initialComponents = (dish.components || []).map(c => ({
      product: c.products,
      amount_grams: Number(c.amount_grams),
    }));
    isFavInitial = favs.dishIds.has(dishId);
    const isOwner = dish.created_by === profile.id;
    const isElevated = ['editor', 'admin'].includes(profile.role);
    canEdit = isOwner || isElevated;
    canDelete = isOwner;
    if (!canEdit) {
      container.innerHTML = `<p class="error" style="padding:16px;">Je mag dit gerecht niet bewerken.</p>`;
      return;
    }
  }
} catch (err) {
  container.innerHTML = `<p class="error" style="padding:16px;">Kon gerecht niet laden: ${escapeHtml(err.message)}</p>`;
  return;
}
```

(Keep the `catch` block content as it was.)

- [ ] **Step 3: Add `isFavInitial` declaration + state tracking**

Find the variable block above the `try` (around lines 26-30):
```js
let initialName = '';
let initialMeal = '';
let initialComponents = [];
let canEdit = true;
let canDelete = true;
```

Replace with:
```js
let initialName = '';
let initialMeal = '';
let initialComponents = [];
let canEdit = true;
let canDelete = true;
let isFavInitial = false;
```

Then find the `state` declaration just below the try-block (around lines 56-60):
```js
let state = {
  name: initialName,
  defaultMeal: initialMeal,
  components: initialComponents.slice(),
};
```

Replace with:
```js
let state = {
  name: initialName,
  defaultMeal: initialMeal,
  components: initialComponents.slice(),
  isFav: isFavInitial,
};
```

- [ ] **Step 4: Render the star in `view-header` (edit-mode only)**

Find the `view-header` block in `renderAll()` (around lines 81-88):
```js
container.innerHTML = `
  <div class="view-header">
    <button class="btn-back" id="back-btn">←</button>
    <div>
      <h1>${isEdit ? 'Gerecht bewerken' : 'Nieuw gerecht'}</h1>
      <small>Bundel producten tot één gerecht</small>
    </div>
  </div>
```

Replace with:
```js
container.innerHTML = `
  <div class="view-header">
    <button class="btn-back" id="back-btn">←</button>
    <div>
      <h1>${isEdit ? 'Gerecht bewerken' : 'Nieuw gerecht'}</h1>
      <small>Bundel producten tot één gerecht</small>
    </div>
    ${isEdit ? `<button class="btn-icon btn-fav-header" id="db-fav" aria-label="Favoriet" aria-pressed="${state.isFav}" style="margin-left:auto;">${state.isFav ? '★' : '☆'}</button>` : ''}
  </div>
```

- [ ] **Step 5: Wire the toggle handler in `bindEvents()`**

Find `bindEvents()` (around line 128) and add a new listener at the top of the function (right after the `back-btn` listener):

```js
function bindEvents() {
  container.querySelector('#back-btn').addEventListener('click', () => navigate('#/add'));

  if (isEdit) {
    const favBtn = container.querySelector('#db-fav');
    favBtn.addEventListener('click', async () => {
      const wasOn = state.isFav;
      state.isFav = !state.isFav;
      favBtn.setAttribute('aria-pressed', String(state.isFav));
      favBtn.textContent = state.isFav ? '★' : '☆';
      try {
        await toggleDishFavorite(dishId, state.isFav);
      } catch {
        state.isFav = wasOn;
        favBtn.setAttribute('aria-pressed', String(state.isFav));
        favBtn.textContent = state.isFav ? '★' : '☆';
        showToast('Kon favoriet niet opslaan');
      }
    });
  }

  // ... rest of bindEvents (existing code, unchanged) ...
}
```

`showToast` should already be imported on line 5; verify before committing.

- [ ] **Step 6: Verify file parses**

Run:
```bash
node --check src/js/views/dish-builder.js
```

Expected: silent success.

- [ ] **Step 7: Browser smoke check**

Open `src/index.html` with Live Server.

1. From "Voeg eten toe" → tap a gerecht → dish-log opens. (Star not here — that's right; dish-log is for logging, not editing.) Tap "Bewerken" via the dish-log header link (or via the meatball menu, depending on UI). The dish-builder edit-page opens.
2. The header shows `★/☆` button (right-aligned).
3. Tap it: state flips, no error.
4. Navigate back to add-food → `★` filter → see/no-see the gerecht according to the toggle.
5. Open `#/dish/new` (the "+ Nieuw gerecht" button) — header has NO ster (only `←` and the title).

If any step fails, fix before committing.

- [ ] **Step 8: Commit**

```bash
git add src/js/views/dish-builder.js
git commit -m "Add star toggle to dish-builder header (edit-mode only)"
```

---

## Task 9: Service worker cache bump + CHANGELOG/ROADMAP + final smoke

**Files:**
- Modify: `src/sw.js`
- Modify: `docs/general/CHANGELOG.md`
- Modify: `docs/general/ROADMAP.md`

- [ ] **Step 1: Add `favorites.js` to STATIC_ASSETS**

Open `src/sw.js`. Find the `STATIC_ASSETS` array. Add `'/js/db/favorites.js'` next to the other `db/` files (alphabetical or grouped — match existing pattern).

If the file uses relative paths, the entry would look like:
```js
'/js/db/favorites.js',
```

Verify by grep:
```bash
grep -n "favorites" src/sw.js
```
Expected: one line showing the new entry.

- [ ] **Step 2: Bump CACHE_NAME**

In `src/sw.js`, find the `CACHE_NAME` constant. Replace `unfat-v32` with `unfat-v33`:

```js
const CACHE_NAME = 'unfat-v33';
```

Verify with:
```bash
grep -n "CACHE_NAME" src/sw.js
```
Expected: one line with `unfat-v33`.

- [ ] **Step 3: Append CHANGELOG entry**

Open `docs/general/CHANGELOG.md`. Find the existing `## 2026-05-04` block at the top. Insert a new bullet at the top of that block (after the heading, before the existing K-bullet):

```markdown
- Sub-project L: favorieten — handmatig pinnen van producten en gerechten via een ster-toggle. Vierde filter-knop `★` op de toevoegen-pagina toont alleen gepinde items, alfabetisch gesorteerd. Ster zit op drie plekken: in elke lijst-rij (rechts naast `›`, tap = toggle zonder navigeren), in de header van het portion-screen (`#/add/portion`), en in de header van dish-builder edit-mode (`#/dish/edit`)
- Datamodel: tabellen `product_favorites` en `dish_favorites` met composite PK `(user_id, item_id)` + cascade delete + per-user RLS. Twee aparte tabellen i.p.v. polymorfe relatie zodat foreign keys de integriteit afdwingen
- "Vaak gegeten" auto-mechanisme bewust uitgesteld: handmatige favorieten dekken het hoofdpijnpunt (1×-per-maand items zoals een eiwitshake na een duurloop); auto-frequentie kan later toegevoegd als blijkt dat dit echt mist
- Migration: `<timestamp>_favorites.sql`. SW cache v32 → v33
```

(Replace `<timestamp>` with the actual timestamp from Task 1.)

- [ ] **Step 4: Move L. Favorieten in ROADMAP**

Open `docs/general/ROADMAP.md`. Find the `### L. Favorieten + "Vaak gegeten"` section (open items area). Delete the entire `### L. Favorieten + "Vaak gegeten"` heading and its body (the section explaining open questions).

Then find the `## Afgerond ✅` table near the bottom. Insert a new row at the **top of the data rows** (after the header row, before `2026-05-04 | K. Gerechten | ...`):

```markdown
| 2026-05-04 | L. Favorieten | Handmatig pinnen van producten en gerechten via ster-toggle. Vierde filter-knop `★` op de toevoegen-pagina; ster ook in portion-screen + dish-builder edit-mode. Twee aparte tabellen `product_favorites` + `dish_favorites` met composite PK + cascade FK + RLS. Auto "Vaak gegeten" bewust uitgesteld |
```

- [ ] **Step 5: Final end-to-end smoke check**

Open `src/index.html` with Live Server. Run through the full feature once more:

1. Tap "Voeg eten toe" → see four filter buttons.
2. Default = `Alles`. Recents shows with `☆` next to each row.
3. Tap a `☆` in Recents → flips to `★`, row does not navigate.
4. Type a search query → results show with `☆`/`★` per row.
5. Switch to `★` filter:
   - With no favs: empty state text shown.
   - With favs: alphabetical merged list, NEVO chip disabled.
6. Tap a row in `★` filter → navigates correctly.
7. Tap `★` of a starred row in `★` filter → unstars + disappears from list.
8. Open a product (Voeg eten toe → tap product) → ster-button in header next to potlood (or alone for non-editors). Toggle works.
9. Open a gerecht for edit (`#/dish/edit?dish=…`) → ster in header. Toggle works.
10. Open `#/dish/new` → no ster in header (only back-button and title).
11. Hard-reload browser → all state persists from DB.
12. DevTools → Application → Cache Storage: should show `unfat-v33` after the SW update.

If any step fails, fix before committing.

- [ ] **Step 6: Commit**

```bash
git add src/sw.js docs/general/CHANGELOG.md docs/general/ROADMAP.md
git commit -m "Bump SW cache + update CHANGELOG/ROADMAP for L. Favorieten"
```

- [ ] **Step 7: Push**

```bash
git push
```

After GitHub Pages deploys (~1 min), open the live URL on the user's phone and verify the upgrade-toast shows "Nieuwe versie beschikbaar" → tap "Vernieuwen" → app reloads with v33 active. If the toast doesn't appear, check `Service Workers` in DevTools and force-update.

---

## Self-review

**Spec coverage:**
- Datamodel (twee tabellen + RLS) → Task 1 ✓
- DB-laag (`getMyFavorites`, `toggleX`) → Task 2 ✓
- Vierde filter-knop → Task 4 ✓
- Cold-start fetch → Task 4 ✓
- Ster in lijst-rijen → Task 5 ✓
- Favorieten-buildList + sortering → Task 6 ✓
- Empty state → Task 6 ✓
- NEVO-chip disable in favorites → Task 4 ✓
- Ster in portion-screen → Task 7 ✓
- Ster in dish-builder edit-mode → Task 8 ✓
- CSS → Task 3 ✓
- SW cache bump → Task 9 ✓
- CHANGELOG/ROADMAP → Task 9 ✓
- Race-condition handling → Task 2 (23505 ignore) ✓
- Cascade delete → Task 1 (`on delete cascade` in FK) ✓

No spec gaps.

**Placeholders:** No `<timestamp>` placeholders in code — all are real `date -u` invocations or markdown context. The `<timestamp>` in the CHANGELOG entry text is documented as "replace with actual timestamp from Task 1."

**Type consistency:** `getMyFavorites()` returns `{ productIds: Set, dishIds: Set }` everywhere. `toggleProductFavorite(id, on)` and `toggleDishFavorite(id, on)` have the same `(id, on)` signature in DB helper, in add-food, in portion-screen, in dish-builder.

**Migration filename note:** Task 1 step 1 generates the timestamp; subsequent steps use the same path. The CHANGELOG entry refers to `<timestamp>_favorites.sql` literally — this is OK because the migration filename is a runtime detail rotting with each developer-machine; CHANGELOG could substitute the real one but it's not load-bearing.

# K — Gerechten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Producten bundelen tot gerechten (gedeelde recepten) die bij loggen expanderen naar N entries; één unified zoekpagina met segmented filter Alles/Producten/Gerechten + bestaande NEVO-chip; loggen via portie-multiplier (½/1/1½/2) en per-ingrediënt-checkboxes.

**Architecture:** Twee nieuwe Postgres-tabellen (`dishes`, `dish_components`) met dezelfde gedeelde-RLS-pattern als `products` + light edit-trail via twee triggers. `entries.dish_id` (nullable, on delete set null) markeert welke entries uit een gerecht-log kwamen, voor recents en toekomstige groepering. Frontend krijgt drie nieuwe views (`dish-builder`, `dish-log`, `dish-component-sheet`) en `add-food.js` wordt uitgebreid met segmented filter + gemengde resultaten. Hergebruik van zoek-scoring via een geëxtraheerde utility (`utils/product-search.js`).

**Tech Stack:** Vanilla HTML/CSS/JS PWA, Supabase (Postgres + RLS + triggers), GitHub Pages, Service Worker.

**Testing:** Codebase heeft geen geautomatiseerde tests (zie CLAUDE.md). Verificatie per task via handmatige browser-tests in Live Server (port 5500) en `supabase db push` voor de migration. Eind-test loopt door drie scenario's: aanmaken, loggen, bewerken — als gewone user en als editor.

---

## File Structure

**Created:**
- `supabase/migrations/20260504110039_dishes.sql` — dishes + dish_components + entries.dish_id + RLS + triggers
- `src/js/db/dishes.js` — CRUD voor dishes en dish_components
- `src/js/utils/product-search.js` — extracted scoring helpers (DRY)
- `src/js/views/components/dish-component-sheet.js` — bottom sheet voor 1 ingrediënt (zoek + portie)
- `src/js/views/dish-builder.js` — aanmaken + bewerken + verwijderen
- `src/js/views/dish-log.js` — loggen-flow met portie × checkboxes

**Modified:**
- `src/js/db/entries.js` — `bulkCreateEntries` toevoegen; `createEntry` accepteert optionele `dish_id`; `listRecentProductsForUser` → `listRecentItemsForUser` (mengt products + dishes)
- `src/js/views/add-food.js` — segmented filter Alles/Producten/Gerechten, gemixte resultaten met GERECHT-badge, tweede dashed-knop, NEVO-chip-disable bij filter Gerechten
- `src/js/views/add-food-portion.js` — geen wijziging nodig (recent-row-tap gaat al via params)
- `src/js/app.js` — routes registreren (`#/dish/new`, `#/dish/edit`, `#/dish/log`) + KNOWN_ROUTES uitbreiden
- `src/sw.js` — `CACHE_NAME` bump `unfat-v31` → `unfat-v32` + nieuwe assets in `STATIC_ASSETS`
- `src/css/style.css` — `.badge-dish`, `.dish-portion-segmented`, `.filter-segmented` (of hergebruik bestaande `.segmented`)
- `docs/general/CHANGELOG.md` — entry voor 2026-05-04
- `docs/general/ROADMAP.md` — K naar `## Afgerond ✅`

---

## Task 1: Migration — schema, RLS, triggers

**Files:**
- Create: `supabase/migrations/20260504110039_dishes.sql`

- [ ] **Step 1: Schrijf migration**

```sql
-- Migration: dishes (shared recipe templates) + dish_components (ingredients)
-- + entries.dish_id (link to source dish, nullable on delete set null).
-- RLS mirrors products: shared select, owner+editor+admin can update,
-- only owner can delete. Light edit trail via two triggers.

-- =========================================================================
-- 1. dishes
-- =========================================================================
create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_meal_type meal_type,
  created_by uuid not null references auth.users(id) on delete cascade,
  last_edited_by uuid references auth.users(id) on delete set null,
  last_edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index dishes_name_idx on public.dishes (lower(name));

alter table public.dishes enable row level security;

create policy "dishes_select_all_authenticated"
  on public.dishes for select
  to authenticated
  using (true);

create policy "dishes_insert_own"
  on public.dishes for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "dishes_update_own"
  on public.dishes for update
  to authenticated
  using (created_by = auth.uid());

create policy "dishes_update_by_editor"
  on public.dishes for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('editor','admin')
    )
  );

create policy "dishes_delete_own"
  on public.dishes for delete
  to authenticated
  using (created_by = auth.uid());

-- Edit trail: server-side, same pattern as products_set_edit_trail.
create or replace function public.dishes_set_edit_trail()
returns trigger
language plpgsql
as $$
begin
  new.last_edited_by = auth.uid();
  new.last_edited_at = now();
  return new;
end;
$$;

create trigger dishes_set_edit_trail
  before update on public.dishes
  for each row
  execute function public.dishes_set_edit_trail();

-- =========================================================================
-- 2. dish_components
-- =========================================================================
create table public.dish_components (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references public.dishes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  amount_grams numeric(10,2) not null check (amount_grams > 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index dish_components_dish_id_idx on public.dish_components (dish_id);

alter table public.dish_components enable row level security;

create policy "dish_components_select_all_authenticated"
  on public.dish_components for select
  to authenticated
  using (true);

-- Insert/update/delete: only if the parent dish is editable for you.
create policy "dish_components_modify_if_dish_editable"
  on public.dish_components for all
  to authenticated
  using (
    exists (
      select 1 from public.dishes d
      where d.id = dish_components.dish_id
        and (
          d.created_by = auth.uid()
          or exists (
            select 1 from public.profiles
            where id = auth.uid() and role in ('editor','admin')
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.dishes d
      where d.id = dish_components.dish_id
        and (
          d.created_by = auth.uid()
          or exists (
            select 1 from public.profiles
            where id = auth.uid() and role in ('editor','admin')
          )
        )
    )
  );

-- Component-edits implicitly touch the dish edit trail.
create or replace function public.dishes_touch_on_component_change()
returns trigger
language plpgsql
as $$
declare
  target_dish_id uuid;
begin
  target_dish_id = coalesce(new.dish_id, old.dish_id);
  update public.dishes
    set last_edited_by = auth.uid(),
        last_edited_at = now()
    where id = target_dish_id;
  return null;
end;
$$;

create trigger dish_components_touch_dish
  after insert or update or delete on public.dish_components
  for each row
  execute function public.dishes_touch_on_component_change();

-- =========================================================================
-- 3. entries.dish_id (nullable link to source dish)
-- =========================================================================
alter table public.entries
  add column dish_id uuid references public.dishes(id) on delete set null;

-- Partial index for the recents-mix query (entries with a non-null dish_id).
create index entries_user_dish_idx
  on public.entries (user_id, dish_id)
  where dish_id is not null;
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push
```

Expected: success, twee tabellen + één extra kolom op entries verschijnen in Supabase Dashboard.

- [ ] **Step 3: Verify in dashboard**

Open `https://supabase.com/dashboard/project/zkdmijseblullnjdmgpc/database/tables` en check:
- `dishes` aanwezig (zes kolommen + RLS aan)
- `dish_components` aanwezig (zes kolommen + RLS aan)
- `entries` heeft een nieuwe kolom `dish_id` (uuid, nullable)
- Beide triggers (`dishes_set_edit_trail`, `dish_components_touch_dish`) zichtbaar onder Database → Triggers

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260504110039_dishes.sql
git commit -m "Add dishes + dish_components schema + entries.dish_id"
```

---

## Task 2: DB-laag — `src/js/db/dishes.js`

**Files:**
- Create: `src/js/db/dishes.js`

- [ ] **Step 1: Schrijf de module**

```javascript
import { supabase } from '../supabase.js';

const DISH_FIELDS = 'id, name, default_meal_type, created_by, last_edited_by, last_edited_at';

// List all dishes (shared, RLS allows all authenticated to select).
// Returns dishes WITHOUT components — fetch components separately for one dish.
export async function listDishes() {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('dishes')
      .select(DISH_FIELDS)
      .order('name', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Read a single dish with its components (joined product fields), ordered by position.
export async function getDish(id) {
  const { data, error } = await supabase
    .from('dishes')
    .select(`
      ${DISH_FIELDS},
      components:dish_components (
        id, product_id, amount_grams, position,
        products (id, name, kcal_per_100g, unit_grams, source, synonyms)
      )
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  // Supabase returns embedded relation unsorted; sort client-side.
  if (data?.components) {
    data.components.sort((a, b) => a.position - b.position);
  }
  return data;
}

// Create a dish + its components. Two round-trips (no transactions in PostgREST
// from the client). On component-insert failure we rollback by deleting the dish.
// components: [{ product_id, amount_grams, position }, ...]
export async function createDish({ name, default_meal_type, components }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data: dish, error: dishErr } = await supabase
    .from('dishes')
    .insert({
      name,
      default_meal_type: default_meal_type || null,
      created_by: session.user.id,
    })
    .select(DISH_FIELDS)
    .single();
  if (dishErr) throw dishErr;

  if (components && components.length > 0) {
    const rows = components.map((c, i) => ({
      dish_id: dish.id,
      product_id: c.product_id,
      amount_grams: c.amount_grams,
      position: c.position ?? i,
    }));
    const { error: compErr } = await supabase.from('dish_components').insert(rows);
    if (compErr) {
      await supabase.from('dishes').delete().eq('id', dish.id);
      throw compErr;
    }
  }
  return dish;
}

// Update dish meta (name, default_meal_type) and replace components.
// Components are replaced wholesale (delete-all-then-insert) — simpler than diffing.
// The dish_components_touch_dish trigger keeps last_edited_at fresh.
export async function updateDish(id, { name, default_meal_type, components }) {
  const { data: dish, error: dishErr } = await supabase
    .from('dishes')
    .update({ name, default_meal_type: default_meal_type || null })
    .eq('id', id)
    .select(DISH_FIELDS)
    .single();
  if (dishErr) throw dishErr;

  const { error: delErr } = await supabase.from('dish_components').delete().eq('dish_id', id);
  if (delErr) throw delErr;

  if (components && components.length > 0) {
    const rows = components.map((c, i) => ({
      dish_id: id,
      product_id: c.product_id,
      amount_grams: c.amount_grams,
      position: c.position ?? i,
    }));
    const { error: insErr } = await supabase.from('dish_components').insert(rows);
    if (insErr) throw insErr;
  }
  return dish;
}

// Delete a dish (cascade removes components; entries.dish_id becomes null).
export async function deleteDish(id) {
  const { error } = await supabase.from('dishes').delete().eq('id', id);
  if (error) throw error;
}

// Lookup dishes by id-array (used by the add-food recents query).
export async function getDishesByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const { data, error } = await supabase
    .from('dishes')
    .select(DISH_FIELDS)
    .in('id', ids);
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Sanity-check via console**

Start Live Server, log in als gewone user, open DevTools → Console:
```js
const m = await import('./js/db/dishes.js');
await m.listDishes();   // [] (empty)
```
Expected: lege array zonder error.

- [ ] **Step 3: Commit**

```bash
git add src/js/db/dishes.js
git commit -m "Add dishes db layer (CRUD + components embed)"
```

---

## Task 3: DB-laag — `entries.js` uitbreiden

**Files:**
- Modify: `src/js/db/entries.js`

- [ ] **Step 1: `createEntry` accepteert optionele `dish_id`**

Vervang in `createEntry`:

```javascript
export async function createEntry({ product_id, amount_grams, kcal, meal_type, date, dish_id }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: session.user.id,
      product_id,
      amount_grams,
      kcal,
      meal_type,
      date: date || new Date().toISOString().slice(0, 10),
      dish_id: dish_id || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Voeg `bulkCreateEntries` toe**

Onderaan het bestand:

```javascript
// Insert multiple entries in one round-trip. Used by dish-log to expand
// a dish into N entries. RLS still applies per row.
// rows: [{ product_id, amount_grams, kcal, meal_type, date, dish_id }, ...]
export async function bulkCreateEntries(rows) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const enriched = rows.map(r => ({
    user_id: session.user.id,
    product_id: r.product_id,
    amount_grams: r.amount_grams,
    kcal: r.kcal,
    meal_type: r.meal_type,
    date: r.date || new Date().toISOString().slice(0, 10),
    dish_id: r.dish_id || null,
  }));

  const { data, error } = await supabase
    .from('entries')
    .insert(enriched)
    .select();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 3: Vervang `listRecentProductsForUser` door `listRecentItemsForUser`**

Verwijder de bestaande `listRecentProductsForUser` aan het einde van het bestand. Voeg toe:

```javascript
// Returns up to `limit` distinct items (products + dishes) the current user
// recently logged, ordered by most recent. A 'recent item' is keyed on
// dish_id when present (one row per dish-log), else on product_id.
//
// Returns rows of the form:
//   { kind: 'dish',    dish:    { id, name, default_meal_type } }
// | { kind: 'product', product: { id, name, kcal_per_100g, unit_grams, source, synonyms, nevo_code } }
//
// The add-food page can render both shapes uniformly (badge differs).
export async function listRecentItemsForUser(limit = 20) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  // Pull a generous slice so dedup by (dish_id || product_id) yields enough.
  const { data, error } = await supabase
    .from('entries')
    .select(`
      product_id,
      dish_id,
      created_at,
      products (id, name, kcal_per_100g, unit_grams, source, synonyms, nevo_code),
      dishes (id, name, default_meal_type)
    `)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(150);
  if (error) throw error;

  const seen = new Set();
  const result = [];
  for (const row of data) {
    const key = row.dish_id ? `d:${row.dish_id}` : `p:${row.product_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (row.dish_id && row.dishes) {
      result.push({ kind: 'dish', dish: row.dishes });
    } else if (!row.dish_id && row.products) {
      result.push({ kind: 'product', product: row.products });
    }
    if (result.length >= limit) break;
  }
  return result;
}
```

- [ ] **Step 4: Test in console**

```js
const m = await import('./js/db/entries.js');
await m.listRecentItemsForUser();   // array of {kind, product?|dish?}
```

Expected: same shape als `listRecentProductsForUser`-output, maar nu wrapped (`{ kind: 'product', product: {...} }`) en hopelijk lege `dish`-rows komen pas na taak 7.

- [ ] **Step 5: Commit**

```bash
git add src/js/db/entries.js
git commit -m "Mix dishes into recents, add bulkCreateEntries + dish_id support"
```

---

## Task 4: Refactor — extract product-search utility

Hergebruik van `normalize`/`scoreQuery`/`scoreToken` is straks nodig in `dish-component-sheet.js` en mogelijk `dish-builder.js`. Liever extracten dan dupliceren.

**Files:**
- Create: `src/js/utils/product-search.js`
- Modify: `src/js/views/add-food.js`

- [ ] **Step 1: Schrijf de utility**

Maak `src/js/utils/product-search.js`:

```javascript
// Tokenized product search. Used by the add-food page and the dish-component
// picker so scoring is consistent across the app.

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Higher score = better match. 0 = no match.
// Multi-token query: AND-match (every token must hit), total = sum of per-token scores.
export function scoreProductQuery(product, q) {
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const token of tokens) {
    const s = scoreToken(product, token);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

// Per-token scoring. Name beats synonym; word-boundary beats substring;
// prefix-at-word-end beats prefix-into-letter ("Appel m schil" > "Appelcarre").
function scoreToken(product, q) {
  const wordRe = new RegExp(`\\b${escapeRegex(q)}`);
  const name = normalize(product.name);
  if (name === q) return 1000;
  if (name.startsWith(q)) {
    return /\w/.test(name.charAt(q.length)) ? 750 : 850;
  }
  if (wordRe.test(name)) return 600;
  let best = name.includes(q) ? 200 : 0;
  if (Array.isArray(product.synonyms)) {
    for (const syn of product.synonyms) {
      const s = normalize(syn);
      if (s === q) best = Math.max(best, 500);
      else if (s.startsWith(q)) {
        best = Math.max(best, /\w/.test(s.charAt(q.length)) ? 375 : 425);
      }
      else if (wordRe.test(s)) best = Math.max(best, 300);
      else if (s.includes(q))  best = Math.max(best, 100);
    }
  }
  return best;
}

// Sort + cap helper used by both consumers.
// Returns top N products, scored & ranked, given a normalized query string.
export function rankProducts(products, normalizedQuery, limit = 50) {
  return products
    .map(p => ({ p, score: scoreProductQuery(p, normalizedQuery) }))
    .filter(x => x.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      a.p.name.length - b.p.name.length ||
      a.p.name.localeCompare(b.p.name, 'nl'))
    .slice(0, limit)
    .map(x => x.p);
}
```

- [ ] **Step 2: Pas `add-food.js` aan om de utility te gebruiken**

Verwijder uit `src/js/views/add-food.js` de lokale functies `normalize`, `escapeRegex`, `scoreQuery`, `scoreToken`. Voeg bovenaan de import toe:

```javascript
import { normalize, rankProducts } from '../utils/product-search.js';
```

Vervang in `renderResults` het scoring-blok:

```javascript
    const scored = rankProducts(visibleProducts, q, TOP_N_SEARCH);
    if (scored.length === 0) {
      resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Geen producten gevonden. Maak een nieuw product aan ↓</p>`;
      return;
    }
    renderList(resultsEl, scored, null, null);
```

- [ ] **Step 3: Verifieer in browser**

Open `#/add` in Live Server. Zoek `appel`, `brood`, `appel schil`. Expected: zelfde resultaten als vóór de refactor (multi-token werkt nog steeds, ranking ongewijzigd). Edge case: lege query toont recents.

- [ ] **Step 4: Commit**

```bash
git add src/js/utils/product-search.js src/js/views/add-food.js
git commit -m "Extract product-search utility for reuse"
```

---

## Task 5: CSS — badge-dish, dish-portion-segmented, filter-segmented

**Files:**
- Modify: `src/css/style.css`

- [ ] **Step 1: Voeg styles toe**

Onderaan `src/css/style.css`:

```css
/* GERECHT badge in product+dish rows on the add-food page. */
.badge-dish {
  font-size: 10px;
  background: rgba(0, 230, 118, 0.18);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 6px;
  vertical-align: 1px;
  letter-spacing: 0.3px;
}

/* Filter segmented control (Alles | Producten | Gerechten) on add-food.
   Variant of .segmented with smaller padding so it fits next to the NEVO chip. */
.filter-segmented {
  display: inline-flex;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  padding: 2px;
  gap: 0;
}
.filter-segmented button {
  background: transparent;
  border: none;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 999px;
  font-family: inherit;
}
.filter-segmented button.active {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}

/* Portion multiplier picker on dish-log (½ | 1 | 1½ | 2). Reuses .segmented. */
.dish-portion-segmented {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-input);
  padding: 3px;
  margin-bottom: var(--space-3);
}
.dish-portion-segmented button {
  flex: 1;
  background: transparent;
  border: none;
  padding: 8px;
  font-weight: 600;
  border-radius: 8px;
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
}
.dish-portion-segmented button.active {
  background: var(--accent);
  color: var(--accent-text);
}

/* Ingredient row in dish-builder + dish-log (with checkbox at the right side). */
.dish-component-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 4px;
  cursor: pointer;
  font-family: inherit;
  width: 100%;
  text-align: left;
  color: var(--text);
}
.dish-component-row .name { flex: 1; }
.dish-component-row .portion {
  font-size: 11px;
  background: var(--bg);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-muted);
}
.dish-component-row .kcal { font-size: 11px; color: var(--text-muted); }
.dish-component-row.disabled .name { text-decoration: line-through; opacity: 0.5; }
.dish-component-row.disabled .portion,
.dish-component-row.disabled .kcal { opacity: 0.5; }

/* Disabled NEVO-chip when filter=Gerechten. */
.chip[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Sanity-test**

Open Live Server. Pagina mag niet stuk zijn (geen visuele regressies op `#/`, `#/add`). De nieuwe classes worden pas zichtbaar in latere tasks; hier alleen checken dat CSS valide is (geen rode errors in DevTools → Console).

- [ ] **Step 3: Commit**

```bash
git add src/css/style.css
git commit -m "Add CSS for dish UI: badge, filter-segmented, portion-segmented, component rows"
```

---

## Task 6: View — `dish-component-sheet.js`

Eén bottom sheet met twee fasen: **fase 1** = product zoeken, **fase 2** = portie kiezen (gram/stuks toggle, zoals add-food-portion). `onSave` ontvangt `{ product, amount_grams }`.

**Files:**
- Create: `src/js/views/components/dish-component-sheet.js`

- [ ] **Step 1: Schrijf de component**

```javascript
import { listProducts } from '../../db/products.js';
import { getMyProfile, updateMyHideNevo } from '../../db/profiles.js';
import { showToast } from '../../ui.js';
import { escapeHtml } from '../../utils/html.js';
import { normalize, rankProducts } from '../../utils/product-search.js';

const TOP_N_SEARCH = 50;

// Open a sheet to pick (or re-edit) a single dish ingredient.
// Modes:
//   - { initial: undefined }       → search → portion → onSave({ product, amount_grams })
//   - { initial: { product, amount_grams } } → start in portion phase, show "Verwijderen"
// onSave: ({ product, amount_grams }) => void   — caller stores in dish state
// onDelete (optional): () => void               — only for re-edit mode
export function openDishComponentSheet({ initial } = {}, onSave, onDelete) {
  if (document.querySelector('.sheet-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  let allProducts = [];
  let hideNevo = false;
  let selectedProduct = initial?.product || null;
  let initialAmount = initial?.amount_grams;

  if (selectedProduct) {
    renderPortion();
  } else {
    renderSearch();
  }

  // -------------------------------------------------------------------------
  // Phase 1: search
  // -------------------------------------------------------------------------
  function renderSearch() {
    overlay.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Ingrediënt kiezen">
        <div class="sheet-handle"></div>
        <div class="sheet-title">Ingrediënt kiezen</div>

        <input class="input" id="dcs-search" type="search" placeholder="Zoek product..." autocomplete="off">

        <div class="chiprow">
          <button class="chip" id="dcs-nevo" type="button" aria-pressed="false">NEVO producten verbergen</button>
        </div>

        <div id="dcs-results" style="margin-top:8px;max-height:50vh;overflow-y:auto;">
          <p class="text-muted" style="padding:8px 0;">Laden...</p>
        </div>
      </div>
    `;

    bootstrapSearch();
  }

  async function bootstrapSearch() {
    try {
      const [products, profile] = await Promise.all([listProducts(), getMyProfile()]);
      allProducts = products;
      hideNevo = !!(profile && profile.hide_nevo);
    } catch (err) {
      overlay.querySelector('#dcs-results').innerHTML =
        `<p class="error">Kon producten niet laden: ${escapeHtml(err.message)}</p>`;
      return;
    }

    const search = overlay.querySelector('#dcs-search');
    const resultsEl = overlay.querySelector('#dcs-results');
    const chipEl = overlay.querySelector('#dcs-nevo');

    function syncChip() {
      chipEl.setAttribute('aria-pressed', String(hideNevo));
      chipEl.textContent = hideNevo ? 'NEVO producten tonen' : 'NEVO producten verbergen';
    }
    syncChip();

    chipEl.addEventListener('click', async () => {
      const previous = hideNevo;
      hideNevo = !hideNevo;
      chipEl.disabled = true;
      syncChip();
      renderResults(search.value);
      try {
        await updateMyHideNevo(hideNevo);
      } catch {
        hideNevo = previous;
        syncChip();
        renderResults(search.value);
        showToast('Kon voorkeur niet opslaan');
      } finally {
        chipEl.disabled = false;
      }
    });

    function renderResults(query) {
      const q = normalize(query.trim());
      const visible = hideNevo ? allProducts.filter(p => p.source !== 'nevo') : allProducts;
      let list;
      if (!q) {
        list = visible.slice(0, TOP_N_SEARCH);
      } else {
        list = rankProducts(visible, q, TOP_N_SEARCH);
        if (list.length === 0) {
          resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Geen producten gevonden</p>`;
          return;
        }
      }
      resultsEl.innerHTML = `<ul class="list">${list.map(p => `
        <li class="meal-row" data-id="${p.id}">
          <div>
            <div>${escapeHtml(p.name)}${p.source === 'nevo' ? '<span class="badge-nevo">NEVO</span>' : ''}</div>
            <div class="items">${p.kcal_per_100g} kcal/100g${p.unit_grams ? ` · ${p.unit_grams}g/stuk` : ''}</div>
          </div>
          <span>›</span>
        </li>
      `).join('')}</ul>`;
    }

    search.addEventListener('input', () => renderResults(search.value));
    renderResults('');

    resultsEl.addEventListener('click', (e) => {
      const row = e.target.closest('.meal-row');
      if (!row) return;
      const id = row.getAttribute('data-id');
      selectedProduct = allProducts.find(p => p.id === id) || null;
      if (selectedProduct) renderPortion();
    });
  }

  // -------------------------------------------------------------------------
  // Phase 2: portion
  // -------------------------------------------------------------------------
  function renderPortion() {
    const p = selectedProduct;
    const supportsUnits = !!p.unit_grams;
    let inputType = 'grams';
    let inputValue = supportsUnits ? 1 : 100;

    if (initialAmount != null) {
      // Re-edit: prefer 'units' if amount_grams is exact multiple of unit_grams.
      if (supportsUnits && initialAmount % p.unit_grams === 0) {
        inputType = 'units';
        inputValue = initialAmount / p.unit_grams;
      } else {
        inputType = 'grams';
        inputValue = initialAmount;
      }
    }

    overlay.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Portie">
        <div class="sheet-handle"></div>
        <div class="sheet-title">${escapeHtml(p.name)}</div>
        <div class="sheet-subtitle">${p.kcal_per_100g} kcal/100g${p.unit_grams ? ` · ${p.unit_grams}g/stuk` : ''}</div>

        <div class="segmented" id="dcs-type" ${supportsUnits ? '' : 'hidden'}>
          <button data-type="grams" class="${inputType === 'grams' ? 'active' : ''}">Gram</button>
          <button data-type="units" class="${inputType === 'units' ? 'active' : ''}">Stuks</button>
        </div>

        <input class="input" id="dcs-amount" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]?" value="${inputValue}">
        <div class="preview" id="dcs-preview"></div>

        <div class="sheet-actions">
          <button class="btn" id="dcs-save">${initialAmount != null ? 'Bijwerken' : 'Voeg toe'}</button>
          ${initialAmount != null ? '<button class="btn-icon-danger" id="dcs-delete" aria-label="Verwijderen">🗑</button>' : ''}
        </div>
        <p class="error" id="dcs-error" hidden></p>
      </div>
    `;

    function updatePreview() {
      const grams = inputType === 'units' ? inputValue * p.unit_grams : inputValue;
      const kcal = Math.round(grams * p.kcal_per_100g / 100);
      const unitLabel = inputType === 'units' ? (inputValue === 1 ? 'stuk' : 'stuks') : 'gram';
      overlay.querySelector('#dcs-preview').textContent = `= ${kcal} kcal (${inputValue} ${unitLabel})`;
    }
    updatePreview();

    overlay.querySelectorAll('#dcs-type button').forEach(btn => {
      btn.addEventListener('click', () => {
        inputType = btn.getAttribute('data-type');
        overlay.querySelectorAll('#dcs-type button').forEach(b =>
          b.classList.toggle('active', b === btn));
        const amt = overlay.querySelector('#dcs-amount');
        amt.value = inputType === 'units' ? 1 : 100;
        inputValue = parseFloat(amt.value);
        updatePreview();
      });
    });

    overlay.querySelector('#dcs-amount').addEventListener('input', (e) => {
      inputValue = parseFloat(e.target.value.replace(',', '.')) || 0;
      updatePreview();
    });

    overlay.querySelector('#dcs-save').addEventListener('click', () => {
      const errEl = overlay.querySelector('#dcs-error');
      errEl.hidden = true;
      if (inputValue <= 0) {
        errEl.textContent = 'Hoeveelheid moet groter dan 0 zijn.';
        errEl.hidden = false;
        return;
      }
      const amount_grams = inputType === 'units' ? inputValue * p.unit_grams : inputValue;
      close();
      onSave({ product: p, amount_grams });
    });

    if (initialAmount != null && onDelete) {
      overlay.querySelector('#dcs-delete').addEventListener('click', () => {
        close();
        onDelete();
      });
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/js/views/components/dish-component-sheet.js
git commit -m "Add dish-component-sheet (search + portion picker)"
```

---

## Task 7: View — `dish-builder.js` (aanmaken + bewerken + verwijderen)

**Files:**
- Create: `src/js/views/dish-builder.js`

- [ ] **Step 1: Schrijf de view**

```javascript
import { createDish, updateDish, getDish, deleteDish } from '../db/dishes.js';
import { getMyProfile } from '../db/profiles.js';
import { openDishComponentSheet } from './components/dish-component-sheet.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import { escapeHtml } from '../utils/html.js';

const MEAL_BUTTONS = [
  { key: '',          label: 'Geen' },
  { key: 'breakfast', label: '🌅' },
  { key: 'lunch',     label: '🥗' },
  { key: 'dinner',    label: '🍽' },
  { key: 'snack',     label: '🍪' },
];

// Mode is determined by params.dish (edit) vs absent (new).
// State held in-memory until "Opslaan":
//   name: string
//   defaultMeal: '' | meal_type
//   components: [{ product: {id,name,kcal_per_100g,unit_grams,...}, amount_grams }]
export async function render(container, params) {
  const dishId = params.dish || null;
  const isEdit = !!dishId;

  // Load existing dish (edit) + profile (for editor/admin check)
  let initialName = '';
  let initialMeal = '';
  let initialComponents = [];
  let canEdit = true;
  let canDelete = true;

  try {
    const profile = await getMyProfile();
    if (isEdit) {
      const dish = await getDish(dishId);
      initialName = dish.name;
      initialMeal = dish.default_meal_type || '';
      initialComponents = (dish.components || []).map(c => ({
        product: c.products,
        amount_grams: Number(c.amount_grams),
      }));
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

  let state = {
    name: initialName,
    defaultMeal: initialMeal,
    components: initialComponents.slice(),
  };

  function totalKcal() {
    return state.components.reduce((sum, c) => {
      const kcal = Math.round(c.amount_grams * c.product.kcal_per_100g / 100);
      return sum + kcal;
    }, 0);
  }

  function formatPortion(c) {
    const u = c.product.unit_grams;
    if (u && c.amount_grams % u === 0) {
      const n = c.amount_grams / u;
      return `${n} ${n === 1 ? 'stuk' : 'stuks'} (${c.amount_grams}g)`;
    }
    return `${c.amount_grams}g`;
  }

  function renderAll() {
    const valid = state.name.trim().length > 0 && state.components.length > 0;

    container.innerHTML = `
      <div class="view-header">
        <button class="btn-back" id="back-btn">←</button>
        <div>
          <h1>${isEdit ? 'Gerecht bewerken' : 'Nieuw gerecht'}</h1>
          <small>Bundel producten tot één gerecht</small>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="db-name">Naam</label>
        <input class="input" id="db-name" type="text" required maxlength="120" value="${escapeHtml(state.name)}" placeholder="bv. Spaghetti bolognese">
      </div>

      <div class="field">
        <label class="field-label">Voorgestelde maaltijd</label>
        <div class="meal-grid" id="db-meal" style="grid-template-columns:repeat(5,1fr);">
          ${MEAL_BUTTONS.map(m => `
            <button data-meal="${m.key}" class="${m.key === state.defaultMeal ? 'active' : ''}">${m.label}</button>
          `).join('')}
        </div>
      </div>

      <span class="field-label">Ingrediënten (${state.components.length})</span>
      <div id="db-components">
        ${state.components.map((c, i) => `
          <button class="dish-component-row" type="button" data-index="${i}">
            <span class="name">${escapeHtml(c.product.name)}</span>
            <span class="portion">${formatPortion(c)}</span>
            <span class="kcal">${Math.round(c.amount_grams * c.product.kcal_per_100g / 100)} kcal</span>
          </button>
        `).join('')}
      </div>
      <button class="btn-secondary btn" id="db-add" style="margin-top:8px;background:rgba(0,230,118,0.12);border:1px dashed var(--accent);color:var(--accent);">
        + Ingrediënt toevoegen
      </button>

      <p style="text-align:center;color:var(--text-muted);margin:14px 0 4px;">Totaal: <strong>${totalKcal()}</strong> kcal</p>

      <button class="btn" id="db-save" ${valid ? '' : 'disabled'}>${isEdit ? 'Opslaan' : 'Aanmaken'}</button>
      ${isEdit && canDelete ? '<button class="btn-secondary btn" id="db-delete" style="margin-top:8px;color:var(--danger);border-color:var(--danger);">Verwijderen</button>' : ''}
      <p class="error" id="db-error" hidden></p>
    `;

    bindEvents();
  }

  function bindEvents() {
    container.querySelector('#back-btn').addEventListener('click', () => navigate('#/add'));

    container.querySelector('#db-name').addEventListener('input', (e) => {
      state.name = e.target.value;
      const saveBtn = container.querySelector('#db-save');
      const valid = state.name.trim().length > 0 && state.components.length > 0;
      saveBtn.disabled = !valid;
    });

    container.querySelectorAll('#db-meal button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.defaultMeal = btn.getAttribute('data-meal');
        container.querySelectorAll('#db-meal button').forEach(b =>
          b.classList.toggle('active', b === btn));
      });
    });

    container.querySelector('#db-add').addEventListener('click', () => {
      openDishComponentSheet({}, ({ product, amount_grams }) => {
        state.components.push({ product, amount_grams });
        renderAll();
      });
    });

    container.querySelectorAll('.dish-component-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.getAttribute('data-index'), 10);
        const c = state.components[idx];
        openDishComponentSheet(
          { initial: { product: c.product, amount_grams: c.amount_grams } },
          ({ product, amount_grams }) => {
            state.components[idx] = { product, amount_grams };
            renderAll();
          },
          () => {
            state.components.splice(idx, 1);
            renderAll();
          }
        );
      });
    });

    container.querySelector('#db-save').addEventListener('click', async () => {
      const errEl = container.querySelector('#db-error');
      errEl.hidden = true;
      const saveBtn = container.querySelector('#db-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Bezig...';

      const payload = {
        name: state.name.trim(),
        default_meal_type: state.defaultMeal || null,
        components: state.components.map((c, i) => ({
          product_id: c.product.id,
          amount_grams: c.amount_grams,
          position: i,
        })),
      };

      try {
        if (isEdit) {
          await updateDish(dishId, payload);
          showToast('Gerecht bijgewerkt');
        } else {
          await createDish(payload);
          showToast('Gerecht aangemaakt');
        }
        navigate('#/add');
      } catch (err) {
        errEl.textContent = 'Kon niet opslaan: ' + err.message;
        errEl.hidden = false;
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Opslaan' : 'Aanmaken';
      }
    });

    if (isEdit && canDelete) {
      container.querySelector('#db-delete').addEventListener('click', async () => {
        if (!confirm(`Gerecht "${state.name}" verwijderen?`)) return;
        try {
          await deleteDish(dishId);
          showToast('Gerecht verwijderd');
          navigate('#/add');
        } catch (err) {
          const errEl = container.querySelector('#db-error');
          errEl.textContent = 'Kon niet verwijderen: ' + err.message;
          errEl.hidden = false;
        }
      });
    }
  }

  renderAll();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/js/views/dish-builder.js
git commit -m "Add dish-builder view (create + edit + delete)"
```

---

## Task 8: View — `dish-log.js` (loggen-flow)

**Files:**
- Create: `src/js/views/dish-log.js`

- [ ] **Step 1: Schrijf de view**

```javascript
import { getDish } from '../db/dishes.js';
import { bulkCreateEntries } from '../db/entries.js';
import { getMyProfile } from '../db/profiles.js';
import { todayIso } from '../calc.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import { escapeHtml } from '../utils/html.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MULTIPLIERS = [
  { value: 0.5, label: '½×' },
  { value: 1.0, label: '1×' },
  { value: 1.5, label: '1½×' },
  { value: 2.0, label: '2×' },
];

function guessMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

function formatPortion(amountG, product) {
  const u = product.unit_grams;
  // Display whole/half stuks naturally; otherwise grams.
  if (u && Math.abs((amountG / u) - Math.round(amountG / u * 2) / 2) < 1e-6) {
    const n = +(amountG / u).toFixed(1);
    return `${n} ${n === 1 ? 'stuk' : 'stuks'}`;
  }
  return `${Math.round(amountG)}g`;
}

export async function render(container, params) {
  const dishId = params.dish;
  const dateParam = params.date || todayIso();
  const isToday = dateParam === todayIso();

  if (!dishId) { navigate('#/add'); return; }

  let dish, profile;
  try {
    [dish, profile] = await Promise.all([getDish(dishId), getMyProfile()]);
  } catch (err) {
    container.innerHTML = `<p class="error" style="padding:16px;">Kon gerecht niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  const components = (dish.components || []);
  const isOwner = dish.created_by === profile.id;
  const isElevated = ['editor', 'admin'].includes(profile.role);
  const canEdit = isOwner || isElevated;

  let multiplier = 1.0;
  let selectedMeal = params.meal || dish.default_meal_type || guessMeal();
  // Initial: all components active.
  let active = components.map(() => true);

  function effectiveGrams(c) { return Number(c.amount_grams) * multiplier; }
  function compKcal(c) {
    return Math.round(effectiveGrams(c) * c.products.kcal_per_100g / 100);
  }
  function totalKcal() {
    return components.reduce((sum, c, i) => active[i] ? sum + compKcal(c) : sum, 0);
  }

  function renderAll() {
    const validCount = active.filter(Boolean).length;

    container.innerHTML = `
      <div class="view-header">
        <button class="btn-back" id="back-btn">←</button>
        <div>
          <h1>${escapeHtml(dish.name)}</h1>
          <small>Gerecht · ${components.length} ingrediënten</small>
        </div>
        ${canEdit ? '<button class="btn-icon" id="edit-btn" aria-label="Gerecht bewerken" style="margin-left:auto;">✏️</button>' : ''}
      </div>

      <div class="hero hero-green">
        <div class="hero-label">Totaal</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px;">${totalKcal()}<small style="font-size:14px;font-weight:600;opacity:0.8;"> kcal</small></div>
      </div>

      <span class="field-label">Porties</span>
      <div class="dish-portion-segmented" id="dl-mult">
        ${MULTIPLIERS.map(m => `
          <button data-mult="${m.value}" class="${m.value === multiplier ? 'active' : ''}">${m.label}</button>
        `).join('')}
      </div>

      <span class="field-label">Ingrediënten</span>
      <div id="dl-components">
        ${components.map((c, i) => `
          <button class="dish-component-row ${active[i] ? '' : 'disabled'}" type="button" data-index="${i}">
            <span style="width:18px;color:${active[i] ? 'var(--accent)' : 'var(--text-muted)'};">${active[i] ? '☑' : '☐'}</span>
            <span class="name">${escapeHtml(c.products.name)}</span>
            <span class="portion">${formatPortion(effectiveGrams(c), c.products)}</span>
            <span class="kcal">${compKcal(c)} kcal</span>
          </button>
        `).join('')}
      </div>

      <span class="field-label" style="margin-top:12px;">Maaltijd</span>
      <div class="meal-grid" id="dl-meal">
        ${MEAL_KEYS.map(k => `
          <button data-meal="${k}" class="${k === selectedMeal ? 'active' : ''}">${MEAL_LABELS[k]}</button>
        `).join('')}
      </div>

      <div style="height:16px;"></div>
      <button class="btn" id="dl-save" ${validCount === 0 ? 'disabled' : ''}>
        Toevoegen${isToday ? ' aan vandaag' : ''} — ${totalKcal()} kcal
      </button>
      <p class="error" id="dl-error" hidden></p>
    `;

    bindEvents();
  }

  function bindEvents() {
    container.querySelector('#back-btn').addEventListener('click', () => navigate('#/add'));
    if (canEdit) {
      container.querySelector('#edit-btn').addEventListener('click', () =>
        navigate(`#/dish/edit?dish=${dishId}`));
    }

    container.querySelectorAll('#dl-mult button').forEach(btn => {
      btn.addEventListener('click', () => {
        multiplier = parseFloat(btn.getAttribute('data-mult'));
        renderAll();
      });
    });

    container.querySelectorAll('#dl-components .dish-component-row').forEach(row => {
      row.addEventListener('click', () => {
        const i = parseInt(row.getAttribute('data-index'), 10);
        active[i] = !active[i];
        renderAll();
      });
    });

    container.querySelectorAll('#dl-meal button').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedMeal = btn.getAttribute('data-meal');
        container.querySelectorAll('#dl-meal button').forEach(b =>
          b.classList.toggle('active', b === btn));
      });
    });

    container.querySelector('#dl-save').addEventListener('click', async () => {
      const errEl = container.querySelector('#dl-error');
      errEl.hidden = true;
      const saveBtn = container.querySelector('#dl-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Bezig...';

      const rows = components
        .map((c, i) => ({ c, i }))
        .filter(({ i }) => active[i])
        .map(({ c }) => ({
          product_id: c.products.id,
          amount_grams: effectiveGrams(c),
          kcal: compKcal(c),
          meal_type: selectedMeal,
          date: dateParam,
          dish_id: dishId,
        }));

      try {
        await bulkCreateEntries(rows);
        showToast(`Toegevoegd: ${totalKcal()} kcal`);
        navigate(isToday ? '#/' : `#/day?date=${dateParam}`);
      } catch (err) {
        errEl.textContent = 'Kon niet opslaan: ' + err.message;
        errEl.hidden = false;
        saveBtn.disabled = false;
        saveBtn.textContent = `Toevoegen — ${totalKcal()} kcal`;
      }
    });
  }

  renderAll();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/js/views/dish-log.js
git commit -m "Add dish-log view (multiplier + checkboxes + bulk insert)"
```

---

## Task 9: Update `add-food.js` — segmented filter + gemixte resultaten

**Files:**
- Modify: `src/js/views/add-food.js`

- [ ] **Step 1: Vervang het bestand**

Schrijf `src/js/views/add-food.js` opnieuw:

```javascript
import { listProducts } from '../db/products.js';
import { listDishes } from '../db/dishes.js';
import { listRecentItemsForUser } from '../db/entries.js';
import { getMyProfile, updateMyHideNevo } from '../db/profiles.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import { escapeHtml } from '../utils/html.js';
import { normalize, rankProducts } from '../utils/product-search.js';

const TOP_N_DEFAULT = 20;
const TOP_N_SEARCH  = 50;
const RECENTS_VISIBLE = 5;

const FILTER_OPTIONS = [
  { key: 'all',      label: 'Alles' },
  { key: 'products', label: 'Producten' },
  { key: 'dishes',   label: 'Gerechten' },
];

export async function render(container, params) {
  const meal = params.meal || '';
  const dateParam = params.date || '';

  container.innerHTML = `
    <div class="view-header">
      <button class="btn-back" id="back-btn">←</button>
      <div>
        <h1>Voeg eten toe</h1>
        <small>Kies product, gerecht of maak nieuw</small>
      </div>
    </div>

    <input class="input" id="search" type="search" placeholder="Zoek..." autocomplete="off">

    <div class="chiprow">
      <div class="filter-segmented" id="filter-seg">
        ${FILTER_OPTIONS.map(o => `<button data-filter="${o.key}" type="button">${o.label}</button>`).join('')}
      </div>
      <button class="chip" id="nevo-chip" type="button" aria-pressed="false">NEVO producten verbergen</button>
    </div>

    <div id="results" style="margin-top:12px;">
      <p class="text-muted" style="padding:8px 0;">Laden...</p>
    </div>

    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn-secondary btn" id="new-product-btn" style="flex:1;background:rgba(0,230,118,0.12);border:1px dashed var(--accent);color:var(--accent);">+ Nieuw product</button>
      <button class="btn-secondary btn" id="new-dish-btn" style="flex:1;background:rgba(0,230,118,0.12);border:1px dashed var(--accent);color:var(--accent);">+ Nieuw gerecht</button>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    navigate(dateParam ? `#/day?date=${dateParam}` : '#/');
  });

  document.getElementById('new-product-btn').addEventListener('click', () => {
    const qs = new URLSearchParams();
    if (meal) qs.set('meal', meal);
    if (dateParam) qs.set('date', dateParam);
    const name = document.getElementById('search').value.trim();
    if (name) qs.set('name', name);
    const q = qs.toString();
    navigate(`#/add/new${q ? '?' + q : ''}`);
  });

  document.getElementById('new-dish-btn').addEventListener('click', () => {
    navigate('#/dish/new');
  });

  let allProducts = [];
  let allDishes = [];
  let recents = [];   // [{kind:'product', product}|{kind:'dish', dish}]
  let hideNevo = false;
  let filter = 'all';
  let recentsExpanded = false;

  try {
    const [products, dishes, recentItems, profile] = await Promise.all([
      listProducts(),
      listDishes(),
      listRecentItemsForUser(TOP_N_DEFAULT),
      getMyProfile(),
    ]);
    allProducts = products;
    allDishes = dishes;
    recents = recentItems;
    hideNevo = !!(profile && profile.hide_nevo);
  } catch (err) {
    document.getElementById('results').innerHTML =
      `<p class="error">Kon data niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  const search = document.getElementById('search');
  const resultsEl = document.getElementById('results');
  const chipEl = document.getElementById('nevo-chip');
  const filterEl = document.getElementById('filter-seg');

  function syncChip() {
    chipEl.setAttribute('aria-pressed', String(hideNevo));
    chipEl.textContent = hideNevo ? 'NEVO producten tonen' : 'NEVO producten verbergen';
    chipEl.disabled = filter === 'dishes';
  }

  function syncFilter() {
    filterEl.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-filter') === filter));
    syncChip();
  }
  syncFilter();

  filterEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    filter = btn.getAttribute('data-filter');
    syncFilter();
    renderResults(search.value);
  });

  chipEl.addEventListener('click', async () => {
    if (chipEl.disabled) return;
    const previous = hideNevo;
    hideNevo = !hideNevo;
    chipEl.disabled = true;
    syncChip();
    renderResults(search.value);
    try {
      await updateMyHideNevo(hideNevo);
    } catch {
      hideNevo = previous;
      syncChip();
      renderResults(search.value);
      showToast('Kon voorkeur niet opslaan');
    } finally {
      chipEl.disabled = filter === 'dishes';
    }
  });

  function visibleProducts() {
    return hideNevo ? allProducts.filter(p => p.source !== 'nevo') : allProducts;
  }

  // Builds an array of displayable items: [{kind, name, payload}, ...]
  // Filter applies. For default-no-query view we show RECENTS instead of full lists.
  function buildList(query) {
    const q = normalize(query.trim());

    if (!q) {
      // Empty query: show recents, optionally filtered by kind/hide_nevo.
      let items = recents;
      if (filter === 'products') items = items.filter(r => r.kind === 'product');
      if (filter === 'dishes')   items = items.filter(r => r.kind === 'dish');
      if (hideNevo) items = items.filter(r => r.kind !== 'product' || r.product.source !== 'nevo');
      return { kind: 'recents', items };
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
  }

  function renderResults(query) {
    const { kind, items } = buildList(query);

    if (items.length === 0) {
      const totalCount = (filter === 'dishes' ? allDishes.length : visibleProducts().length);
      if (!query.trim()) {
        resultsEl.innerHTML = `
          <p class="text-muted" style="padding:12px 0;">
            Typ om te zoeken in ${totalCount} ${filter === 'dishes' ? 'gerechten' : 'producten'}
          </p>`;
      } else {
        resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Niets gevonden. Maak iets nieuws aan ↓</p>`;
      }
      return;
    }

    if (kind === 'recents') {
      const slice = recentsExpanded ? items : items.slice(0, RECENTS_VISIBLE);
      const hidden = items.length - slice.length;
      const moreBtn = hidden > 0
        ? `<button class="btn-more-recents" id="more-recents-btn" type="button">Meer tonen (${hidden})</button>`
        : '';
      const totalCount = (filter === 'dishes')
        ? allDishes.length
        : (filter === 'products' ? visibleProducts().length : allDishes.length + visibleProducts().length);
      resultsEl.innerHTML =
        `<p class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 4px;">Laatst gegeten</p>` +
        renderItemList(slice) + moreBtn +
        `<p class="text-muted" style="font-size:11px;text-align:center;padding:12px 0;">Typ om te zoeken in ${totalCount} items</p>`;
    } else {
      resultsEl.innerHTML = renderItemList(items);
    }
  }

  function renderItemList(items) {
    return `<ul class="list">${items.map(item => {
      if (item.kind === 'dish') {
        const d = item.dish;
        return `
          <li class="meal-row" data-kind="dish" data-id="${d.id}">
            <div>
              <div>${escapeHtml(d.name)}<span class="badge-dish">GERECHT</span></div>
              <div class="items">${d.default_meal_type ? `Suggestie: ${MEAL_LABEL_SHORT[d.default_meal_type] || d.default_meal_type}` : 'Bundel van producten'}</div>
            </div>
            <span>›</span>
          </li>`;
      } else {
        const p = item.product;
        return `
          <li class="meal-row" data-kind="product" data-id="${p.id}">
            <div>
              <div>${escapeHtml(p.name)}${p.source === 'nevo' ? '<span class="badge-nevo">NEVO</span>' : ''}</div>
              <div class="items">${p.kcal_per_100g} kcal/100g${p.unit_grams ? ` · ${p.unit_grams}g/stuk` : ''}</div>
            </div>
            <span>›</span>
          </li>`;
      }
    }).join('')}</ul>`;
  }

  search.addEventListener('input', () => renderResults(search.value));
  renderResults('');

  resultsEl.addEventListener('click', (e) => {
    if (e.target.closest('#more-recents-btn')) {
      recentsExpanded = true;
      renderResults(search.value);
      return;
    }
    const row = e.target.closest('.meal-row');
    if (!row) return;
    const kind = row.getAttribute('data-kind');
    const id = row.getAttribute('data-id');
    if (kind === 'dish') {
      const qs = new URLSearchParams({ dish: id });
      if (meal) qs.set('meal', meal);
      if (dateParam) qs.set('date', dateParam);
      navigate(`#/dish/log?${qs}`);
    } else {
      const qs = new URLSearchParams({ product: id });
      if (meal) qs.set('meal', meal);
      if (dateParam) qs.set('date', dateParam);
      navigate(`#/add/portion?${qs}`);
    }
  });
}

const MEAL_LABEL_SHORT = { breakfast: '🌅', lunch: '🥗', dinner: '🍽', snack: '🍪' };
```

- [ ] **Step 2: Commit**

```bash
git add src/js/views/add-food.js
git commit -m "Unify add-food: segmented filter + dishes mixed in + 2 dashed buttons"
```

---

## Task 10: Routes registreren in `app.js`

**Files:**
- Modify: `src/js/app.js`

- [ ] **Step 1: Voeg drie `defineRoute`-regels toe**

Zoek in `src/js/app.js` het blok `defineRoute('#/add/new', ...);` en voeg eronder toe:

```javascript
defineRoute('#/dish/new',       () => import('./views/dish-builder.js'));
defineRoute('#/dish/edit',      () => import('./views/dish-builder.js'));
defineRoute('#/dish/log',       () => import('./views/dish-log.js'));
```

- [ ] **Step 2: Breid `KNOWN_ROUTES` uit**

Vervang de regel:

```javascript
const KNOWN_ROUTES = ['#/login', '#/onboarding', '#/', '#/day', '#/history', '#/add', '#/add/portion', '#/add/new', '#/friends', '#/friend-day', '#/friend-week', '#/friend-month', '#/settings'];
```

door:

```javascript
const KNOWN_ROUTES = ['#/login', '#/onboarding', '#/', '#/day', '#/history', '#/add', '#/add/portion', '#/add/new', '#/dish/new', '#/dish/edit', '#/dish/log', '#/friends', '#/friend-day', '#/friend-week', '#/friend-month', '#/settings'];
```

- [ ] **Step 3: Smoke-test routes**

Live Server actief, hard refresh (`Cmd+Shift+R`). Bezoek manueel:
- `#/dish/new` → builder-pagina rendered (lege form)
- `#/dish/log?dish=<bestaand-id>` → 404-style error nog OK omdat er nog geen dishes zijn (we maken er één in Task 13)

- [ ] **Step 4: Commit**

```bash
git add src/js/app.js
git commit -m "Register dish routes (#/dish/new, /edit, /log)"
```

---

## Task 11: Service worker — cache bump + nieuwe assets

**Files:**
- Modify: `src/sw.js`

- [ ] **Step 1: Bump CACHE_NAME en breid STATIC_ASSETS uit**

Vervang in `src/sw.js`:

```javascript
const CACHE_NAME = 'unfat-v31';
```

door:

```javascript
const CACHE_NAME = 'unfat-v32';
```

Voeg in de `STATIC_ASSETS` array (na de bestaande regels) toe:

```javascript
  './js/db/dishes.js',
  './js/utils/product-search.js',
  './js/views/dish-builder.js',
  './js/views/dish-log.js',
  './js/views/components/dish-component-sheet.js',
```

- [ ] **Step 2: Verifieer in Live Server**

Hard refresh, open DevTools → Application → Service Workers → Update on reload, dan een tweede refresh. Console toont één keer "skipWaiting"-log of niets foutigs. `caches.keys()` toont `unfat-v32`.

- [ ] **Step 3: Commit**

```bash
git add src/sw.js
git commit -m "Bump SW cache to v32 + add dish assets"
```

---

## Task 12: CHANGELOG + ROADMAP

**Files:**
- Modify: `docs/general/CHANGELOG.md`
- Modify: `docs/general/ROADMAP.md`

- [ ] **Step 1: Voeg CHANGELOG-entry toe bovenaan**

Open `docs/general/CHANGELOG.md`. Voeg direct ná `# Changelog` een nieuw blok in:

```markdown
## 2026-05-04

- Sub-project K: gerechten — bundels van producten als gedeelde recepten. Op de toevoegen-pagina nu een segmented filter (Alles/Producten/Gerechten) naast de bestaande NEVO-chip; resultaten en "Laatst gegeten" tonen producten en gerechten gemengd met een GERECHT-badge. Twee dashed-knoppen onderaan: "+ Nieuw product" en "+ Nieuw gerecht"
- Aanmaken: `#/dish/new` met naam, optionele suggestie-maaltijd en ingrediënten-lijst. + knop opent een sheet (zoek-flow + Gram/Stuks-portie hergebruikt). Bewerken op `#/dish/edit` met dezelfde view en een rode "Verwijderen"-knop (alleen voor de aanmaker)
- Loggen: `#/dish/log` met portie-multiplier (½×/1×/1½×/2×) en per-ingrediënt-checkboxes; bij Toevoegen wordt het gerecht expanded naar N entries via één bulk-insert. Maaltijd valt terug op gerecht.default_meal_type, anders op tijd-van-dag
- Datamodel: tabellen `dishes` en `dish_components` (gedeeld als products: select voor alle authenticated, edit voor eigenaar+editor+admin, delete alleen eigenaar). `entries.dish_id` (nullable, on delete set null) link entries aan hun gerecht-template; bij gerecht-delete blijven al gelogde entries staan
- Edit-trail: `last_edited_by`/`last_edited_at` op `dishes` via trigger, en een tweede trigger op `dish_components` werkt de trail van de parent-dish bij wanneer ingrediënten wijzigen — net als bij products
- Refactor: zoek-scoring (`normalize`, `rankProducts`) verhuisd naar `src/js/utils/product-search.js` zodat de gerecht-ingrediënten-picker dezelfde ranking gebruikt
- Migration: `20260504110039_dishes.sql`. SW cache v31 → v32
```

- [ ] **Step 2: Verplaats K naar "Afgerond" in ROADMAP**

Open `docs/general/ROADMAP.md`:
1. Verwijder de `### K. Gerechten / maaltijden`-sectie en alles eronder tot de volgende `###`-header.
2. Voeg in de tabel onder `## Afgerond ✅` een nieuwe regel toe (chronologisch op datum-aflopend gesorteerd, bovenaan):

```markdown
| 2026-05-04 | K | Gerechten | Bundel producten tot gedeelde recepten; loggen via portie-multiplier × per-ingrediënt-checkbox expandeert naar N entries. Unified zoekpagina met segmented filter Alles/Producten/Gerechten en GERECHT-badge |
```

- [ ] **Step 3: Commit**

```bash
git add docs/general/CHANGELOG.md docs/general/ROADMAP.md
git commit -m "Update CHANGELOG + ROADMAP for K"
```

---

## Task 13: End-to-end smoke-test (handmatig)

**Files:** geen — alleen verificatie in Live Server.

- [ ] **Step 1: Login als gewone user, refresh hard**

Live Server, `#/`. Login als de standaard test-user (geen editor/admin).

- [ ] **Step 2: Aanmaken-flow**

Navigeer naar `#/add` → tap "+ Nieuw gerecht". Vul:
- Naam: `Test-tosti`
- Suggestie-maaltijd: 🥗 Lunch
- Voeg 3 ingrediënten toe via "+ Ingrediënt toevoegen":
  1. zoek "brood" → kies een product → 50g (of 2 sneden als unit_grams aanwezig is)
  2. zoek "kaas" → kies een product → 30g
  3. zoek "ham" → kies een product → 30g

Tap "Aanmaken". Expected: toast "Gerecht aangemaakt", redirect naar `#/add`.

- [ ] **Step 3: Verify in zoekpagina**

Op `#/add`:
- Filter `Alles` actief, lege query → "Test-tosti" verschijnt nog niet (recents-only voor lege query, nog geen log)
- Typ `tosti` in de search → "Test-tosti" verschijnt met `GERECHT`-badge
- Wissel filter naar `Producten` → tosti verdwijnt
- Wissel naar `Gerechten` → tosti staat er, NEVO-chip wordt visueel disabled
- Wissel terug naar `Alles`

- [ ] **Step 4: Loggen-flow**

Tap op de "Test-tosti"-rij → land op `#/dish/log`. Verwacht:
- Hero toont het totaal-kcal
- Maaltijd-grid: Lunch is voorgeselecteerd (vanuit default_meal_type)
- Multiplier `1×` actief
- 3 vinkjes aan
- Tap multiplier `½×` → kcal halveert, portie-display past zich aan
- Vink kaas uit → kcal valt terug, regel doorgestreept
- Tap "Toevoegen — N kcal" → toast, redirect naar dag-view

In dag-view: 2 entries verschijnen onder Lunch (brood + ham, kaas niet).

- [ ] **Step 5: Recents check**

Terug naar `#/add` → "Laatst gegeten" toont "Test-tosti" als eerste rij (kind=dish), met `GERECHT`-badge. Tap → opent loggen-flow opnieuw.

- [ ] **Step 6: Bewerken**

Op `#/dish/log` voor Test-tosti, tap ✏-knop in header → land op `#/dish/edit?dish=...`. Wijzig naam naar "Test-tosti V2", verwijder ham (tap ingrediënt → 🗑), tap "Opslaan". Toast + redirect.

- [ ] **Step 7: Verwijderen**

Open `#/dish/edit?dish=...` opnieuw, tap "Verwijderen". Confirm-dialog → ja. Toast + redirect. Op `#/add` is "Test-tosti" weg uit recents en zoek. De eerder gelogde Lunch-entries staan nog steeds in de dag-view (`dish_id` is null geworden).

- [ ] **Step 8: Editor-rol scenario (optioneel — als je een editor-account hebt)**

Login als editor. Maak een gerecht aan zoals user A. Switch naar user B (editor). Zoek op naam → tap → ✏ knop zichtbaar → bewerk een ingrediënt → opslaan. Check in Supabase Dashboard: `dishes.last_edited_by` = user B's id, `last_edited_at` is recent. Verwijder-knop is **niet** zichtbaar (delete is owner-only).

- [ ] **Step 9: PWA-update-flow (kort)**

Hard refresh in een tweede tab. Update-toast "Nieuwe versie beschikbaar" verschijnt mogelijk (afhankelijk van of de SW al actief was). Niet blocking voor deze task — alleen checken dat geen console-errors verschijnen.

- [ ] **Step 10: Geen commit nodig**

Smoke-test geeft geen file-changes; geen commit. Eventuele bug-fixes uit deze test → eigen commits met fix-message.

---

## Self-review summary

Spec coverage check:
- ✅ Datamodel (dishes, dish_components, entries.dish_id) → Task 1
- ✅ RLS (gedeeld + edit-trail trigger) → Task 1
- ✅ Component-edits-touch-trail trigger → Task 1
- ✅ Zoekpagina (segmented filter, gemixt, 2 knoppen, NEVO-disable bij Gerechten) → Task 9
- ✅ Aanmaken-pagina + Bewerken-pagina (gedeelde view) → Task 7
- ✅ Loggen-pagina (multiplier + checkboxes + bulk-insert) → Task 8
- ✅ Recents mengt producten + gerechten → Task 3 + Task 9
- ✅ Validatie (≥1 component, ≥1 vinkje aan, naam vereist) → Task 7 + Task 8 (`disabled`-states)
- ✅ Edit-flow als aparte route, niet sheet → Task 7
- ✅ SW cache bump → Task 11
- ✅ CHANGELOG + ROADMAP → Task 12
- ✅ End-to-end test → Task 13

Type/name consistency check:
- `bulkCreateEntries` (Task 3) wordt aangeroepen in Task 8 ✓
- `listRecentItemsForUser` (Task 3) wordt aangeroepen in Task 9 ✓
- `openDishComponentSheet` (Task 6) wordt aangeroepen in Task 7 ✓
- `getDish`, `createDish`, `updateDish`, `deleteDish` (Task 2) gebruikt in Tasks 7+8 ✓
- `normalize`, `rankProducts` (Task 4) gebruikt in Tasks 6+9 ✓
- `MEAL_LABEL_SHORT` definitie staat onderaan add-food.js (Task 9), gebruikt in dezelfde file ✓
- `formatPortion` is een lokale helper in beide views (Task 7+8) — bewuste keuze, andere drempel/logica per view (builder = exact match, log = met multiplier-tolerantie)

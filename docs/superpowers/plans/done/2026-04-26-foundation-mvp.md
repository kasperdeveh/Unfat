# Foundation + Solo Tracking MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working PWA where one user can log daily calories against a personal target/max, deployed to GitHub Pages with Supabase backend.

**Architecture:** Vanilla HTML/CSS/JS single-page app with hash router. Supabase for auth (magic link) and database (Postgres + RLS). PWA-installable, hosted statically on GitHub Pages via Action.

**Tech Stack:** Vanilla JS (ES modules, no build step), Supabase JS SDK v2 (CDN), Supabase Postgres + Auth + RLS, GitHub Pages + GitHub Actions for deploy.

**Testing approach:** No automated tests for this MVP (per spec decision). Each task has a **manual verification step** — open Live Server, perform the action, check result. The engineer must actually run the verification, not skip it.

**Spec reference:** `docs/superpowers/specs/2026-04-26-foundation-mvp-design.md`

---

## File Structure (after completion)

```
/                                  # repo root
  src/                             # GitHub Pages publishes from here
    index.html                     # SPA entry point
    manifest.json                  # PWA manifest
    sw.js                          # Service worker
    css/
      style.css                    # All styles (dark sporty theme)
    js/
      app.js                       # Bootstrap: init Supabase, router, session check
      router.js                    # Hash-based router
      supabase.js                  # Supabase client (singleton)
      config.js                    # Supabase URL + anon key (public)
      auth.js                      # Magic link helpers
      ui.js                        # Shared helpers: toast, bottom nav, header
      views/
        login.js                   # Magic link form
        onboarding.js              # First-time goal setup
        dashboard.js               # Day overview
        add-food.js                # Step A: product search
        add-food-portion.js        # Step B: portion + meal
        add-food-new.js            # New product form
        settings.js                # Edit goals + sign out
      db/
        profiles.js                # CRUD for profiles
        products.js                # CRUD for products
        entries.js                 # CRUD for entries
    icons/
      icon-192.png
      icon-512.png
  supabase/
    migrations/
      20260426_initial.sql         # Schema, enum, RLS
  .github/workflows/deploy.yml     # GH Pages deploy
```

---

## Phase 1 — Setup

### Task 1: Create Supabase project (manual user action)

**Why:** App requires URL + anon key from a real Supabase project before any code can talk to it.

**Files:** none (this is a manual step)

- [ ] **Step 1: User creates Supabase project**

The user must do this in a browser:
1. Go to https://supabase.com/dashboard
2. Click "New project". Name: `unfat`. Region: closest (e.g. EU West).
3. Set a database password (store it somewhere — not needed for app, but useful for direct SQL access later)
4. Wait until project is ready (~2 min)
5. Open **Project Settings → API**. Copy:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon / public key** (starts with `eyJ...`)
6. Open **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:5500` (Live Server default port)
   - **Redirect URLs:** add `http://localhost:5500` and (later) the GitHub Pages URL

Hand the URL + anon key to the implementer for Task 5.

- [ ] **Step 2: Verify**

Implementer runs nothing yet — confirm with user that the project is created and credentials are ready. Do not proceed to Task 2 without them.

---

### Task 2: Clean repo skeleton

**Why:** Existing `src/` has empty placeholder files. Remove them so we start clean and consistent with the planned structure.

**Files:**
- Delete: `src/index.html` (empty)
- Delete: `src/css/style.css` (empty)
- Delete: `src/js/app.js` (empty)
- Delete: `src/pages/` (empty directory)

- [ ] **Step 1: Remove empty placeholders**

```bash
rm /workspaces/Unfat/src/index.html
rm /workspaces/Unfat/src/css/style.css
rm /workspaces/Unfat/src/js/app.js
rmdir /workspaces/Unfat/src/pages
```

- [ ] **Step 2: Verify**

```bash
ls -la /workspaces/Unfat/src/
ls -la /workspaces/Unfat/src/css/ /workspaces/Unfat/src/js/
```

Expected: `src/` contains only empty `css/` and `js/` directories. `pages/` is gone.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Remove empty src/ placeholders before clean rebuild"
```

---

### Task 3: Database migration — schema, enum, RLS

**Why:** Database structure must exist before any code can store/read data.

**Files:**
- Create: `supabase/migrations/20260426_initial.sql`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/20260426_initial.sql`:

```sql
-- Migration: initial schema for Unfat MVP
-- Tables: profiles, products (shared), entries
-- Enum: meal_type
-- RLS: enabled on all tables

-- =========================================================================
-- ENUM
-- =========================================================================
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

-- =========================================================================
-- TABLE: profiles
-- =========================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  daily_target_kcal int not null check (daily_target_kcal > 0),
  daily_max_kcal int not null check (daily_max_kcal > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

create policy "profiles_delete_own"
  on public.profiles for delete
  using (id = auth.uid());

-- =========================================================================
-- TABLE: products (shared)
-- =========================================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kcal_per_100g int not null check (kcal_per_100g > 0),
  unit_grams int check (unit_grams > 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index products_name_idx on public.products (lower(name));

alter table public.products enable row level security;

create policy "products_select_all_authenticated"
  on public.products for select
  to authenticated
  using (true);

create policy "products_insert_authenticated"
  on public.products for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "products_update_own"
  on public.products for update
  to authenticated
  using (created_by = auth.uid());

create policy "products_delete_own"
  on public.products for delete
  to authenticated
  using (created_by = auth.uid());

-- =========================================================================
-- TABLE: entries
-- =========================================================================
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  amount_grams numeric(10,2) not null check (amount_grams > 0),
  kcal int not null check (kcal >= 0),
  meal_type meal_type not null,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index entries_user_date_idx on public.entries (user_id, date);

alter table public.entries enable row level security;

create policy "entries_select_own"
  on public.entries for select
  using (user_id = auth.uid());

create policy "entries_insert_own"
  on public.entries for insert
  with check (user_id = auth.uid());

create policy "entries_update_own"
  on public.entries for update
  using (user_id = auth.uid());

create policy "entries_delete_own"
  on public.entries for delete
  using (user_id = auth.uid());
```

- [ ] **Step 2: Apply migration in Supabase**

User must do this manually in Supabase dashboard:
1. Open the project → **SQL Editor** → "New query"
2. Paste the entire migration file content
3. Click "Run"
4. Expected: "Success. No rows returned"

- [ ] **Step 3: Verify schema**

In Supabase dashboard → **Table Editor**, confirm 3 tables exist: `profiles`, `products`, `entries`. Click each one and check columns match the migration. Then in SQL Editor run:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
```

Expected: 3 rows, all with `rowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260426_initial.sql
git commit -m "Add initial database migration: profiles, products, entries with RLS"
```

---

## Phase 2 — App shell

### Task 4: Create index.html

**Why:** SPA entry point. Loads CSS, registers service worker, mounts app root, imports module entry.

**Files:**
- Create: `src/index.html`

- [ ] **Step 1: Write HTML**

```html
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0f0f12">
  <link rel="manifest" href="manifest.json">
  <link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <title>Unfat</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <main id="app"></main>
  <nav id="bottom-nav" hidden></nav>
  <div id="toast" hidden></div>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify**

Open `src/index.html` with Live Server (port 5500). Browser shows blank page (expected — no JS yet). Open devtools → Console: no errors. Network tab: shows `index.html`, `style.css` (404 expected, file not yet created), `app.js` (404 expected).

- [ ] **Step 3: Commit**

```bash
git add src/index.html
git commit -m "Add SPA entry HTML"
```

---

### Task 5: Create config.js with Supabase credentials

**Why:** Centralize Supabase URL + anon key. The anon key is public per design (RLS enforces security).

**Files:**
- Create: `src/js/config.js`

- [ ] **Step 1: Write config**

Replace `<SUPABASE_URL>` and `<SUPABASE_ANON_KEY>` with the values from Task 1.

```js
// Supabase project credentials.
// The anon key is PUBLIC by design — security is enforced via RLS policies.
export const SUPABASE_URL = '<SUPABASE_URL>';
export const SUPABASE_ANON_KEY = '<SUPABASE_ANON_KEY>';
```

- [ ] **Step 2: Verify**

```bash
cat src/js/config.js
```

Expected: file shows real values, no `<...>` placeholders left.

- [ ] **Step 3: Commit**

```bash
git add src/js/config.js
git commit -m "Add Supabase config (URL + public anon key)"
```

---

### Task 6: Create supabase.js client singleton

**Why:** Centralize Supabase client init so every module uses the same instance.

**Files:**
- Create: `src/js/supabase.js`

- [ ] **Step 1: Write client**

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

Notes:
- `esm.sh` serves the official Supabase SDK as ES modules (no build step needed).
- `detectSessionInUrl: true` makes Supabase auto-extract the session from the magic link URL on redirect.

- [ ] **Step 2: Verify**

In `src/js/app.js` (create if missing) temporarily add:

```js
import { supabase } from './supabase.js';
console.log('supabase client', supabase);
```

Open Live Server. Console should log a Supabase client object with auth/from/etc methods. No errors.

- [ ] **Step 3: Remove debug log from app.js (will be rewritten in Task 8)**

```bash
rm -f src/js/app.js  # will be re-created in next tasks
```

- [ ] **Step 4: Commit**

```bash
git add src/js/supabase.js
git commit -m "Add Supabase client singleton"
```

---

### Task 7: Mini hash-router

**Why:** Map `#/login`, `#/`, `#/add` etc. to view modules. Without server config (we deploy static), hash routing is the simplest.

**Files:**
- Create: `src/js/router.js`

- [ ] **Step 1: Write router**

```js
// Hash-based router. Each route maps to a view module that exports `render(container, params)`.
// Routes are matched in order; the first match wins.

const routes = [];

export function defineRoute(pattern, loader) {
  // pattern: e.g. '#/add/portion' — params come from the query string
  routes.push({ pattern, loader });
}

export function navigate(hash) {
  if (location.hash === hash) {
    handleRoute();
  } else {
    location.hash = hash;
  }
}

export function getQueryParams() {
  const idx = location.hash.indexOf('?');
  if (idx === -1) return {};
  const params = new URLSearchParams(location.hash.slice(idx + 1));
  return Object.fromEntries(params);
}

export function getPath() {
  const hash = location.hash || '#/';
  const idx = hash.indexOf('?');
  return idx === -1 ? hash : hash.slice(0, idx);
}

async function handleRoute() {
  const path = getPath();
  const container = document.getElementById('app');
  const params = getQueryParams();

  for (const { pattern, loader } of routes) {
    if (pattern === path) {
      const module = await loader();
      container.innerHTML = '';
      await module.render(container, params);
      return;
    }
  }

  // No route matched — go to default
  if (path !== '#/') navigate('#/');
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
```

- [ ] **Step 2: Verify (after Task 8 creates app.js + a smoke view)**

(Verification deferred to Task 8 — router needs at least one registered route to test.)

- [ ] **Step 3: Commit**

```bash
git add src/js/router.js
git commit -m "Add hash-based mini router with query params"
```

---

### Task 8: App bootstrap (app.js)

**Why:** Single entry that wires everything: starts router, registers all routes, kicks off session check.

**Files:**
- Create: `src/js/app.js`

- [ ] **Step 1: Write bootstrap**

```js
import { defineRoute, startRouter, navigate } from './router.js';
import { supabase } from './supabase.js';

// Register routes — view modules are loaded lazily.
defineRoute('#/login',          () => import('./views/login.js'));
defineRoute('#/onboarding',     () => import('./views/onboarding.js'));
defineRoute('#/',               () => import('./views/dashboard.js'));
defineRoute('#/add',            () => import('./views/add-food.js'));
defineRoute('#/add/portion',    () => import('./views/add-food-portion.js'));
defineRoute('#/add/new',        () => import('./views/add-food-new.js'));
defineRoute('#/settings',       () => import('./views/settings.js'));

// Session-aware routing: redirect based on auth + profile state.
async function routeForSession() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    if (location.hash !== '#/login') navigate('#/login');
    return;
  }

  // Logged in — check if profile exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profile) {
    if (location.hash !== '#/onboarding') navigate('#/onboarding');
    return;
  }

  // Logged in + has profile — if currently on login/onboarding, redirect home
  if (location.hash === '#/login' || location.hash === '#/onboarding') {
    navigate('#/');
  }
}

// React to auth changes (sign in / sign out / token refresh).
supabase.auth.onAuthStateChange(() => {
  routeForSession();
});

startRouter();
routeForSession();
```

- [ ] **Step 2: Create stub login view to allow router smoke test**

Create `src/js/views/login.js`:

```js
export async function render(container) {
  container.innerHTML = '<h1 style="color:#fff;padding:1rem">Login (stub)</h1>';
}
```

Create the same stub for every other route in app.js (so the router doesn't crash on missing modules):

```bash
mkdir -p /workspaces/Unfat/src/js/views
```

For each of these files, create with the stub content (replace `Login (stub)` with the matching name):
- `src/js/views/onboarding.js`
- `src/js/views/dashboard.js`
- `src/js/views/add-food.js`
- `src/js/views/add-food-portion.js`
- `src/js/views/add-food-new.js`
- `src/js/views/settings.js`

Example for `dashboard.js`:

```js
export async function render(container) {
  container.innerHTML = '<h1 style="color:#fff;padding:1rem">Dashboard (stub)</h1>';
}
```

- [ ] **Step 3: Verify**

Open Live Server. Console should show no errors. Page redirects to `#/login` because no session. The stub heading "Login (stub)" appears.

Manually test in browser address bar: change hash to `#/`, `#/settings`, `#/add` — each shows its matching stub. (Note: dashboard/settings will redirect back to login because routeForSession runs on hash change events triggered by `onAuthStateChange`, but the stubs will flicker briefly — that's OK for now.)

- [ ] **Step 4: Commit**

```bash
git add src/js/app.js src/js/views/
git commit -m "Add app bootstrap with session-aware routing and view stubs"
```

---

### Task 9: Base CSS — dark sporty theme

**Why:** Consistent visuals across all views. Design tokens (colors, spacing) defined once.

**Files:**
- Create: `src/css/style.css`

- [ ] **Step 1: Write CSS**

```css
/* =========================================================================
   Unfat — dark sporty theme
   ========================================================================= */

:root {
  --bg: #0f0f12;
  --surface: #1c1c22;
  --surface-border: #2a2a30;
  --text: #f5f5f5;
  --text-muted: rgba(245,245,245,0.55);
  --accent: #00e676;
  --accent-dark: #00b248;
  --accent-text: #0a1f12;
  --warn: #ffa726;
  --warn-dark: #fb8c00;
  --warn-text: #2a1500;
  --danger: #ef5350;
  --danger-dark: #c62828;
  --danger-text: #2a0808;
  --nav-bg: #16161a;
  --radius-card: 14px;
  --radius-input: 12px;
  --radius-btn: 12px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --bottom-nav-h: 64px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.4;
  -webkit-tap-highlight-color: transparent;
}

body {
  min-height: 100vh;
  padding-bottom: var(--bottom-nav-h);
}

button, input {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}

#app {
  padding: env(safe-area-inset-top, 0) var(--space-4) var(--space-5);
}

/* ----- Headings ----- */
.page-title {
  font-size: 20px;
  font-weight: 700;
  margin: var(--space-4) 0 var(--space-1);
}
.page-subtitle {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: var(--space-4);
}

/* ----- Buttons ----- */
.btn {
  display: block;
  width: 100%;
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  border-radius: var(--radius-btn);
  padding: 14px;
  font-weight: 700;
  cursor: pointer;
}
.btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--surface-border);
}
.btn-link {
  background: transparent;
  border: none;
  color: var(--accent);
  text-decoration: underline;
  padding: 0;
  width: auto;
  cursor: pointer;
}
.btn-back {
  background: transparent;
  border: none;
  color: var(--accent);
  font-size: 22px;
  cursor: pointer;
  padding: 0;
}

/* ----- Inputs ----- */
.input, .input-large {
  display: block;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-input);
  padding: 12px;
  color: var(--text);
}
.input-large {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  padding: 16px;
}
.field-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 4px;
  display: block;
}
.field { margin-bottom: var(--space-3); }

/* ----- Cards ----- */
.card {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-card);
  padding: var(--space-3);
  margin-bottom: var(--space-2);
}

/* ----- Hero card (3 states) ----- */
.hero {
  border-radius: 18px;
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}
.hero-green  { background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: var(--accent-text); }
.hero-orange { background: linear-gradient(135deg, var(--warn), var(--warn-dark)); color: var(--warn-text); }
.hero-red    { background: linear-gradient(135deg, var(--danger), var(--danger-dark)); color: var(--danger-text); }
.hero-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  opacity: 0.8;
}
.hero-num { font-size: 38px; font-weight: 800; line-height: 1; margin: 4px 0; }
.hero-num small { font-size: 14px; font-weight: 500; opacity: 0.7; }
.hero-bar { background: rgba(0,0,0,0.18); border-radius: 6px; height: 8px; margin-top: 10px; overflow: hidden; }
.hero-bar-fill { background: rgba(0,0,0,0.65); height: 100%; border-radius: 6px; }
.hero-meta { display: flex; justify-content: space-between; font-size: 10px; margin-top: 6px; font-weight: 600; opacity: 0.85; }
.hero-badge {
  background: rgba(0,0,0,0.18);
  font-size: 10px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  display: inline-block;
  margin-top: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ----- Meal rows ----- */
.meal-row {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  padding: 11px 12px;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  cursor: pointer;
}
.meal-row .kcal { color: var(--accent); font-weight: 700; }
.meal-row.empty .kcal { color: var(--text-muted); font-weight: 400; }
.meal-row .items { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

/* ----- Bottom nav ----- */
#bottom-nav {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  height: var(--bottom-nav-h);
  background: var(--nav-bg);
  border-top: 1px solid var(--surface-border);
  display: flex;
  justify-content: space-around;
  align-items: center;
  font-size: 10px;
  color: var(--text-muted);
  padding-bottom: env(safe-area-inset-bottom, 0);
}
#bottom-nav .nav-item {
  flex: 1;
  text-align: center;
  cursor: pointer;
  padding: 6px;
}
#bottom-nav .nav-item.active { color: var(--accent); font-weight: 600; }
#bottom-nav .nav-icon {
  display: block;
  width: 22px; height: 22px;
  margin: 0 auto 2px;
  border-radius: 5px;
  background: currentColor;
  opacity: 0.55;
}
#bottom-nav .nav-item.active .nav-icon { opacity: 1; }

/* ----- Toast ----- */
#toast {
  position: fixed;
  bottom: calc(var(--bottom-nav-h) + 16px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: var(--accent-text);
  padding: 10px 18px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  z-index: 1000;
}

/* ----- Header (in-view) ----- */
.view-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--surface-border);
  margin-bottom: var(--space-3);
}
.view-header h1 { font-size: 16px; margin: 0; }
.view-header small { display: block; font-size: 11px; color: var(--text-muted); font-weight: 400; }

/* ----- Lists ----- */
.list { padding: 0; margin: 0; list-style: none; }

/* ----- Toggle (segmented) ----- */
.segmented {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-input);
  padding: 3px;
  margin-bottom: var(--space-3);
}
.segmented button {
  flex: 1;
  background: transparent;
  border: none;
  padding: 8px;
  font-weight: 600;
  border-radius: 8px;
  color: var(--text-muted);
  cursor: pointer;
}
.segmented button.active {
  background: var(--accent);
  color: var(--accent-text);
}

/* ----- Meal selector (4 buttons grid) ----- */
.meal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.meal-grid button {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  color: var(--text);
}
.meal-grid button.active {
  background: rgba(0,230,118,0.15);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

/* ----- Helpers ----- */
.text-muted { color: var(--text-muted); }
.preview { text-align: center; color: var(--accent); font-weight: 700; margin-bottom: var(--space-3); }
.error { color: var(--danger); font-size: 12px; margin-top: var(--space-1); }
.spacer { flex: 1; }
[hidden] { display: none !important; }
```

- [ ] **Step 2: Verify**

Reload Live Server. Stub views now show white "Login (stub)" headline on dark background. No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/css/style.css
git commit -m "Add dark sporty base CSS with design tokens"
```

---

### Task 10: Shared UI helpers (toast, bottom nav)

**Why:** Multiple views use the bottom nav and need to show toasts. Centralize.

**Files:**
- Create: `src/js/ui.js`

- [ ] **Step 1: Write helpers**

```js
import { navigate, getPath } from './router.js';

// =====================================================================
// Toast — temporary notification at bottom of screen.
// =====================================================================
let toastTimer = null;

export function showToast(message, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// =====================================================================
// Bottom nav — 3 tabs. Hidden on login/onboarding.
// =====================================================================
const NAV_TABS = [
  { hash: '#/',         label: 'Home' },
  { hash: '#/add',      label: 'Voeg toe' },
  { hash: '#/settings', label: 'Settings' },
];

export function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  const path = getPath();
  const showNav = NAV_TABS.some(t => path === t.hash || path.startsWith(t.hash + '/') || (t.hash === '#/' && path === '#/'));

  if (!showNav) {
    nav.hidden = true;
    return;
  }

  nav.hidden = false;
  nav.innerHTML = '';

  for (const tab of NAV_TABS) {
    const isActive =
      (tab.hash === '#/' && path === '#/') ||
      (tab.hash !== '#/' && (path === tab.hash || path.startsWith(tab.hash + '/')));

    const btn = document.createElement('div');
    btn.className = 'nav-item' + (isActive ? ' active' : '');
    btn.innerHTML = `<span class="nav-icon"></span>${tab.label}`;
    btn.addEventListener('click', () => navigate(tab.hash));
    nav.appendChild(btn);
  }
}

// Hide nav explicitly (used on login/onboarding before render)
export function hideBottomNav() {
  document.getElementById('bottom-nav').hidden = true;
}
```

- [ ] **Step 2: Wire bottom nav into app.js**

Edit `src/js/app.js` to call `renderBottomNav()` on every route change. Add this import at the top:

```js
import { renderBottomNav } from './ui.js';
```

And add this listener at the bottom of app.js, **after** `startRouter()`:

```js
window.addEventListener('hashchange', renderBottomNav);
renderBottomNav();
```

- [ ] **Step 3: Verify**

Open Live Server, navigate manually to `#/` — bottom nav appears with 3 tabs, "Home" active. Click "Voeg toe" → URL becomes `#/add`, "Voeg toe" active. Click "Settings" → URL becomes `#/settings`, "Settings" active. Navigate to `#/login` → bottom nav disappears.

- [ ] **Step 4: Commit**

```bash
git add src/js/ui.js src/js/app.js
git commit -m "Add toast helper and bottom navigation"
```

---

## Phase 3 — Auth & Login

### Task 11: Auth helpers

**Why:** Wrap Supabase auth calls. View modules call these instead of touching `supabase.auth` directly.

**Files:**
- Create: `src/js/auth.js`

- [ ] **Step 1: Write auth helpers**

```js
import { supabase } from './supabase.js';

// Send a magic link to the given email. The link redirects back to the current origin.
export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw error;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
```

- [ ] **Step 2: Verify**

No verification yet — used in next task.

- [ ] **Step 3: Commit**

```bash
git add src/js/auth.js
git commit -m "Add auth helpers (magic link, session, sign out)"
```

---

### Task 12: Login view

**Why:** First view a non-authenticated user sees. Single email input + send-link button.

**Files:**
- Modify: `src/js/views/login.js` (replace stub)

- [ ] **Step 1: Replace login stub**

Replace the contents of `src/js/views/login.js` entirely:

```js
import { sendMagicLink } from '../auth.js';
import { hideBottomNav } from '../ui.js';

export async function render(container) {
  hideBottomNav();

  container.innerHTML = `
    <h1 class="page-title">Unfat</h1>
    <p class="page-subtitle">Log calorieën, blijf binnen je doel.</p>

    <form id="login-form">
      <div class="field">
        <label class="field-label" for="email">E-mailadres</label>
        <input class="input" id="email" type="email" required autocomplete="email" inputmode="email" placeholder="jij@voorbeeld.nl">
      </div>
      <button class="btn" type="submit" id="submit-btn">Stuur login-link</button>
      <p class="error" id="login-error" hidden></p>
    </form>

    <div id="login-success" hidden>
      <div class="card" style="text-align:center;">
        <p>📬 Check je mail.</p>
        <p class="text-muted" style="font-size:12px;">We hebben je een login-link gestuurd. Klik die en je bent ingelogd.</p>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const success = document.getElementById('login-success');
  const submitBtn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Bezig...';

    const email = document.getElementById('email').value.trim();
    try {
      await sendMagicLink(email);
      form.hidden = true;
      success.hidden = false;
    } catch (err) {
      error.textContent = 'Kon login-link niet versturen: ' + err.message;
      error.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Stuur login-link';
    }
  });
}
```

- [ ] **Step 2: Verify**

Open Live Server → URL becomes `#/login`. Page shows "Unfat" title, email field, send button.

Type your email → Submit. After 1-2 seconds: form replaced by "📬 Check je mail." card. Check your real inbox for the magic link email (may be in spam).

Click the link in the email. Browser opens the app, URL has tokens in hash. After ~1 second: redirect to `#/onboarding` (no profile yet) — onboarding stub renders.

If anything fails, check:
- Console for "Kon login-link niet versturen" + the error message
- Supabase dashboard → Authentication → Users — does a user appear after first login?
- Supabase → Authentication → URL Configuration — is `http://localhost:5500` listed in Site URL or Redirect URLs?

- [ ] **Step 3: Commit**

```bash
git add src/js/views/login.js
git commit -m "Add login view with magic link form"
```

---

## Phase 4 — Database modules

### Task 13: profiles.js (DB module)

**Why:** Encapsulate profile CRUD. Views call these helpers instead of writing queries inline.

**Files:**
- Create: `src/js/db/profiles.js`

- [ ] **Step 1: Write module**

```js
import { supabase } from '../supabase.js';

export async function getMyProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  return data; // null if no row yet
}

export async function createMyProfile({ daily_target_kcal, daily_max_kcal }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: session.user.id,
      daily_target_kcal,
      daily_max_kcal,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMyProfile({ daily_target_kcal, daily_max_kcal }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update({ daily_target_kcal, daily_max_kcal })
    .eq('id', session.user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Verify**

(Verification deferred to Task 15 — onboarding view will exercise these functions.)

- [ ] **Step 3: Commit**

```bash
git add src/js/db/profiles.js
git commit -m "Add profiles DB module (get, create, update)"
```

---

### Task 14: products.js (DB module)

**Files:**
- Create: `src/js/db/products.js`

- [ ] **Step 1: Write module**

```js
import { supabase } from '../supabase.js';

// Fetch all products. Used by the search view; we filter client-side because
// the dataset is small and search needs to be instant.
export async function listProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, kcal_per_100g, unit_grams')
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, kcal_per_100g, unit_grams, created_by')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createProduct({ name, kcal_per_100g, unit_grams }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('products')
    .insert({
      name,
      kcal_per_100g,
      unit_grams: unit_grams || null,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/js/db/products.js
git commit -m "Add products DB module (list, get, create)"
```

---

### Task 15: entries.js (DB module)

**Files:**
- Create: `src/js/db/entries.js`

- [ ] **Step 1: Write module**

```js
import { supabase } from '../supabase.js';

// Fetch all entries for a specific date for the current user.
// Joins products to get the name without an extra round-trip.
export async function listEntriesForDate(dateIso) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('entries')
    .select('id, amount_grams, kcal, meal_type, date, products(id, name, unit_grams)')
    .eq('user_id', session.user.id)
    .eq('date', dateIso)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

// Insert a new entry. Caller has already calculated kcal from product + amount_grams.
export async function createEntry({ product_id, amount_grams, kcal, meal_type, date }) {
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
      date: date || new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/js/db/entries.js
git commit -m "Add entries DB module (list by date, create)"
```

---

## Phase 5 — Onboarding view

### Task 16: Onboarding view

**Why:** First-time users land here. Two number inputs, save → profile created.

**Files:**
- Modify: `src/js/views/onboarding.js` (replace stub)

- [ ] **Step 1: Replace onboarding stub**

```js
import { createMyProfile } from '../db/profiles.js';
import { hideBottomNav } from '../ui.js';
import { navigate } from '../router.js';

export async function render(container) {
  hideBottomNav();

  container.innerHTML = `
    <h1 class="page-title">Welkom bij Unfat 👋</h1>
    <p class="page-subtitle">Stel je dagdoel en max in om te starten.</p>

    <form id="onboarding-form">
      <div class="field">
        <label class="field-label" for="target">Dagelijks streefdoel (kcal)</label>
        <input class="input" id="target" type="number" min="800" max="6000" step="50" required value="2000" inputmode="numeric">
      </div>

      <div class="field">
        <label class="field-label" for="max">Absoluut max (kcal)</label>
        <input class="input" id="max" type="number" min="800" max="8000" step="50" required value="2300" inputmode="numeric">
        <p class="text-muted" style="font-size:11px;margin-top:4px;">Mag overschreden worden — je krijgt dan een rode waarschuwing.</p>
      </div>

      <button class="btn" type="submit" id="save-btn">Aan de slag</button>
      <p class="error" id="onb-error" hidden></p>
    </form>
  `;

  const form = document.getElementById('onboarding-form');
  const error = document.getElementById('onb-error');
  const saveBtn = document.getElementById('save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const target = parseInt(document.getElementById('target').value, 10);
    const max = parseInt(document.getElementById('max').value, 10);

    if (max < target) {
      error.textContent = 'Max moet hoger zijn dan streefdoel.';
      error.hidden = false;
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';

    try {
      await createMyProfile({ daily_target_kcal: target, daily_max_kcal: max });
      navigate('#/');
    } catch (err) {
      error.textContent = 'Kon profiel niet opslaan: ' + err.message;
      error.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Aan de slag';
    }
  });
}
```

- [ ] **Step 2: Verify**

Login flow: log in via magic link (Task 12). After click on link → URL becomes `#/onboarding`. Onboarding form shows with defaults 2000 / 2300.

Try max < target (e.g. max = 1800): submit → red error "Max moet hoger zijn dan streefdoel."

Submit valid values → URL becomes `#/`. Dashboard stub appears.

Verify in Supabase → Table Editor → `profiles`: a row exists with your `auth.users.id`, target = 2000, max = 2300.

Manually navigate to `#/onboarding` again — page reloads with form (BUT app.js's `routeForSession` will redirect you to `#/` because profile already exists). That's the expected guard.

- [ ] **Step 3: Commit**

```bash
git add src/js/views/onboarding.js
git commit -m "Add onboarding view with goal setup"
```

---

## Phase 6 — Dashboard

### Task 17: Helper for kcal calculation + state

**Why:** Pure function used by dashboard hero and add-food preview. Reusable.

**Files:**
- Create: `src/js/calc.js`

- [ ] **Step 1: Write calc helpers**

```js
// Calculate kcal for a given amount of grams of a product.
// product: { kcal_per_100g, unit_grams }
// inputType: 'grams' | 'units'
// inputValue: number
export function calcKcal(product, inputType, inputValue) {
  const grams = (inputType === 'units')
    ? inputValue * (product.unit_grams || 0)
    : inputValue;
  return Math.round(grams * product.kcal_per_100g / 100);
}

// Convert input value to grams (so we can store amount_grams consistently).
export function toGrams(product, inputType, inputValue) {
  return (inputType === 'units')
    ? inputValue * (product.unit_grams || 0)
    : inputValue;
}

// Determine hero state based on consumed vs target/max.
// Returns: 'green' | 'orange' | 'red'
export function heroState(consumedKcal, targetKcal, maxKcal) {
  if (consumedKcal > maxKcal) return 'red';
  if (consumedKcal > targetKcal) return 'orange';
  return 'green';
}

// Format today's date as Dutch long form, e.g. "vrijdag 26 april".
export function formatDateNl(date = new Date()) {
  return date.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// Today as YYYY-MM-DD (for `entries.date` column).
export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Verify**

Open `index.html` in Live Server, open devtools console, run:

```js
const m = await import('./js/calc.js');
m.calcKcal({ kcal_per_100g: 236, unit_grams: null }, 'grams', 80);   // → 189
m.calcKcal({ kcal_per_100g: 88,  unit_grams: 102  }, 'units', 1.5);  // → 135
m.heroState(1500, 2000, 2300);  // → 'green'
m.heroState(2100, 2000, 2300);  // → 'orange'
m.heroState(2500, 2000, 2300);  // → 'red'
m.formatDateNl(new Date('2026-04-26'));  // → 'zondag 26 april' (or matching weekday)
m.todayIso();   // → today as 'YYYY-MM-DD'
```

All values must match the comments. If something is off, fix the function before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/js/calc.js
git commit -m "Add calc helpers (kcal, grams, hero state, date)"
```

---

### Task 18: Dashboard view

**Why:** The home screen. Hero card + 4 meal rows.

**Files:**
- Modify: `src/js/views/dashboard.js` (replace stub)

- [ ] **Step 1: Replace dashboard stub**

```js
import { getMyProfile } from '../db/profiles.js';
import { listEntriesForDate } from '../db/entries.js';
import { heroState, formatDateNl, todayIso } from '../calc.js';
import { navigate } from '../router.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export async function render(container) {
  // Loading state
  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let profile, entries;
  try {
    [profile, entries] = await Promise.all([
      getMyProfile(),
      listEntriesForDate(todayIso()),
    ]);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon dashboard niet laden: ${err.message}</p>`;
    return;
  }

  const totalKcal = entries.reduce((sum, e) => sum + e.kcal, 0);
  const remainingTarget = profile.daily_target_kcal - totalKcal;
  const overTarget = totalKcal - profile.daily_target_kcal;
  const overMax = totalKcal - profile.daily_max_kcal;
  const state = heroState(totalKcal, profile.daily_target_kcal, profile.daily_max_kcal);

  // Group entries by meal
  const byMeal = {};
  for (const meal of MEAL_ORDER) byMeal[meal] = [];
  for (const e of entries) byMeal[e.meal_type].push(e);

  // Hero content per state
  let heroLabel, heroNum, heroBadge = '';
  if (state === 'green') {
    heroLabel = 'Nog beschikbaar';
    heroNum = `${remainingTarget}<small> / ${profile.daily_target_kcal} kcal</small>`;
  } else if (state === 'orange') {
    heroLabel = 'Boven streefdoel';
    heroNum = `+${overTarget}<small> kcal</small>`;
    heroBadge = `<div class="hero-badge">⚠ Let op je max</div>`;
  } else {
    heroLabel = 'Max overschreden';
    heroNum = `+${overMax}<small> kcal boven max</small>`;
    heroBadge = `<div class="hero-badge">🚫 Max overschreden</div>`;
  }

  // Bar fill: clamp to 100%
  const barPct = Math.min(100, Math.round(totalKcal / profile.daily_target_kcal * 100));

  container.innerHTML = `
    <h1 class="page-title">Vandaag</h1>
    <p class="page-subtitle">${formatDateNl()}</p>

    <div class="hero hero-${state}">
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-num">${heroNum}</div>
      <div class="hero-bar"><div class="hero-bar-fill" style="width: ${barPct}%"></div></div>
      <div class="hero-meta">
        <span>${totalKcal} gehad</span>
        <span>max ${profile.daily_max_kcal}</span>
      </div>
      ${heroBadge}
    </div>

    <ul class="list" id="meal-list">
      ${MEAL_ORDER.map(meal => {
        const items = byMeal[meal];
        const sum = items.reduce((s, e) => s + e.kcal, 0);
        const isEmpty = items.length === 0;
        const itemsLabel = isEmpty
          ? '<span class="kcal">+ toevoegen</span>'
          : `<span class="kcal">${sum}</span>`;
        const itemsList = isEmpty
          ? ''
          : `<div class="items">${items.map(e =>
              `${e.products.name} (${Math.round(e.amount_grams)}g)`
            ).join(' · ')}</div>`;
        return `
          <li class="meal-row ${isEmpty ? 'empty' : ''}" data-meal="${meal}">
            <div>
              <div>${MEAL_LABELS[meal]}</div>
              ${itemsList}
            </div>
            ${itemsLabel}
          </li>
        `;
      }).join('')}
    </ul>
  `;

  // Tap on a meal row → go to add-food with that meal pre-selected
  container.querySelectorAll('.meal-row').forEach(row => {
    row.addEventListener('click', () => {
      const meal = row.getAttribute('data-meal');
      navigate(`#/add?meal=${meal}`);
    });
  });
}
```

- [ ] **Step 2: Verify**

Login → onboarding → dashboard. Header shows "Vandaag" + Dutch date. Hero card is **green** with "Nog beschikbaar: 2000 / 2000 kcal" (no entries yet). Four empty meal rows.

Click a meal row → URL becomes `#/add?meal=<type>`, stub of add-food shows.

Test color states later (after entries can be added in Task 21):
- Add 1500 kcal → green still (under 2000)
- Add 2200 total → orange ("+200 kcal" + warn badge)
- Add 2500 total → red ("+200 kcal boven max" + danger badge)

- [ ] **Step 3: Commit**

```bash
git add src/js/views/dashboard.js
git commit -m "Add dashboard view with hero card and meal rows"
```

---

## Phase 7 — Add food flow

### Task 19: Add-food search view (Step A)

**Why:** Search products + entry to "new product" flow.

**Files:**
- Modify: `src/js/views/add-food.js` (replace stub)

- [ ] **Step 1: Replace add-food stub**

```js
import { listProducts } from '../db/products.js';
import { navigate } from '../router.js';

export async function render(container, params) {
  const meal = params.meal || ''; // optional pre-selected meal

  container.innerHTML = `
    <div class="view-header">
      <button class="btn-back" id="back-btn">←</button>
      <div>
        <h1>Voeg eten toe</h1>
        <small>Kies product of maak nieuw</small>
      </div>
    </div>

    <input class="input" id="search" type="search" placeholder="Zoek product..." autocomplete="off">

    <div id="results" style="margin-top:12px;">
      <p class="text-muted" style="padding:8px 0;">Laden...</p>
    </div>

    <button class="btn-secondary btn" id="new-btn" style="margin-top:16px;background:rgba(0,230,118,0.12);border:1px dashed var(--accent);color:var(--accent);">
      + Nieuw product aanmaken
    </button>
  `;

  document.getElementById('back-btn').addEventListener('click', () => navigate('#/'));
  document.getElementById('new-btn').addEventListener('click', () => {
    const q = meal ? `?meal=${meal}` : '';
    navigate(`#/add/new${q}`);
  });

  let products = [];
  try {
    products = await listProducts();
  } catch (err) {
    document.getElementById('results').innerHTML =
      `<p class="error">Kon producten niet laden: ${err.message}</p>`;
    return;
  }

  const search = document.getElementById('search');
  const resultsEl = document.getElementById('results');

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? products.filter(p => p.name.toLowerCase().includes(q))
      : products;

    if (filtered.length === 0) {
      resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Geen producten gevonden. Maak een nieuw product aan ↓</p>`;
      return;
    }

    resultsEl.innerHTML = `<ul class="list">${filtered.map(p => `
      <li class="meal-row" data-id="${p.id}">
        <div>
          <div>${escapeHtml(p.name)}</div>
          <div class="items">${p.kcal_per_100g} kcal/100g${p.unit_grams ? ` · ${p.unit_grams}g/stuk` : ''}</div>
        </div>
        <span>›</span>
      </li>
    `).join('')}</ul>`;

    resultsEl.querySelectorAll('.meal-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-id');
        const q = meal ? `&meal=${meal}` : '';
        navigate(`#/add/portion?product=${id}${q}`);
      });
    });
  }

  search.addEventListener('input', () => renderResults(search.value));
  renderResults('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: Verify**

Navigate to `#/add`. Page shows header, search field, "Geen producten gevonden" (since DB is empty), and "+ Nieuw product aanmaken" button. Click "+ Nieuw" → URL becomes `#/add/new` (stub shows).

Click back arrow → returns to `#/`.

(Search verification deferred to after products exist — see Task 20.)

- [ ] **Step 3: Commit**

```bash
git add src/js/views/add-food.js
git commit -m "Add add-food search view (Step A)"
```

---

### Task 20: New product view

**Why:** Form to create a product when search returns nothing.

**Files:**
- Modify: `src/js/views/add-food-new.js` (replace stub)

- [ ] **Step 1: Replace stub**

```js
import { createProduct } from '../db/products.js';
import { navigate } from '../router.js';

export async function render(container, params) {
  const meal = params.meal || '';

  container.innerHTML = `
    <div class="view-header">
      <button class="btn-back" id="back-btn">←</button>
      <div>
        <h1>Nieuw product</h1>
        <small>Voeg een product toe aan de gedeelde database</small>
      </div>
    </div>

    <form id="new-product-form">
      <div class="field">
        <label class="field-label" for="name">Naam</label>
        <input class="input" id="name" type="text" required maxlength="120" placeholder="bv. Volkoren brood">
      </div>

      <div class="field">
        <label class="field-label" for="kcal">Kcal per 100 gram</label>
        <input class="input" id="kcal" type="number" required min="1" max="2000" inputmode="numeric">
      </div>

      <div class="field">
        <label class="field-label" for="unit">Gewicht per stuk in gram (optioneel)</label>
        <input class="input" id="unit" type="number" min="1" max="5000" inputmode="numeric" placeholder="bv. 102 voor een banaan">
        <p class="text-muted" style="font-size:11px;margin-top:4px;">Vul alleen in als het product per stuk telt (banaan, plak, blik). Anders leeg laten.</p>
      </div>

      <button class="btn" type="submit" id="save-btn">Opslaan en kiezen</button>
      <p class="error" id="np-error" hidden></p>
    </form>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    const q = meal ? `?meal=${meal}` : '';
    navigate(`#/add${q}`);
  });

  const form = document.getElementById('new-product-form');
  const error = document.getElementById('np-error');
  const saveBtn = document.getElementById('save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;

    const name = document.getElementById('name').value.trim();
    const kcal = parseInt(document.getElementById('kcal').value, 10);
    const unitRaw = document.getElementById('unit').value.trim();
    const unit_grams = unitRaw === '' ? null : parseInt(unitRaw, 10);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';

    try {
      const product = await createProduct({
        name,
        kcal_per_100g: kcal,
        unit_grams,
      });
      const q = meal ? `&meal=${meal}` : '';
      navigate(`#/add/portion?product=${product.id}${q}`);
    } catch (err) {
      error.textContent = 'Kon product niet opslaan: ' + err.message;
      error.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Opslaan en kiezen';
    }
  });
}
```

- [ ] **Step 2: Verify (deferred — needs portion view to complete the flow)**

Navigate to `#/add/new`. Form shows. Fill in: name = "Volkoren brood", kcal = 236, unit = (empty). Submit → URL becomes `#/add/portion?product=<uuid>`, stub of portion view shows. In Supabase → Table Editor → `products`, the new row exists.

Add a second product: name = "Banaan", kcal = 88, unit = 102. Submit → portion stub.

Now visit `#/add` — both products show in list. Type "ban" → only Banaan shows. Type "xyz" → empty state with "Geen producten gevonden".

- [ ] **Step 3: Commit**

```bash
git add src/js/views/add-food-new.js
git commit -m "Add new-product creation form"
```

---

### Task 21: Portion view (Step B)

**Why:** The screen where amount + meal are picked. INSERTs into `entries`.

**Files:**
- Modify: `src/js/views/add-food-portion.js` (replace stub)

- [ ] **Step 1: Replace stub**

```js
import { getProduct } from '../db/products.js';
import { createEntry } from '../db/entries.js';
import { calcKcal, toGrams, todayIso } from '../calc.js';
import { showToast } from '../ui.js';
import { navigate } from '../router.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];

export async function render(container, params) {
  const productId = params.product;
  if (!productId) {
    navigate('#/add');
    return;
  }

  let product;
  try {
    product = await getProduct(productId);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon product niet laden: ${err.message}</p>`;
    return;
  }

  const supportsUnits = !!product.unit_grams;
  let inputType = 'grams';   // 'grams' | 'units'
  let inputValue = supportsUnits ? 1 : 100;
  let selectedMeal = params.meal || guessMeal();

  container.innerHTML = `
    <div class="view-header">
      <button class="btn-back" id="back-btn">←</button>
      <div>
        <h1>Hoeveelheid</h1>
        <small>${escapeHtml(product.name)}</small>
      </div>
    </div>

    <div class="hero hero-green">
      <div class="hero-label">Product</div>
      <div style="font-size:18px;font-weight:700;margin-top:4px;">${escapeHtml(product.name)}</div>
      <div style="font-size:12px;opacity:0.75;margin-top:2px;">${product.kcal_per_100g} kcal per 100g${product.unit_grams ? ` · ${product.unit_grams}g per stuk` : ''}</div>
    </div>

    <div class="segmented" id="type-toggle" ${supportsUnits ? '' : 'hidden'}>
      <button data-type="grams" class="active">Gram</button>
      <button data-type="units">Stuks</button>
    </div>

    <input class="input input-large" id="amount" type="number" min="0.1" step="0.1" inputmode="decimal" value="${inputValue}">

    <div class="preview" id="preview"></div>

    <span class="field-label">Maaltijd</span>
    <div class="meal-grid" id="meal-grid">
      ${MEAL_KEYS.map(k => `<button data-meal="${k}" class="${k === selectedMeal ? 'active' : ''}">${MEAL_LABELS[k]}</button>`).join('')}
    </div>

    <div style="height:16px;"></div>

    <button class="btn" id="save-btn">Toevoegen aan vandaag</button>
    <p class="error" id="ap-error" hidden></p>
  `;

  document.getElementById('back-btn').addEventListener('click', () => navigate('#/add'));

  // Type toggle
  document.getElementById('type-toggle').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      inputType = btn.getAttribute('data-type');
      document.getElementById('type-toggle').querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b === btn));
      // Reset to a sensible default for the new type
      const amountEl = document.getElementById('amount');
      amountEl.value = inputType === 'units' ? 1 : 100;
      inputValue = parseFloat(amountEl.value);
      updatePreview();
    });
  });

  // Meal grid
  document.getElementById('meal-grid').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMeal = btn.getAttribute('data-meal');
      document.getElementById('meal-grid').querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b === btn));
    });
  });

  // Amount input
  const amountEl = document.getElementById('amount');
  amountEl.addEventListener('input', () => {
    inputValue = parseFloat(amountEl.value) || 0;
    updatePreview();
  });

  function updatePreview() {
    const kcal = calcKcal(product, inputType, inputValue);
    const unitLabel = inputType === 'units' ? (inputValue === 1 ? 'stuk' : 'stuks') : 'gram';
    document.getElementById('preview').textContent =
      `= ${kcal} kcal (${inputValue} ${unitLabel})`;
  }
  updatePreview();

  // Save
  document.getElementById('save-btn').addEventListener('click', async () => {
    const error = document.getElementById('ap-error');
    error.hidden = true;
    if (inputValue <= 0) {
      error.textContent = 'Hoeveelheid moet groter dan 0 zijn.';
      error.hidden = false;
      return;
    }
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';

    const grams = toGrams(product, inputType, inputValue);
    const kcal = calcKcal(product, inputType, inputValue);

    try {
      await createEntry({
        product_id: product.id,
        amount_grams: grams,
        kcal,
        meal_type: selectedMeal,
        date: todayIso(),
      });
      showToast(`Toegevoegd: ${kcal} kcal`);
      navigate('#/');
    } catch (err) {
      error.textContent = 'Kon niet opslaan: ' + err.message;
      error.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Toevoegen aan vandaag';
    }
  });
}

// Pick a meal based on current local time when none is given.
function guessMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: Verify the full add-food flow**

Pre-condition: Volkoren brood and Banaan exist (from Task 20).

1. Dashboard → tap empty Lunch row → URL `#/add?meal=lunch`. Search shows products.
2. Click "Volkoren brood" → URL `#/add/portion?product=<id>&meal=lunch`. Portion view shows. Toggle is hidden (no `unit_grams`). Amount = 100. Preview = "= 236 kcal (100 gram)". Lunch is active.
3. Change amount to 80 → preview becomes "= 189 kcal (80 gram)".
4. Click "Toevoegen aan vandaag" → toast "Toegevoegd: 189 kcal" appears bottom of screen. URL → `#/`.
5. Dashboard now shows: hero "Nog beschikbaar 1811 / 2000". Lunch row shows "189" + "Volkoren brood (80g)".

6. Tap Snack row → URL `#/add?meal=snack`. Click Banaan → URL `#/add/portion?product=<id>&meal=snack`. Stuks/Gram toggle is now visible. Default = "Gram", value 100, preview "= 88 kcal (100 gram)".
7. Click "Stuks" → input becomes 1, preview "= 90 kcal (1 stuk)" (1 × 102g × 88 / 100 = 89.76 → rounded 90).
8. Save → dashboard, snack row shows "90".

Test color transitions:
- Add enough entries to total > 2000 (lunch entry of 2000g brood gives 4720 kcal) — DON'T do this in real DB; instead temporarily change profile target/max to e.g. target=200, max=300 in Supabase Table Editor and reload dashboard. Verify hero turns orange around 201, red above 300.
- Reset profile target/max to 2000 / 2300 after testing.

- [ ] **Step 3: Commit**

```bash
git add src/js/views/add-food-portion.js
git commit -m "Add portion view: amount, unit toggle, meal selector, save entry"
```

---

## Phase 8 — Settings

### Task 22: Settings view

**Why:** Edit goals + sign out. Bottom of page: email + signup date.

**Files:**
- Modify: `src/js/views/settings.js` (replace stub)

- [ ] **Step 1: Replace stub**

```js
import { getMyProfile, updateMyProfile } from '../db/profiles.js';
import { signOut } from '../auth.js';
import { supabase } from '../supabase.js';
import { showToast } from '../ui.js';
import { navigate } from '../router.js';

export async function render(container) {
  let profile, session;
  try {
    [profile, { data: { session } }] = await Promise.all([
      getMyProfile(),
      supabase.auth.getSession(),
    ]);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon instellingen niet laden: ${err.message}</p>`;
    return;
  }

  const created = new Date(session.user.created_at).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  container.innerHTML = `
    <h1 class="page-title">Instellingen</h1>

    <form id="settings-form">
      <div class="field">
        <label class="field-label" for="target">Dagelijks streefdoel (kcal)</label>
        <input class="input" id="target" type="number" min="800" max="6000" step="50" required value="${profile.daily_target_kcal}" inputmode="numeric">
      </div>

      <div class="field">
        <label class="field-label" for="max">Absoluut max (kcal)</label>
        <input class="input" id="max" type="number" min="800" max="8000" step="50" required value="${profile.daily_max_kcal}" inputmode="numeric">
      </div>

      <button class="btn" type="submit" id="save-btn">Opslaan</button>
      <p class="error" id="set-error" hidden></p>
    </form>

    <div style="height:32px;"></div>

    <button class="btn-secondary btn" id="signout-btn">Uitloggen</button>

    <p class="text-muted" style="font-size:11px;text-align:center;margin-top:32px;">
      ${escapeHtml(session.user.email)}<br>
      Geregistreerd op ${created}
    </p>
  `;

  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('set-error');
    error.hidden = true;

    const target = parseInt(document.getElementById('target').value, 10);
    const max = parseInt(document.getElementById('max').value, 10);

    if (max < target) {
      error.textContent = 'Max moet hoger zijn dan streefdoel.';
      error.hidden = false;
      return;
    }

    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Bezig...';

    try {
      await updateMyProfile({ daily_target_kcal: target, daily_max_kcal: max });
      showToast('Opgeslagen');
      btn.disabled = false;
      btn.textContent = 'Opslaan';
    } catch (err) {
      error.textContent = 'Kon niet opslaan: ' + err.message;
      error.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Opslaan';
    }
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    try {
      await signOut();
      navigate('#/login');
    } catch (err) {
      showToast('Uitloggen mislukt');
    }
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: Verify**

Navigate to `#/settings`. Form shows current target (2000) and max (2300). Email + signup date visible at bottom.

Change target to 1800, save → toast "Opgeslagen". Navigate to `#/` → hero updates to reflect new target.

Try max < target → red error.

Click "Uitloggen" → URL `#/login`. Login form shows. Try navigating to `#/` directly — redirects back to `#/login` (no session).

- [ ] **Step 3: Commit**

```bash
git add src/js/views/settings.js
git commit -m "Add settings view (edit goals, sign out)"
```

---

## Phase 9 — PWA

### Task 23: Manifest

**Why:** Required for "Add to Home Screen" on iOS/Android. Defines name, icons, theme.

**Files:**
- Create: `src/manifest.json`

- [ ] **Step 1: Write manifest**

```json
{
  "name": "Unfat",
  "short_name": "Unfat",
  "description": "Calorietracker met motivatie en sociale features",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0f0f12",
  "theme_color": "#00e676",
  "lang": "nl",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Note `start_url` and `scope` are `./` — relative paths so the app works under both `/` and `/Unfat/`.

- [ ] **Step 2: Verify**

Open Live Server. Devtools → Application → Manifest. Manifest loads with no errors except possibly icon 404s (icons not yet created — Task 24).

- [ ] **Step 3: Commit**

```bash
git add src/manifest.json
git commit -m "Add PWA manifest"
```

---

### Task 24: Generate PWA icons

**Why:** Required for installable PWA. Two sizes (192, 512) of the Unfat logo.

**Files:**
- Create: `src/icons/icon-192.png`
- Create: `src/icons/icon-512.png`

- [ ] **Step 1: Generate icons via Bash**

Use ImageMagick (likely available in the devcontainer; if not, fall back to manual user action below).

```bash
mkdir -p /workspaces/Unfat/src/icons
# Try ImageMagick:
which convert
```

If `convert` is available, run this to generate a simple flat-color icon with white "U":

```bash
convert -size 512x512 \
  -background "#00e676" \
  -fill "#0a1f12" \
  -gravity center \
  -font DejaVu-Sans-Bold \
  -pointsize 320 \
  label:U \
  /workspaces/Unfat/src/icons/icon-512.png

convert -size 192x192 \
  -background "#00e676" \
  -fill "#0a1f12" \
  -gravity center \
  -font DejaVu-Sans-Bold \
  -pointsize 120 \
  label:U \
  /workspaces/Unfat/src/icons/icon-192.png
```

If `convert` is NOT available: stop and ask the user to provide two PNG files (192×192 and 512×512) in `src/icons/`. They can use any quick-icon generator (e.g. https://realfavicongenerator.net/) and replace the placeholder later.

- [ ] **Step 2: Verify**

```bash
ls -la /workspaces/Unfat/src/icons/
```

Both files exist. Open them in VS Code (or browser): green tile with letter U.

In Live Server, devtools → Application → Manifest → icons. Both load without 404.

- [ ] **Step 3: Commit**

```bash
git add src/icons/
git commit -m "Add PWA icons (192px and 512px)"
```

---

### Task 25: Service worker

**Why:** Caches static assets so the app works offline (or fast on flaky mobile networks).

**Files:**
- Create: `src/sw.js`
- Modify: `src/js/app.js` (register the SW)

- [ ] **Step 1: Write service worker**

```js
// Service worker for Unfat. Cache-first for static assets, network-first for Supabase.
// Bump CACHE_NAME on every deploy that ships static asset changes to invalidate caches.

const CACHE_NAME = 'unfat-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/router.js',
  './js/supabase.js',
  './js/config.js',
  './js/auth.js',
  './js/ui.js',
  './js/calc.js',
  './js/db/profiles.js',
  './js/db/products.js',
  './js/db/entries.js',
  './js/views/login.js',
  './js/views/onboarding.js',
  './js/views/dashboard.js',
  './js/views/add-food.js',
  './js/views/add-food-portion.js',
  './js/views/add-food-new.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for Supabase (data must be fresh).
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 2: Register SW in app.js**

Add to the **end** of `src/js/app.js`:

```js
// PWA service worker — only register when served over HTTPS or localhost.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
```

- [ ] **Step 3: Verify**

Reload Live Server. Devtools → Application → Service Workers — `sw.js` is **activated and running**. Devtools → Application → Cache Storage → `unfat-v1` contains all static asset URLs.

Toggle "Offline" in Network tab → reload page → app still loads (cached). Try login → fails (Supabase needs network — expected, network-first).

- [ ] **Step 4: Commit**

```bash
git add src/sw.js src/js/app.js
git commit -m "Add service worker with cache-first static and network-first Supabase"
```

---

## Phase 10 — Deploy

### Task 26: GitHub Pages workflow

**Why:** Automate deploy on push to main. Manual setup (Pages enable in repo settings) is documented in Step 2.

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write workflow**

```bash
mkdir -p /workspaces/Unfat/.github/workflows
```

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: src/

      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Enable Pages in GitHub repo (manual user action)**

User must do this in browser:
1. Go to repo Settings → Pages
2. Under "Build and deployment" → Source: select **"GitHub Actions"**

If user hasn't pushed yet, that's OK — push will be done in Step 4.

- [ ] **Step 3: Update Supabase URL config (manual user action)**

After first deploy, the user must add the production URL to Supabase:
1. Supabase → Authentication → URL Configuration
2. Add to **Redirect URLs**: `https://<github-username>.github.io/Unfat/`
3. Optionally also set Site URL to the production URL

(If user hasn't pushed yet, skip this — return after Step 4 succeeds.)

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Pages deploy workflow"
git push origin main
```

- [ ] **Step 5: Verify deploy**

In GitHub repo:
1. Open the **Actions** tab → see the "Deploy to GitHub Pages" workflow run
2. Wait for green checkmark (~1-2 min)
3. Open the URL shown in the workflow output (something like `https://<user>.github.io/Unfat/`)
4. Page loads. Login form shows. Try logging in — magic link must redirect to the production URL (Step 3 above is required for this to work).
5. Test full flow on iPhone: login → onboarding → dashboard → add food → settings.
6. iPhone Safari: tap Share → "Add to Home Screen". App icon appears with green Unfat icon. Open from home screen — runs full-screen (no Safari UI).

---

### Task 27: Update CHANGELOG and ROADMAP

**Why:** Mark sub-projects A + B as done.

**Files:**
- Modify: `docs/general/CHANGELOG.md`
- Modify: `docs/general/ROADMAP.md`
- Delete: `docs/HANDOFF.md` (no longer needed)

- [ ] **Step 1: Update CHANGELOG**

Add today's entries (use the actual date when finishing — replace `YYYY-MM-DD` with today's). Append bullets to the latest day's section, or add a new section if it's a new day:

```
- Implemented sub-project A (Foundation): Supabase + Auth + magic link, mini hash router, PWA manifest, service worker, GitHub Pages deploy via Action
- Implemented sub-project B (Solo tracking MVP): dashboard with 3-state hero card, products and entries database, voeg-eten-toe flow (search + portion + new product), settings view with goal editing
- App live at https://<github-username>.github.io/Unfat/
```

- [ ] **Step 2: Update ROADMAP**

In `docs/general/ROADMAP.md`:
1. Change status of **A. Foundation** and **B. Solo tracking** from `in voorbereiding (brainstorm gaande)` to `Afgerond` (or move bullets to the bottom table).
2. In the **`## Afgerond ✅`** table, add rows:
```
| 2026-04-26 | A. Foundation (Supabase, Auth, PWA, deploy) |
| 2026-04-26 | B. Solo tracking MVP (dashboard, producten, invoer, doelen) |
```

(Use the actual completion date.)

- [ ] **Step 3: Remove HANDOFF.md**

```bash
rm /workspaces/Unfat/docs/HANDOFF.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/general/CHANGELOG.md docs/general/ROADMAP.md docs/HANDOFF.md
git commit -m "Mark sub-projects A and B as done in changelog and roadmap"
git push origin main
```

---

## Done

After all 27 tasks: a working calorietracker PWA running at the GitHub Pages URL, fully functional for one user. Ready for sub-project C (history & back-dating) as next brainstorm topic.

## Verification rolled-up checklist

For a final smoke test before declaring done, run through this on iPhone (or on desktop with mobile devtools):

- [ ] Open production URL → redirects to `#/login`
- [ ] Email a magic link → click link → land on `#/onboarding` (first time) or `#/` (returning)
- [ ] Onboarding: enter goals → save → dashboard
- [ ] Dashboard: 4 empty meal rows + green hero "Nog beschikbaar"
- [ ] Tap empty meal row → search page with that meal pre-selected
- [ ] Search empty → "+ Nieuw product" → form → save → portion view
- [ ] Portion view: change amount → preview updates → save → toast → dashboard updated
- [ ] Add enough kcal to flip hero orange (above target) and red (above max)
- [ ] Settings → change goals → save → dashboard reflects change
- [ ] Settings → sign out → back to login
- [ ] Add to Home Screen on iPhone → app opens standalone (no Safari UI)
- [ ] Toggle airplane mode → app still loads (cached) but Supabase calls fail gracefully

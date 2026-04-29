# Sub-project D-vervolg — Vrienden in historie + kopiëren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouwen scope B + kopiëren van sub-project D: vriend-historie via Dag/Week/Maand-views met ‹ › navigatie, en één-klik per-entry / per-maaltijd kopiëren met date-picker.

**Architecture:** Eén Supabase migratie breidt `get_friend_day` uit (entry-id, product-id, friend_created_at) en introduceert `get_friend_period(friend_id, start_date, end_date)`. Frontend krijgt twee nieuwe routes (`#/friend-week`, `#/friend-month`), twee nieuwe views, een gedeelde header-component (handle + Dag/Week/Maand toggle) en een bottom-sheet date-picker. Bestaande route `#/friend` wordt hernoemd naar `#/friend-day` voor consistentie. Geen build-step, geen geautomatiseerde tests — verificatie via Live Server in browser.

**Tech Stack:** Vanilla HTML/CSS/JS, Supabase JS SDK, PostgreSQL functies, GitHub Pages PWA met service worker cache.

**Spec:** `docs/superpowers/specs/2026-04-29-vrienden-vervolg-design.md`

---

## File Structure

**Created:**
- `supabase/migrations/20260429_friends_history.sql` — `get_friend_day` update + nieuwe RPC `get_friend_period`
- `src/js/views/friend-week.js` — week-bars view voor een vriend
- `src/js/views/friend-month.js` — maand-bars view voor een vriend
- `src/js/views/components/friend-header.js` — gedeelde header (handle + Dag/Week/Maand segmented toggle)
- `src/js/views/components/copy-date-sheet.js` — bottom-sheet met date-picker, returnt gekozen datum

**Modified:**
- `src/js/db/friendships.js` — nieuwe `getFriendPeriod(friendId, startIso, endIso)` wrapper
- `src/js/views/friend-day.js` — friend-header geïntegreerd, ‹ › datum-nav, kopieer-knoppen op meal-headers + entry-rows, kopieer-flow
- `src/js/app.js` — route `#/friend` hernoemd naar `#/friend-day`, nieuwe routes `#/friend-week` + `#/friend-month`, `KNOWN_ROUTES` bijgewerkt
- `src/js/ui.js` — friend-day path detection bijgewerkt (`#/friend` → `#/friend-day` + week/month)
- `src/js/views/friends.js` — navigate target `#/friend` → `#/friend-day`
- `src/js/views/components/compare-widget.js` — navigate target `#/friend` → `#/friend-day`
- `src/css/style.css` — friend-header, segmented toggle, kopieer-knoppen, copy-date-sheet styles, friend-week/month bars
- `src/sw.js` — `CACHE_NAME` bump v6→v7, nieuwe modules in `STATIC_ASSETS`
- `docs/general/CHANGELOG.md` — entry voor 2026-04-29
- `docs/general/ROADMAP.md` — D-vervolg naar afgerond, achterblijvers (per-dag-kopiëren, vergelijk-widget verfijning, competitie) blijven open

---

## Decomposition

12 taken, elk met eigen commit. Fases zijn los te leveren — na elke fase werkt de app nog (niet alle features af, maar geen broken state).

| Fase | Taken | Resultaat |
|---|---|---|
| 1. Database | T1 | `get_friend_day` levert id+product_id+friend_created_at; `get_friend_period` werkt in Supabase |
| 2. Client DB-laag | T2 | `getFriendPeriod` in `friendships.js` |
| 3. Routes | T3 | `#/friend` → `#/friend-day`; `#/friend-week`, `#/friend-month` bereikbaar (placeholder views) |
| 4. Friend-header | T4 | Gedeelde header-component werkt in `friend-day.js` |
| 5. Friend-day ‹ › nav | T5 | Datum-navigatie in friend-day binnen vriend's `created_at`-grens |
| 6. Copy-date-sheet | T6 | Standalone bottom-sheet date-picker component |
| 7. Kopieer-flow | T7 | Per-entry + per-maaltijd kopiëren werkt vanuit friend-day |
| 8. Friend-week | T8 | `#/friend-week` rendert bars, klik op bar → friend-day, ‹ › weeknav |
| 9. Friend-month | T9 | `#/friend-month` rendert bars per maand, ‹ › maandnav |
| 10. CSS | T10 | Alle styles voor nieuwe componenten en views |
| 11. SW + docs | T11 | `CACHE_NAME` bump, CHANGELOG en ROADMAP bijgewerkt |
| 12. Manuele test | T12 | Volledige checklist uit spec doorlopen |

---

## Phase 1 — Database

### Task 1: Schrijf de migratie

**Files:**
- Create: `supabase/migrations/20260429_friends_history.sql`

- [ ] **Step 1: Maak het bestand**

```sql
-- Migration: friends history (sub-project D-vervolg)
-- Updates get_friend_day to include entry id + product_id (for copy flow) and
-- friend's profile created_at (for ‹ › nav boundary). Adds get_friend_period
-- RPC for week/month views.

-- =========================================================================
-- get_friend_day: include id, product_id in entries, friend_created_at top-level
-- =========================================================================
create or replace function public.get_friend_day(friend_user_id uuid, day date)
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
  v_target int;
  v_max int;
  v_total_kcal int;
  v_per_meal jsonb;
  v_entries jsonb;
  result jsonb;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select exists(
    select 1 from public.friendships
    where user_id_a = a and user_id_b = b and status = 'accepted'
  ) into is_friend;
  if not is_friend then
    raise exception 'not_friends';
  end if;

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

  select daily_target_kcal, daily_max_kcal into v_target, v_max
  from public.profile_history
  where user_id = friend_user_id and valid_from <= day
  order by valid_from desc
  limit 1;

  select coalesce(sum(kcal), 0)::int into v_total_kcal
  from public.entries
  where user_id = friend_user_id and date = day;

  result := result || jsonb_build_object(
    'target', v_target,
    'max', v_max,
    'total_kcal', v_total_kcal
  );

  if v_share_level in ('per_meal', 'entries') then
    v_per_meal := jsonb_build_object(
      'breakfast', (select coalesce(sum(kcal), 0)::int from public.entries
                    where user_id = friend_user_id and date = day and meal_type = 'breakfast'),
      'lunch',     (select coalesce(sum(kcal), 0)::int from public.entries
                    where user_id = friend_user_id and date = day and meal_type = 'lunch'),
      'dinner',    (select coalesce(sum(kcal), 0)::int from public.entries
                    where user_id = friend_user_id and date = day and meal_type = 'dinner'),
      'snack',     (select coalesce(sum(kcal), 0)::int from public.entries
                    where user_id = friend_user_id and date = day and meal_type = 'snack')
    );
    result := result || jsonb_build_object('per_meal', v_per_meal);
  end if;

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

  return result;
end;
$$;

grant execute on function public.get_friend_day(uuid, date) to authenticated;

-- =========================================================================
-- get_friend_period: per-day total_kcal + target/max for a date range
-- =========================================================================
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
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select exists(
    select 1 from public.friendships
    where user_id_a = a and user_id_b = b and status = 'accepted'
  ) into is_friend;
  if not is_friend then
    raise exception 'not_friends';
  end if;

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
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', ds.d,
    'total_kcal', coalesce(t.total_kcal, 0),
    'target', s.target,
    'max', s.max
  ) order by ds.d), '[]'::jsonb)
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

- [ ] **Step 2: Voer de migratie uit in Supabase**

Open Supabase SQL editor, plak de inhoud, run. Verifieer geen errors.

- [ ] **Step 3: Test handmatig in SQL editor**

Vervang `<friend_id>` met een bestaande vriend's user_id van de huidige sessie:

```sql
-- get_friend_day moet entries met id+product_id leveren
select get_friend_day('<friend_id>', current_date);

-- get_friend_period moet days[] van 7 dagen leveren
select get_friend_period('<friend_id>', current_date - 6, current_date);
```

Verwacht: jsonb met `friend_created_at`-veld in beide; `entries` heeft `id` en `product_id`; `days` is array met per-dag totals + target/max.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260429_friends_history.sql
git commit -m "Add friends history migration: get_friend_day extension + get_friend_period RPC"
```

---

## Phase 2 — Client DB-laag

### Task 2: `getFriendPeriod` wrapper

**Files:**
- Modify: `src/js/db/friendships.js`

- [ ] **Step 1: Voeg functie toe aan `friendships.js`**

Plaats onder de bestaande `getFriendDay`-export:

```javascript
export async function getFriendPeriod(friendId, startIso, endIso) {
  const { data, error } = await supabase.rpc('get_friend_period', {
    friend_user_id: friendId,
    start_date: startIso,
    end_date: endIso,
  });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Manuele test in browser console**

Open Live Server, login, open DevTools console:

```javascript
const { getFriendPeriod } = await import('./js/db/friendships.js');
await getFriendPeriod('<friend_id>', '2026-04-22', '2026-04-28');
```

Verwacht: object met `share_level`, `handle`, `friend_created_at`, `days` (7-element array).

- [ ] **Step 3: Commit**

```bash
git add src/js/db/friendships.js
git commit -m "Add getFriendPeriod wrapper for friend week/month views"
```

---

## Phase 3 — Routes

### Task 3: Hernoem `#/friend` → `#/friend-day`, voeg week/month-routes toe

**Files:**
- Modify: `src/js/app.js`
- Modify: `src/js/ui.js`
- Modify: `src/js/views/friends.js`
- Modify: `src/js/views/components/compare-widget.js`
- Modify: `src/js/views/friend-day.js` (back-knop blijft `#/friends`, geen wijziging hier — alleen visuele check)

- [ ] **Step 1: Update `app.js` route definitions**

Vervang in `src/js/app.js`:

```javascript
defineRoute('#/friend',         () => import('./views/friend-day.js'));
```

Met:

```javascript
defineRoute('#/friend-day',     () => import('./views/friend-day.js'));
defineRoute('#/friend-week',    () => import('./views/friend-week.js'));
defineRoute('#/friend-month',   () => import('./views/friend-month.js'));
```

Update `KNOWN_ROUTES` in dezelfde file: vervang `'#/friend'` met `'#/friend-day', '#/friend-week', '#/friend-month'`.

- [ ] **Step 2: Update `ui.js` path detection**

In `src/js/ui.js`, vervang:

```javascript
const isFriendDay = path === '#/friend';
```

Met:

```javascript
const isFriendDay = path === '#/friend-day' || path === '#/friend-week' || path === '#/friend-month';
```

(Variabele heet nu wat misleidend `isFriendDay` maar staat voor "is een friend-sub-pagina"; laat naam staan.)

- [ ] **Step 3: Update navigate-targets in `friends.js`**

In `src/js/views/friends.js`, vervang elke voorkomen van:

```javascript
navigate(`#/friend?id=${userId}`);
```

Met:

```javascript
navigate(`#/friend-day?id=${userId}`);
```

(`grep -n` vooraf om te checken hoeveel plekken — verwacht 1.)

- [ ] **Step 4: Update navigate-target in `compare-widget.js`**

In `src/js/views/components/compare-widget.js`, vervang:

```javascript
navigate(`#/friend?id=${id}&date=${dateIso}`);
```

Met:

```javascript
navigate(`#/friend-day?id=${id}&date=${dateIso}`);
```

- [ ] **Step 5: Maak placeholder views voor week/month**

Maak `src/js/views/friend-week.js`:

```javascript
export async function render(container, params) {
  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Friend week-view komt eraan. id=${params?.id ?? '-'}, anchor=${params?.anchor ?? '-'}</p>`;
}
```

Maak `src/js/views/friend-month.js`:

```javascript
export async function render(container, params) {
  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Friend month-view komt eraan. id=${params?.id ?? '-'}, anchor=${params?.anchor ?? '-'}</p>`;
}
```

(Placeholders worden in T8/T9 vervangen door echte implementatie.)

- [ ] **Step 6: Manuele test**

Live Server. Login. Klik op een vriend in Vrienden-tab → moet naar `#/friend-day?id=...` gaan en friend dag-view tonen. Type in URL `#/friend-week?id=<id>&anchor=2026-04-28` → moet placeholder tonen. Idem `#/friend-month`. Tab-bar onderin moet "Vrienden"-tab actief tonen op alle drie de friend-pagina's.

- [ ] **Step 7: Commit**

```bash
git add src/js/app.js src/js/ui.js src/js/views/friends.js \
  src/js/views/components/compare-widget.js \
  src/js/views/friend-week.js src/js/views/friend-month.js
git commit -m "Rename #/friend to #/friend-day; add #/friend-week + #/friend-month routes"
```

---

## Phase 4 — Friend-header component

### Task 4: Gedeelde header met handle + Dag/Week/Maand toggle

**Files:**
- Create: `src/js/views/components/friend-header.js`
- Modify: `src/js/views/friend-day.js`

- [ ] **Step 1: Maak `friend-header.js`**

```javascript
import { navigate } from '../../router.js';

/**
 * Mount the shared friend-views header into a container.
 *
 * @param {HTMLElement} container — element to render into
 * @param {object} opts
 * @param {string} opts.friendId — UUID of the friend
 * @param {string} opts.handle — friend's handle (already escaped by caller)
 * @param {'day' | 'week' | 'month'} opts.currentView — which toggle is active
 * @param {string} opts.anchor — ISO date used as anchor when switching views (date for day, anchor for week/month)
 */
export function mount(container, { friendId, handle, currentView, anchor }) {
  const isDay = currentView === 'day';
  const isWeek = currentView === 'week';
  const isMonth = currentView === 'month';

  container.innerHTML = `
    <button class="back-btn" id="friend-header-back">‹ Vrienden</button>
    <h1 class="page-title">${escapeHtml(handle)}</h1>
    <div class="friend-view-toggle">
      <button class="${isDay ? 'active' : ''}" data-view="day">Dag</button>
      <button class="${isWeek ? 'active' : ''}" data-view="week">Week</button>
      <button class="${isMonth ? 'active' : ''}" data-view="month">Maand</button>
    </div>
  `;

  container.querySelector('#friend-header-back')
    .addEventListener('click', () => navigate('#/friends'));

  container.querySelectorAll('.friend-view-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === currentView) return;
      const id = encodeURIComponent(friendId);
      const a = encodeURIComponent(anchor);
      if (view === 'day') {
        navigate(`#/friend-day?id=${id}&date=${a}`);
      } else if (view === 'week') {
        navigate(`#/friend-week?id=${id}&anchor=${a}`);
      } else if (view === 'month') {
        navigate(`#/friend-month?id=${id}&anchor=${a}`);
      }
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: Refactor `friend-day.js` om friend-header te gebruiken**

Vervang in `src/js/views/friend-day.js` de hard-coded `back`-button + `<h1 class="page-title">` met een mount-call. Volledige nieuwe `render`-functie:

```javascript
import { getFriendDay } from '../db/friendships.js';
import { heroState, todayIso } from '../calc.js';
import { parseIso, formatDayLongNl } from '../utils/dates.js';
import { navigate } from '../router.js';
import { mount as mountFriendHeader } from './components/friend-header.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export async function render(container, params) {
  const friendId = params?.id;
  if (!friendId) { navigate('#/friends'); return; }
  const dateIso = params?.date || todayIso();
  const date = parseIso(dateIso);

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let day;
  try {
    day = await getFriendDay(friendId, dateIso);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon vriend niet laden: ${err.message}</p>`;
    return;
  }

  const handle = day.handle || 'Vriend';

  // Build skeleton: header at top, then a content slot beneath
  container.innerHTML = `
    <div id="friend-header-slot"></div>
    <p class="page-subtitle">${formatDayLongNl(date)}</p>
    <div id="friend-day-content"></div>
  `;

  mountFriendHeader(
    container.querySelector('#friend-header-slot'),
    { friendId, handle, currentView: 'day', anchor: dateIso }
  );

  const content = container.querySelector('#friend-day-content');

  if (day.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:32px;text-align:center;">${escapeHtml(handle)} deelt geen voortgang.</p>`;
    return;
  }

  const target = day.target;
  const max = day.max;
  const totalKcal = day.total_kcal || 0;

  let heroLabel, heroNum, state;
  if (target == null || max == null) {
    state = 'green';
    heroLabel = 'Geen target/max bekend';
    heroNum = `${totalKcal}<small> kcal</small>`;
  } else {
    state = heroState(totalKcal, target, max);
    if (state === 'green') {
      heroLabel = 'Doel gehaald';
      heroNum = `${totalKcal}<small> / ${target} kcal</small>`;
    } else if (state === 'orange') {
      heroLabel = 'Boven streefdoel';
      heroNum = `+${totalKcal - target}<small> kcal</small>`;
    } else {
      heroLabel = 'Boven max';
      heroNum = `+${totalKcal - max}<small> kcal boven max</small>`;
    }
  }

  const barPct = (target && target > 0) ? Math.min(100, Math.round(totalKcal / target * 100)) : 0;

  let mealsHtml = '';
  if (day.share_level === 'per_meal' || day.share_level === 'entries') {
    const perMeal = day.per_meal || {};
    const entries = day.entries || [];
    mealsHtml = MEAL_ORDER.map(meal => {
      const sum = perMeal[meal] || 0;
      const items = entries.filter(e => e.meal_type === meal);
      return `
        <section class="meal-section">
          <header class="meal-header">
            <span class="meal-title">${MEAL_LABELS[meal]}</span>
            <span class="meal-sum">${sum === 0 ? '' : sum}</span>
          </header>
          ${items.map(e => `
            <div class="entry-row entry-row-readonly">
              <div class="entry-info">
                <div class="entry-name">${escapeHtml(e.product_name)}</div>
                <div class="entry-meta">${Math.round(e.amount_grams)}g · ${e.kcal} kcal</div>
              </div>
            </div>
          `).join('')}
        </section>
      `;
    }).join('');
  }

  content.innerHTML = `
    <div class="hero hero-${state}">
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-num">${heroNum}</div>
      ${target ? `<div class="hero-bar"><div class="hero-bar-fill" style="width: ${barPct}%"></div></div>` : ''}
      ${target ? `<div class="hero-meta"><span>${totalKcal} gehad</span>${max ? `<span>max ${max}</span>` : ''}</div>` : ''}
    </div>

    ${mealsHtml}
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 3: Manuele test**

Live Server. Open een friend dag-view. Verwacht:
- "‹ Vrienden" back-knop bovenaan
- Handle als titel
- Drie tabs "Dag | Week | Maand", Dag actief
- Klik "Week" → navigatie naar `#/friend-week?id=...&anchor=...` (placeholder text uit T3)
- Klik "Maand" → idem voor `#/friend-month`
- Klik "‹ Vrienden" → terug naar `#/friends`

- [ ] **Step 4: Commit**

```bash
git add src/js/views/components/friend-header.js src/js/views/friend-day.js
git commit -m "Add shared friend-header component with Dag/Week/Maand toggle"
```

---

## Phase 5 — Friend-day ‹ › nav

### Task 5: Datum-navigatie in friend-day met grens op vriend's account-creatie

**Files:**
- Modify: `src/js/views/friend-day.js`

- [ ] **Step 1: Voeg ‹ ›-knoppen + dag-titel toe**

In `friend-day.js`, vervang het stuk waar we `<p class="page-subtitle">` rendert. Nieuwe blok (boven de hero, onder de header-slot):

Vervang:

```javascript
  container.innerHTML = `
    <div id="friend-header-slot"></div>
    <p class="page-subtitle">${formatDayLongNl(date)}</p>
    <div id="friend-day-content"></div>
  `;
```

Met:

```javascript
  const friendCreated = day.friend_created_at ? parseIso(day.friend_created_at) : null;
  const today = parseIso(todayIso());
  const prevIso = isoDate(addDays(date, -1));
  const nextIso = isoDate(addDays(date, 1));
  const prevDisabled = friendCreated && dateIso <= day.friend_created_at;
  const nextDisabled = dateIso >= todayIso();

  container.innerHTML = `
    <div id="friend-header-slot"></div>
    <div class="day-nav">
      <button class="day-nav-btn" id="friend-prev-day" ${prevDisabled ? 'disabled' : ''}>‹</button>
      <p class="page-subtitle" style="margin:0 1rem;">${formatDayLongNl(date)}</p>
      <button class="day-nav-btn" id="friend-next-day" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div id="friend-day-content"></div>
  `;
```

Voeg na de `mountFriendHeader(...)`-call deze listeners toe (vóór `if (day.share_level === 'none')`):

```javascript
  const prevBtn = container.querySelector('#friend-prev-day');
  const nextBtn = container.querySelector('#friend-next-day');
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => {
      navigate(`#/friend-day?id=${encodeURIComponent(friendId)}&date=${prevIso}`);
    });
  }
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/friend-day?id=${encodeURIComponent(friendId)}&date=${nextIso}`);
    });
  }
```

Update imports bovenin `friend-day.js`:

```javascript
import { parseIso, formatDayLongNl, isoDate, addDays } from '../utils/dates.js';
```

- [ ] **Step 2: Verifieer dat `isoDate` en `addDays` bestaan in `utils/dates.js`**

```bash
grep -n "export.*isoDate\|export.*addDays" src/js/utils/dates.js
```

Beide zouden moeten bestaan (gebruikt door `history.js`). Anders: voeg toe aan `dates.js` (huidige spec gaat ervan uit ze bestaan; weergegeven in `history.js` line 6).

- [ ] **Step 3: Manuele test**

Live Server, friend dag-view. Verwacht:
- ‹ ›-knoppen flank van datum-titel
- Klik ‹ → vorige dag, content updates
- Navigeer terug tot vriend's `created_at`-datum → ‹ disabled
- Navigeer naar vandaag → › disabled
- Bij vriend met `created_at` < jouw `created_at`: kunnen we voorbij eigen creation navigeren

- [ ] **Step 4: Commit**

```bash
git add src/js/views/friend-day.js
git commit -m "Add ‹ › date navigation to friend-day, bounded by friend's created_at"
```

---

## Phase 6 — Copy-date-sheet

### Task 6: Bottom-sheet date-picker component

**Files:**
- Create: `src/js/views/components/copy-date-sheet.js`

- [ ] **Step 1: Maak `copy-date-sheet.js`**

```javascript
import { todayIso } from '../../calc.js';
import { supabase } from '../../supabase.js';

let openSheet = null;

/**
 * Open a bottom-sheet with a date-picker. Resolves with chosen ISO date string,
 * or null if cancelled.
 *
 * @param {object} opts
 * @param {string} opts.title — heading text (e.g. "Kopieer Lunch naar...")
 * @param {string} [opts.defaultDate] — ISO string, defaults to today
 * @returns {Promise<string|null>}
 */
export async function open({ title, defaultDate }) {
  if (openSheet) closeSheet(null);

  // Resolve sane min: own user's profile created_at (cannot copy to before own account existed).
  const { data: { user } } = await supabase.auth.getUser();
  const minIso = user?.created_at ? user.created_at.slice(0, 10) : '2000-01-01';
  const maxIso = todayIso();
  const initial = defaultDate || maxIso;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'copy-sheet-overlay';
    overlay.innerHTML = `
      <div class="copy-sheet" role="dialog" aria-modal="true">
        <div class="copy-sheet-handle"></div>
        <h2 class="copy-sheet-title">${escapeHtml(title)}</h2>
        <input type="date" class="copy-sheet-date" value="${initial}" min="${minIso}" max="${maxIso}">
        <div class="copy-sheet-actions">
          <button class="copy-sheet-cancel" type="button">Annuleer</button>
          <button class="copy-sheet-confirm" type="button">Kopieer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const dateInput = overlay.querySelector('.copy-sheet-date');
    const confirmBtn = overlay.querySelector('.copy-sheet-confirm');
    const cancelBtn = overlay.querySelector('.copy-sheet-cancel');

    function done(result) {
      closeSheet(result);
    }
    function closeSheet(result) {
      overlay.remove();
      openSheet = null;
      resolve(result);
    }

    confirmBtn.addEventListener('click', () => {
      const value = dateInput.value;
      if (!value) return;
      done(value);
    });
    cancelBtn.addEventListener('click', () => done(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(null);
    });

    openSheet = { closeSheet };
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: Manuele test in browser console**

Live Server, ingelogd:

```javascript
const { open } = await import('./js/views/components/copy-date-sheet.js');
const result = await open({ title: 'Test kopieer naar...', defaultDate: '2026-04-28' });
console.log('Resultaat:', result);
```

Verwacht: bottom-sheet verschijnt met date-input op 28 apr; "Kopieer" → resolve met ISO-string; "Annuleer" of klik buiten sheet → resolve met `null`.

(Visueel zal het er primitief uitzien tot CSS in T10 — focus op functionaliteit.)

- [ ] **Step 3: Commit**

```bash
git add src/js/views/components/copy-date-sheet.js
git commit -m "Add copy-date-sheet bottom-sheet component"
```

---

## Phase 7 — Kopieer-flow

### Task 7: Kopieer-knoppen in friend-day, gewired naar copy-date-sheet → createEntry

**Files:**
- Modify: `src/js/views/friend-day.js`

- [ ] **Step 1: Update meal-section render om kopieer-knoppen te tonen bij `share_level='entries'`**

In `friend-day.js`, in de meal-rendering: voeg een "Kopieer"-knop toe aan elke meal-header (alleen als de meal entries heeft) en aan elke entry-row.

Vervang het meal-rendering blok:

```javascript
  let mealsHtml = '';
  if (day.share_level === 'per_meal' || day.share_level === 'entries') {
    const perMeal = day.per_meal || {};
    const entries = day.entries || [];
    const showCopy = day.share_level === 'entries';
    mealsHtml = MEAL_ORDER.map(meal => {
      const sum = perMeal[meal] || 0;
      const items = entries.filter(e => e.meal_type === meal);
      const mealCopyBtn = (showCopy && items.length > 0)
        ? `<button class="meal-copy-btn" data-meal="${meal}">Kopieer</button>`
        : '';
      return `
        <section class="meal-section">
          <header class="meal-header">
            <span class="meal-title">${MEAL_LABELS[meal]}</span>
            <span class="meal-sum">${sum === 0 ? '' : sum}</span>
            ${mealCopyBtn}
          </header>
          ${items.map(e => `
            <div class="entry-row entry-row-readonly" data-entry-idx="${entries.indexOf(e)}">
              <div class="entry-info">
                <div class="entry-name">${escapeHtml(e.product_name)}</div>
                <div class="entry-meta">${Math.round(e.amount_grams)}g · ${e.kcal} kcal</div>
              </div>
              ${showCopy ? `<button class="entry-copy-btn" data-entry-idx="${entries.indexOf(e)}">Kopieer</button>` : ''}
            </div>
          `).join('')}
        </section>
      `;
    }).join('');
  }
```

- [ ] **Step 2: Voeg event listeners toe na het content.innerHTML-assign**

Net vóór de sluitende `}` van `render()`, voeg toe:

```javascript
  if (day.share_level === 'entries') {
    const entries = day.entries || [];

    content.querySelectorAll('.entry-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.entryIdx, 10);
        const entry = entries[idx];
        if (!entry) return;
        await runCopy(handle, [entry], MEAL_LABELS[entry.meal_type] + ' entry');
      });
    });

    content.querySelectorAll('.meal-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const meal = btn.dataset.meal;
        const items = entries.filter(e => e.meal_type === meal);
        if (items.length === 0) return;
        await runCopy(handle, items, MEAL_LABELS[meal]);
      });
    });
  }
```

- [ ] **Step 3: Voeg `runCopy`-helper toe binnen het bestand**

Voeg onderin `friend-day.js` (vóór `function escapeHtml`):

```javascript
async function runCopy(handle, items, label) {
  const { open: openCopySheet } = await import('./components/copy-date-sheet.js');
  const { createEntry } = await import('../db/entries.js');
  const { showToast } = await import('../ui.js');

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
```

- [ ] **Step 4: Manuele test**

Live Server. Zorg dat je een vriend hebt met `share_level='entries'` en een dag met entries.
- Open friend dag-view → zie "Kopieer"-knop op elke meal-header met entries en op elke entry-row
- Lege maaltijd: geen meal-header-knop
- Tap entry-knop → bottom-sheet → bevestig met vandaag → toast verschijnt
- Open eigen Vandaag-tab → entry van piet staat nu in jouw lunch
- Tap meal-copy → alle entries in die meal worden gekopieerd; toast toont aantal
- Wijzig datum in picker → entry verschijnt op die datum in eigen Historie

- [ ] **Step 5: Commit**

```bash
git add src/js/views/friend-day.js
git commit -m "Wire per-entry and per-meal copy from friend-day to createEntry"
```

---

## Phase 8 — Friend week-view

### Task 8: Implementeer `friend-week.js`

**Files:**
- Modify: `src/js/views/friend-week.js`

- [ ] **Step 1: Vervang placeholder met echte implementatie**

Volledige nieuwe inhoud van `src/js/views/friend-week.js`:

```javascript
import { getFriendPeriod } from '../db/friendships.js';
import { heroState, todayIso } from '../calc.js';
import {
  parseIso, isoDate, weekStart, addDays, formatWeekRangeNl,
} from '../utils/dates.js';
import { navigate } from '../router.js';
import { mount as mountFriendHeader } from './components/friend-header.js';

const DAY_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export async function render(container, params) {
  const friendId = params?.id;
  if (!friendId) { navigate('#/friends'); return; }

  const today = parseIso(todayIso());
  const anchor = params?.anchor ? parseIso(params.anchor) : today;
  const start = weekStart(anchor);
  const end = addDays(start, 6);
  const startIso = isoDate(start);
  const endIso = isoDate(end);

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let period;
  try {
    period = await getFriendPeriod(friendId, startIso, endIso);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon vriend niet laden: ${err.message}</p>`;
    return;
  }

  const handle = period.handle || 'Vriend';
  const friendCreatedIso = period.friend_created_at;

  container.innerHTML = `
    <div id="friend-header-slot"></div>
    <div id="friend-week-content"></div>
  `;

  mountFriendHeader(
    container.querySelector('#friend-header-slot'),
    { friendId, handle, currentView: 'week', anchor: isoDate(anchor) }
  );

  const content = container.querySelector('#friend-week-content');

  if (period.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:32px;text-align:center;">${escapeHtml(handle)} deelt geen voortgang.</p>`;
    return;
  }

  const days = period.days || [];
  const maxBarValue = Math.max(
    1,
    ...days.map(d => Math.max(d.total_kcal || 0, d.max || 0, d.target || 0))
  );

  const prevAnchor = addDays(anchor, -7);
  const nextAnchor = addDays(anchor, 7);
  const prevWeekStart = weekStart(prevAnchor);
  const nextWeekStart = weekStart(nextAnchor);
  const prevDisabled = friendCreatedIso && isoDate(prevWeekStart) < friendCreatedIso
    ? isoDate(addDays(prevWeekStart, 6)) < friendCreatedIso  // whole prev week before friend's first day
    : false;
  const nextDisabled = isoDate(nextWeekStart) > todayIso();

  const barsHtml = days.map((d, i) => {
    const totalKcal = d.total_kcal || 0;
    const target = d.target;
    const max = d.max;
    let stateClass = 'bar-grey';
    if (target != null && max != null) {
      const s = heroState(totalKcal, target, max);
      stateClass = `bar-${s}`;
    }
    const heightPct = Math.round((totalKcal / maxBarValue) * 100);
    const beforeFriend = friendCreatedIso && d.date < friendCreatedIso;
    return `
      <button class="period-bar ${stateClass} ${beforeFriend ? 'period-bar-disabled' : ''}"
              data-date="${d.date}"
              ${beforeFriend ? 'disabled' : ''}>
        <span class="period-bar-fill" style="height: ${heightPct}%"></span>
        <span class="period-bar-label">${DAY_LABELS[i]}</span>
      </button>
    `;
  }).join('');

  content.innerHTML = `
    <div class="period-nav">
      <button class="period-nav-btn" id="prev-week" ${prevDisabled ? 'disabled' : ''}>‹</button>
      <p class="page-subtitle" style="margin:0 1rem;">${formatWeekRangeNl(start)}</p>
      <button class="period-nav-btn" id="next-week" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div class="period-bars">${barsHtml}</div>
  `;

  const prevBtn = content.querySelector('#prev-week');
  const nextBtn = content.querySelector('#next-week');
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => {
      navigate(`#/friend-week?id=${encodeURIComponent(friendId)}&anchor=${isoDate(prevAnchor)}`);
    });
  }
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/friend-week?id=${encodeURIComponent(friendId)}&anchor=${isoDate(nextAnchor)}`);
    });
  }
  content.querySelectorAll('.period-bar').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const d = btn.dataset.date;
      navigate(`#/friend-day?id=${encodeURIComponent(friendId)}&date=${d}`);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: Manuele test**

Live Server. Open friend-day, tap "Week" toggle → friend-week-view rendert:
- Header met handle + Dag/Week/Maand toggle (Week actief)
- Week-titel (bv. "21 t/m 27 apr")
- 7 bars (ma–zo) gekleurd volgens hero-state van die dag
- Klik op bar → friend-day op die datum
- ‹ schuift week 7 dagen terug (gedisabled als hele vorige week vóór vriend's `created_at`)
- › schuift week 7 dagen vooruit (gedisabled als nieuwe week voorbij vandaag)
- `share_level='none'` test: vriend zet share_level op `none` → "deelt geen voortgang"

- [ ] **Step 3: Commit**

```bash
git add src/js/views/friend-week.js
git commit -m "Implement friend week-view with bars + navigation"
```

---

## Phase 9 — Friend month-view

### Task 9: Implementeer `friend-month.js`

**Files:**
- Modify: `src/js/views/friend-month.js`

- [ ] **Step 1: Vervang placeholder met echte implementatie**

Volledige nieuwe inhoud van `src/js/views/friend-month.js`:

```javascript
import { getFriendPeriod } from '../db/friendships.js';
import { heroState, todayIso } from '../calc.js';
import {
  parseIso, isoDate, monthStart, monthEnd, addMonthsKeepDay, formatMonthNl,
} from '../utils/dates.js';
import { navigate } from '../router.js';
import { mount as mountFriendHeader } from './components/friend-header.js';

export async function render(container, params) {
  const friendId = params?.id;
  if (!friendId) { navigate('#/friends'); return; }

  const today = parseIso(todayIso());
  const anchor = params?.anchor ? parseIso(params.anchor) : today;
  const start = monthStart(anchor);
  const end = monthEnd(anchor);
  const startIso = isoDate(start);
  const endIso = isoDate(end);

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let period;
  try {
    period = await getFriendPeriod(friendId, startIso, endIso);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon vriend niet laden: ${err.message}</p>`;
    return;
  }

  const handle = period.handle || 'Vriend';
  const friendCreatedIso = period.friend_created_at;

  container.innerHTML = `
    <div id="friend-header-slot"></div>
    <div id="friend-month-content"></div>
  `;

  mountFriendHeader(
    container.querySelector('#friend-header-slot'),
    { friendId, handle, currentView: 'month', anchor: isoDate(anchor) }
  );

  const content = container.querySelector('#friend-month-content');

  if (period.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:32px;text-align:center;">${escapeHtml(handle)} deelt geen voortgang.</p>`;
    return;
  }

  const days = period.days || [];
  const maxBarValue = Math.max(
    1,
    ...days.map(d => Math.max(d.total_kcal || 0, d.max || 0, d.target || 0))
  );

  const prevAnchor = addMonthsKeepDay(anchor, -1);
  const nextAnchor = addMonthsKeepDay(anchor, 1);
  const prevMonthStart = monthStart(prevAnchor);
  const nextMonthStart = monthStart(nextAnchor);
  const prevDisabled = friendCreatedIso && isoDate(monthEnd(prevAnchor)) < friendCreatedIso;
  const nextDisabled = isoDate(nextMonthStart) > todayIso();

  const barsHtml = days.map(d => {
    const totalKcal = d.total_kcal || 0;
    const target = d.target;
    const max = d.max;
    let stateClass = 'bar-grey';
    if (target != null && max != null) {
      const s = heroState(totalKcal, target, max);
      stateClass = `bar-${s}`;
    }
    const heightPct = Math.round((totalKcal / maxBarValue) * 100);
    const beforeFriend = friendCreatedIso && d.date < friendCreatedIso;
    const dayNumber = d.date.slice(8); // "DD"
    return `
      <button class="period-bar period-bar-month ${stateClass} ${beforeFriend ? 'period-bar-disabled' : ''}"
              data-date="${d.date}"
              ${beforeFriend ? 'disabled' : ''}>
        <span class="period-bar-fill" style="height: ${heightPct}%"></span>
        <span class="period-bar-label">${dayNumber}</span>
      </button>
    `;
  }).join('');

  content.innerHTML = `
    <div class="period-nav">
      <button class="period-nav-btn" id="prev-month" ${prevDisabled ? 'disabled' : ''}>‹</button>
      <p class="page-subtitle" style="margin:0 1rem;">${formatMonthNl(start)}</p>
      <button class="period-nav-btn" id="next-month" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div class="period-bars period-bars-month">${barsHtml}</div>
  `;

  const prevBtn = content.querySelector('#prev-month');
  const nextBtn = content.querySelector('#next-month');
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => {
      navigate(`#/friend-month?id=${encodeURIComponent(friendId)}&anchor=${isoDate(prevAnchor)}`);
    });
  }
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/friend-month?id=${encodeURIComponent(friendId)}&anchor=${isoDate(nextAnchor)}`);
    });
  }
  content.querySelectorAll('.period-bar').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const d = btn.dataset.date;
      navigate(`#/friend-day?id=${encodeURIComponent(friendId)}&date=${d}`);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: Manuele test**

Live Server. Open friend-day → tap "Maand" → friend-month rendert:
- Header met Maand actief
- Maand-titel (bv. "April 2026")
- 28-31 bars genummerd 1, 2, 3...
- Klik op bar → friend-day op die datum
- ‹ schuift maand terug; gedisabled als hele vorige maand vóór vriend's `created_at`
- › schuift maand vooruit; gedisabled als nieuwe maand voorbij vandaag

- [ ] **Step 3: Commit**

```bash
git add src/js/views/friend-month.js
git commit -m "Implement friend month-view with bars + navigation"
```

---

## Phase 10 — CSS

### Task 10: Styles voor friend-header, period-bars, kopieer-knoppen, copy-date-sheet

**Files:**
- Modify: `src/css/style.css`

- [ ] **Step 1: Voeg styles toe aan eind van `style.css`**

```css
/* === Friend-header (sub-project D-vervolg) === */
.friend-view-toggle {
  display: flex;
  background: var(--surface, #1a1a1a);
  border-radius: 8px;
  padding: 4px;
  gap: 4px;
  margin: 8px 0 16px;
}
.friend-view-toggle button {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-muted, #888);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.friend-view-toggle button.active {
  background: var(--accent, #4ade80);
  color: #000;
  font-weight: 600;
}

/* === Friend-day ‹ › navigatie === */
.day-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px 0 16px;
}
/* (.day-nav-btn styling bestaat al voor eigen day-view; hergebruik) */

/* === Kopieer-knoppen in friend-day === */
.meal-copy-btn,
.entry-copy-btn {
  background: transparent;
  border: 1px solid var(--accent, #4ade80);
  color: var(--accent, #4ade80);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  margin-left: auto;
}
.meal-copy-btn:hover,
.entry-copy-btn:hover {
  background: rgba(74, 222, 128, 0.1);
}
.entry-row-readonly {
  display: flex;
  align-items: center;
}
.entry-row-readonly .entry-info {
  flex: 1;
}

/* === Copy-date-sheet bottom-sheet === */
.copy-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.copy-sheet {
  background: var(--surface, #1a1a1a);
  width: 100%;
  max-width: 480px;
  padding: 16px 20px 24px;
  border-radius: 16px 16px 0 0;
  animation: copy-sheet-rise 200ms ease-out;
}
@keyframes copy-sheet-rise {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.copy-sheet-handle {
  width: 40px;
  height: 4px;
  background: var(--text-muted, #444);
  border-radius: 2px;
  margin: 0 auto 16px;
}
.copy-sheet-title {
  font-size: 16px;
  margin: 0 0 12px;
}
.copy-sheet-date {
  width: 100%;
  background: var(--bg, #0d0d0d);
  border: 1px solid var(--border, #2a2a2a);
  color: var(--text, #eaeaea);
  padding: 12px;
  border-radius: 8px;
  font-size: 16px;
  margin-bottom: 16px;
}
.copy-sheet-actions {
  display: flex;
  gap: 8px;
}
.copy-sheet-cancel,
.copy-sheet-confirm {
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  border: none;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}
.copy-sheet-cancel {
  background: var(--bg, #0d0d0d);
  color: var(--text-muted, #888);
}
.copy-sheet-confirm {
  background: var(--accent, #4ade80);
  color: #000;
  font-weight: 600;
}

/* === Period bars (week/month) — gedeeld met eigen historie waar mogelijk === */
.period-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px 0 16px;
}
.period-nav-btn {
  background: transparent;
  border: none;
  color: var(--text, #eaeaea);
  font-size: 24px;
  padding: 8px 16px;
  cursor: pointer;
}
.period-nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.period-bars {
  display: flex;
  gap: 6px;
  align-items: flex-end;
  height: 200px;
  padding: 12px 0;
}
.period-bars-month {
  gap: 2px;
  height: 180px;
}
.period-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  background: transparent;
  border: none;
  cursor: pointer;
  position: relative;
  height: 100%;
  padding: 0;
}
.period-bar:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}
.period-bar-fill {
  width: 100%;
  border-radius: 2px 2px 0 0;
  background: var(--bar-color, #4ade80);
  transition: height 200ms ease-out;
}
.period-bar.bar-green   { --bar-color: #4ade80; }
.period-bar.bar-orange  { --bar-color: #fb923c; }
.period-bar.bar-red     { --bar-color: #ef4444; }
.period-bar.bar-grey    { --bar-color: #444; }
.period-bar-label {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-top: 4px;
}
.period-bar-month .period-bar-label {
  font-size: 9px;
}
```

**Verificatie (al gedaan tijdens spec-review):** eigen `history.js` gebruikt `.period-nav`, `.period-arrow`, `.period-title`, `.period-stats` — nieuw `.period-bar` / `.bar-green` etc. botsen niet. `.period-nav` styling hieronder hergebruikt het bestaande pattern.

- [ ] **Step 2: Manuele test**

Live Server, alle nieuwe schermen langs:
- Friend dag-view: header-toggle ziet er goed uit, ‹ ›-knoppen, kopieer-knoppen
- Bottom-sheet: opent met animatie, knoppen en input geven goed weer
- Friend week-view: bars zijn gekleurd, weeknav werkt
- Friend month-view: 28-31 smalle bars, maandnav werkt

- [ ] **Step 3: Commit**

```bash
git add src/css/style.css
git commit -m "Add styles for friend-header, period-bars, copy buttons, copy-date-sheet"
```

---

## Phase 11 — Service worker + docs

### Task 11: SW cache bump + CHANGELOG + ROADMAP

**Files:**
- Modify: `src/sw.js`
- Modify: `docs/general/CHANGELOG.md`
- Modify: `docs/general/ROADMAP.md`

- [ ] **Step 1: Bump CACHE_NAME en voeg nieuwe modules toe**

In `src/sw.js`:
- Vervang `const CACHE_NAME = 'unfat-v6';` met `const CACHE_NAME = 'unfat-v7';`
- Voeg toe aan `STATIC_ASSETS`-array (bestaande entries gebruiken `./` prefix — match dat):
  ```javascript
  './js/views/friend-week.js',
  './js/views/friend-month.js',
  './js/views/components/friend-header.js',
  './js/views/components/copy-date-sheet.js',
  ```

- [ ] **Step 2: Update CHANGELOG**

Voeg bovenaan onder de meest-recente datum (of nieuwe `## 2026-04-29` sectie):

```markdown
## 2026-04-29

- D-vervolg: vrienden in week/maand-historie + één-klik kopiëren
  - Friend dag-view krijgt ‹ › datum-navigatie (begrensd op vriend's account-creatie)
  - Nieuwe friend week-view en friend month-view, bereikbaar via Dag/Week/Maand-toggle
  - Per-entry én per-maaltijd kopiëren vanuit friend dag-view (alleen bij `share_level=entries`)
  - Bottom-sheet date-picker bij elke kopieer-actie (default vandaag, grenzen aan eigen `created_at` en vandaag)
  - Migratie: `get_friend_day` levert entry-id, product-id en `friend_created_at`; nieuwe RPC `get_friend_period` voor week/maand-totalen
  - Route `#/friend` hernoemd naar `#/friend-day`; nieuwe routes `#/friend-week` en `#/friend-month`
  - SW cache bump v6 → v7
```

- [ ] **Step 3: Update ROADMAP**

In `docs/general/ROADMAP.md`:

1. Vervang sectie `### D. Vrienden — vervolg (scope B + C)` met een afgeslankte versie die alleen de geparkeerde items behoudt:

```markdown
### D. Vrienden — wensen (geparkeerd)
**Status:** open / lage prioriteit

- **Per-dag kopiëren** vanuit friend dag-view (workaround = 4× per-maaltijd)
- **Vergelijk-widget verfijning**: één geselecteerde "vergelijk-vriend" via Settings-dropdown of per-vriend-ster-toggle
- **Competitie-element**: "wie blijft deze week vaakst binnen z'n doel"
- **Notificeren van vriend** bij kopieer-actie
```

2. Voeg toe aan `## Afgerond ✅` tabel:

```markdown
| 2026-04-29 | D-vervolg. Vrienden in week/maand-historie (friend day/week/month-views met ‹ › nav, gedeelde Dag/Week/Maand-header), één-klik kopiëren per-entry en per-maaltijd vanuit friend dag-view met date-picker bottom-sheet, `get_friend_period` RPC) |
```

- [ ] **Step 4: Manuele test**

Live Server, hard refresh (Ctrl+Shift+R). Verwacht: in DevTools → Application → Service Workers zie `unfat-v7`. Update-prompt-toast verschijnt voor bestaande gebruikers (test door eerst v6 te laden, dan v7 te deployen — niet kritisch, dit is by-design).

- [ ] **Step 5: Commit**

```bash
git add src/sw.js docs/general/CHANGELOG.md docs/general/ROADMAP.md
git commit -m "Bump SW cache to v7 + update CHANGELOG/ROADMAP for D-vervolg"
```

---

## Phase 12 — Manuele test

### Task 12: Volledige test-checklist uit spec doorlopen

**Files:** geen (test-only)

- [ ] **Step 1: Friend dag-view ‹ › nav**
  - [ ] `›` disabled op vandaag
  - [ ] `‹` actief, navigeert naar gisteren
  - [ ] Tot vriend's `created_at`: `‹` disabled
  - [ ] Voorbij eigen `created_at` mogelijk als vriend eerder begon

- [ ] **Step 2: Dag/Week/Maand-toggle**
  - [ ] Dag → Week: anchor = huidige datum
  - [ ] Week → Dag: datum = anchor
  - [ ] Toggle zichtbaar in alle 3 friend-views

- [ ] **Step 3: Friend week-view**
  - [ ] 7 bars Mo-Su gekleurd op hero-state
  - [ ] Klik bar → friend-day op die datum
  - [ ] ‹/› schuiven 7 dagen, grenzen werken

- [ ] **Step 4: Friend maand-view**
  - [ ] 28-31 bars; ‹/› schuiven per maand

- [ ] **Step 5: Per-entry kopiëren**
  - [ ] Knop op elke entry-row bij `share_level=entries`
  - [ ] Picker → bevestig → toast + entry in eigen `entries` op die datum, juiste meal_type, juiste kcal

- [ ] **Step 6: Per-maaltijd kopiëren**
  - [ ] Geen knop bij lege meal
  - [ ] Wel knop bij gevulde meal
  - [ ] Picker → bevestig → alle entries gekopieerd; toast met aantal

- [ ] **Step 7: Date-picker grenzen**
  - [ ] Geen datum > vandaag
  - [ ] Geen datum < eigen `created_at`

- [ ] **Step 8: Conflict-handling**
  - [ ] Bestaande entries blijven; gekopieerde komen erbij
  - [ ] Swipe-undo werkt op gekopieerde entries

- [ ] **Step 9: share_level filter**
  - [ ] `entries`: kopieer-knoppen zichtbaar
  - [ ] `per_meal`: geen kopieer-knoppen, wel meal-totalen
  - [ ] `total`: alleen hero
  - [ ] `none`: "deelt geen voortgang", geen toggle (consistent met huidige)

- [ ] **Step 10: Edge cases**
  - [ ] Vriend ontvriendt mid-flow → `not_friends` exception → toast
  - [ ] Vriend wijzigt `share_level` mid-flow → cached entries werken nog, refresh toont nieuwe state
  - [ ] Vriend's `created_at` = vandaag → ‹ direct disabled
  - [ ] Vriend met handle-wijziging → header toont nieuwe handle bij refresh

- [ ] **Step 11: Bij elk gevonden defect: fix + extra commit**

Geen aparte commit voor de checklist zelf — alleen voor fixes die uit de checklist komen.

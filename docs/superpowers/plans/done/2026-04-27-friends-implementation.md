# Sub-project D — Vrienden & sociale features (basis) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouwen van scope A van sub-project D: usernames, vriendschapsverzoeken (met auto-accept bij wederzijdse intentie), per-gebruiker deel-niveau, een Vrienden-tab, een vergelijk-carousel op het dashboard, en een read-only friend dag-view voor vandaag.

**Architecture:** Eén Supabase migratie voegt `handle` + `share_level` toe aan `profiles` en introduceert een `friendships`-tabel met RLS-policies, een `my_friends`-view, en vijf `SECURITY DEFINER` RPC's (`search_users`, `send_friend_request`, `respond_friend_request`, `unfriend`, `get_friend_day`). Frontend krijgt nieuwe vanilla-JS modules in `src/js/db/`, `src/js/views/`, en `src/js/views/components/`. Geen build-step, geen geautomatiseerde tests — verificatie via Live Server in browser.

**Tech Stack:** Vanilla HTML/CSS/JS, Supabase JS SDK, PostgreSQL functies, GitHub Pages PWA met service worker cache.

**Spec:** `docs/superpowers/specs/2026-04-27-friends-design.md`

---

## File Structure

**Created:**
- `supabase/migrations/20260428_friends.sql` — schema, RLS, view, RPCs
- `src/js/db/friendships.js` — RPC client wrappers
- `src/js/views/friends.js` — Vrienden-tab (zoek + drie secties)
- `src/js/views/friend-day.js` — read-only dag-view voor een vriend
- `src/js/views/components/handle-input.js` — herbruikbaar component met live availability-check (gebruikt in onboarding én settings)
- `src/js/views/components/compare-widget.js` — swipe-carousel voor dashboard

**Modified:**
- `src/js/db/profiles.js` — `updateMyHandle`, `updateMyShareLevel`, `getProfileById` helpers
- `src/js/views/onboarding.js` — extra handle-stap
- `src/js/views/settings.js` — handle-rij + deel-niveau-rij
- `src/js/views/day.js` — render compare-widget onder hero
- `src/js/app.js` — routes voor `#/friends` en `#/friend`, uitbreiden `KNOWN_ROUTES`
- `src/js/ui.js` — 5e nav-tab + badge-rendering
- `src/css/style.css` — styles voor handle-input, friends-tab, carousel, badge, share-level segmented control
- `src/sw.js` — bump `CACHE_NAME`, voeg nieuwe modules toe aan `STATIC_ASSETS`
- `docs/general/CHANGELOG.md` — entry voor deze release
- `docs/general/ROADMAP.md` — D-A naar afgerond

---

## Decomposition

11 fasen, 18 taken. Elke taak heeft een eigen commit. Fases zijn los te leveren — na elke fase werkt de app nog (niet alle features af, maar geen broken state).

| Fase | Taken | Resultaat |
|---|---|---|
| 1. Database | T1, T2 | Schema, RLS, RPCs werken in Supabase |
| 2. Client DB-laag | T3, T4 | JS-wrappers voor RPCs en profile-extensies |
| 3. Handle-component | T5 | Herbruikbaar component met live check |
| 4. Onboarding | T6 | Nieuwe gebruikers krijgen handle-stap |
| 5. Routes + nav | T7, T8 | `#/friends` bereikbaar, 5e tab zichtbaar |
| 6. Vrienden-tab | T9 | Vrienden-tab volledig werkend (zoek, secties, modal) |
| 7. Friend dag-view | T10 | `#/friend?id=X&date=Y` rendert vriend's dag |
| 8. Compare-widget | T11, T12 | Carousel-component + integratie op dashboard |
| 9. Settings | T13 | Handle + share-level wijzigbaar in Settings |
| 10. Polish | T14, T15 | Nav-badge live, CSS-tweaks |
| 11. Release | T16, T17, T18 | SW bump, docs, manuele test |

---

## Phase 1 — Database

### Task 1: Schrijf de migratie

**Files:**
- Create: `supabase/migrations/20260428_friends.sql`

**Notitie over volgnummer:** vandaag is 2026-04-27, maar `20260427_history.sql` bestaat al. Migrations worden alfabetisch toegepast; nieuwe naam moet ná die bestaan komen → kies `20260428_friends.sql` (of `20260427z_friends.sql` als je vandaag wil committen — beide werkt).

- [ ] **Step 1: Maak het bestand**

```sql
-- Migration: friends sub-project D-A
-- Adds: profiles.handle + share_level, friendships table, my_friends view,
-- and five SECURITY DEFINER RPCs.

-- =========================================================================
-- profiles uitbreiding
-- =========================================================================
alter table public.profiles add column handle text;
alter table public.profiles add column share_level text not null default 'entries'
  check (share_level in ('none', 'total', 'per_meal', 'entries'));
alter table public.profiles add constraint profiles_handle_format
  check (handle is null or handle ~ '^[A-Za-z0-9_-]{3,20}$');
create unique index profiles_handle_lower_idx
  on public.profiles (lower(handle))
  where handle is not null;

-- =========================================================================
-- friendships tabel
-- =========================================================================
create table public.friendships (
  user_id_a uuid not null references auth.users(id) on delete cascade,
  user_id_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_id_a, user_id_b),
  check (user_id_a < user_id_b),
  check (requested_by in (user_id_a, user_id_b)),
  check (
    (status = 'accepted' and accepted_at is not null)
    or (status = 'pending' and accepted_at is null)
  )
);

alter table public.friendships enable row level security;

create policy "friendships_select_own_pair"
  on public.friendships for select
  using (auth.uid() in (user_id_a, user_id_b));

create policy "friendships_insert_as_requester"
  on public.friendships for insert
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and auth.uid() in (user_id_a, user_id_b)
  );

create policy "friendships_update_accept_only"
  on public.friendships for update
  using (
    auth.uid() in (user_id_a, user_id_b)
    and auth.uid() != requested_by
  );

create policy "friendships_delete_either_party"
  on public.friendships for delete
  using (auth.uid() in (user_id_a, user_id_b));

-- =========================================================================
-- view: my_friends — verbergt case-when uit app-code
-- =========================================================================
create view public.my_friends as
select
  case when user_id_a = auth.uid() then user_id_b else user_id_a end as friend_id,
  status,
  requested_by,
  created_at,
  accepted_at
from public.friendships
where auth.uid() in (user_id_a, user_id_b);

-- =========================================================================
-- RPC: search_users
-- =========================================================================
create or replace function public.search_users(query text)
returns table(user_id uuid, handle text, friendship_status text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.handle,
    case
      when f.status = 'accepted' then 'accepted'
      when f.status = 'pending' and f.requested_by = auth.uid() then 'pending_outgoing'
      when f.status = 'pending' and f.requested_by != auth.uid() then 'pending_incoming'
      else null
    end as friendship_status
  from public.profiles p
  left join public.friendships f
    on f.user_id_a = least(p.id, auth.uid())
   and f.user_id_b = greatest(p.id, auth.uid())
  where p.handle is not null
    and lower(p.handle) like lower(query) || '%'
    and p.id != auth.uid()
  limit 20;
$$;

grant execute on function public.search_users(text) to authenticated;

-- =========================================================================
-- RPC: send_friend_request — idempotent met auto-accept
-- =========================================================================
create or replace function public.send_friend_request(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  a uuid := least(caller, target_user_id);
  b uuid := greatest(caller, target_user_id);
  existing record;
  target_handle text;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  if caller = target_user_id then
    raise exception 'not_self';
  end if;

  select handle into target_handle from public.profiles where id = target_user_id;
  if target_handle is null then
    raise exception 'invalid_target';
  end if;

  select * into existing
  from public.friendships
  where user_id_a = a and user_id_b = b;

  if not found then
    insert into public.friendships (user_id_a, user_id_b, requested_by, status)
    values (a, b, caller, 'pending');
    return 'requested';
  elsif existing.status = 'accepted' then
    return 'already_friends';
  elsif existing.status = 'pending' and existing.requested_by = caller then
    return 'already_pending';
  elsif existing.status = 'pending' and existing.requested_by != caller then
    update public.friendships
    set status = 'accepted', accepted_at = now()
    where user_id_a = a and user_id_b = b;
    return 'auto_accepted';
  end if;

  return 'unknown';
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;

-- =========================================================================
-- RPC: respond_friend_request
-- =========================================================================
create or replace function public.respond_friend_request(other_user_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  a uuid := least(caller, other_user_id);
  b uuid := greatest(caller, other_user_id);
  existing record;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select * into existing from public.friendships
  where user_id_a = a and user_id_b = b;

  if not found then
    raise exception 'not_found';
  end if;
  if existing.status != 'pending' then
    raise exception 'not_pending';
  end if;
  if existing.requested_by = caller then
    raise exception 'cannot_respond_to_own_request';
  end if;

  if accept then
    update public.friendships
    set status = 'accepted', accepted_at = now()
    where user_id_a = a and user_id_b = b;
  else
    delete from public.friendships
    where user_id_a = a and user_id_b = b;
  end if;
end;
$$;

grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- =========================================================================
-- RPC: unfriend (idempotent — no error if missing)
-- =========================================================================
create or replace function public.unfriend(other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  a uuid := least(caller, other_user_id);
  b uuid := greatest(caller, other_user_id);
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.friendships
  where user_id_a = a and user_id_b = b;
end;
$$;

grant execute on function public.unfriend(uuid) to authenticated;

-- =========================================================================
-- RPC: get_friend_day — respect share_level
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

  select handle, share_level into v_handle, v_share_level
  from public.profiles where id = friend_user_id;

  result := jsonb_build_object(
    'share_level', v_share_level,
    'handle', v_handle
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260428_friends.sql
git commit -m "Add migration for friends: schema, RLS, view, RPCs"
```

---

### Task 2: Migratie toepassen en smoke-test

**Files:** geen (Supabase Studio of CLI).

- [ ] **Step 1: Apply migration**

Open Supabase Studio → SQL Editor → plak inhoud van `20260428_friends.sql` → Run. Of via CLI:
```bash
supabase db push
```

Verwacht: 0 errors, alle objecten aangemaakt.

- [ ] **Step 2: Smoke-test in SQL Editor**

Voer deze checks uit (vervang `<jouw_user_id>` met je eigen `auth.uid()`-waarde — vind via `select auth.uid()` na login of via Supabase Auth-tab):

```sql
-- 1. Schema check
\d public.profiles
\d public.friendships
\d public.my_friends

-- 2. Probeer search_users met lege state
select * from public.search_users('test');
-- Verwacht: 0 rijen (nog geen handles)

-- 3. Zet je eigen handle
update public.profiles set handle = 'TestKasper' where id = '<jouw_user_id>';

-- 4. Probeer een 2e fake user te zoeken (nog leeg → 0 rijen)
select * from public.search_users('a');
```

Voor end-to-end RPC-test: gebruik twee browser-tabs met verschillende accounts in Phase 6+. Voor nu volstaat schema-correctheid.

- [ ] **Step 3: Geen commit (server-side actie)**

---

## Phase 2 — Client DB-laag

### Task 3: Maak `db/friendships.js`

**Files:**
- Create: `src/js/db/friendships.js`

- [ ] **Step 1: Schrijf de wrappers**

```javascript
import { supabase } from '../supabase.js';

// Search users by handle prefix (case-insensitive). Returns up to 20 matches.
// Each row: { user_id, handle, friendship_status: null | 'pending_outgoing' | 'pending_incoming' | 'accepted' }.
export async function searchUsers(query) {
  if (!query || query.length < 1) return [];
  const { data, error } = await supabase.rpc('search_users', { query });
  if (error) throw error;
  return data || [];
}

// Send a friend request. Returns one of:
// 'requested' | 'already_pending' | 'auto_accepted' | 'already_friends'
export async function sendFriendRequest(targetUserId) {
  const { data, error } = await supabase.rpc('send_friend_request', {
    target_user_id: targetUserId,
  });
  if (error) throw error;
  return data;
}

// Accept (true) or reject (false) an incoming request from `otherUserId`.
export async function respondFriendRequest(otherUserId, accept) {
  const { error } = await supabase.rpc('respond_friend_request', {
    other_user_id: otherUserId,
    accept,
  });
  if (error) throw error;
}

// Remove a friendship or withdraw an outgoing request. Idempotent.
export async function unfriend(otherUserId) {
  const { error } = await supabase.rpc('unfriend', {
    other_user_id: otherUserId,
  });
  if (error) throw error;
}

// Read a friend's day data, scaled to their share_level.
// Returns: { share_level, handle, [target, max, total_kcal, per_meal, entries] }
export async function getFriendDay(friendUserId, day) {
  const { data, error } = await supabase.rpc('get_friend_day', {
    friend_user_id: friendUserId,
    day,
  });
  if (error) throw error;
  return data;
}

// List all my_friends rows. Returns: [{ friend_id, status, requested_by, created_at, accepted_at }]
// Note: friend_id is the OTHER user's id, regardless of who sent the request.
export async function listMyFriends() {
  const { data, error } = await supabase.from('my_friends').select('*');
  if (error) throw error;
  return data || [];
}

// Convenience: split listMyFriends() by status/direction.
export async function listFriendBuckets() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const myId = session.user.id;

  const rows = await listMyFriends();
  const accepted = [];
  const incoming = [];
  const outgoing = [];
  for (const r of rows) {
    if (r.status === 'accepted') accepted.push(r);
    else if (r.requested_by === myId) outgoing.push(r);
    else incoming.push(r);
  }
  return { accepted, incoming, outgoing };
}

// Read handles for a list of user_ids in one round-trip.
// Returns: Map<user_id, handle>
export async function getHandlesForUsers(userIds) {
  if (!userIds || userIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle')
    .in('id', userIds);
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) map.set(row.id, row.handle);
  return map;
}
```

- [ ] **Step 2: Smoke-test in browser**

Start Live Server (`src/index.html`). Open browser-console op de app. Plak:

```javascript
const m = await import('./js/db/friendships.js');
await m.searchUsers('test');   // verwacht: array (mogelijk leeg)
await m.listMyFriends();       // verwacht: array (mogelijk leeg)
```

Verwacht: geen errors, console-output is een array.

- [ ] **Step 3: Commit**

```bash
git add src/js/db/friendships.js
git commit -m "Add db/friendships.js with RPC client wrappers"
```

---

### Task 4: Uitbreiden `db/profiles.js`

**Files:**
- Modify: `src/js/db/profiles.js`

- [ ] **Step 1: Voeg drie helpers onderaan toe**

Append aan bestaande file:

```javascript
// Update only the handle for the current user. Throws on duplicate (lowercase) handle.
export async function updateMyHandle(handle) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update({ handle })
    .eq('id', session.user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Update only share_level for the current user.
// level: 'none' | 'total' | 'per_meal' | 'entries'
export async function updateMyShareLevel(level) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('profiles')
    .update({ share_level: level })
    .eq('id', session.user.id);
  if (error) throw error;
}

// Read another user's public profile fields (handle, share_level).
// Used for verifying a handle exists, or showing a friend's name.
export async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, share_level')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
```

Note: `getProfileById` werkt alleen als profiel-RLS dat toestaat. Huidige RLS staat alleen `id = auth.uid()` toe. Voor kruis-user reads gebruiken we elders `getHandlesForUsers` (uit T3) wat ook door RLS gaat — bij accepted vrienden zal dat werken via een aparte policy of via RPC.

**Belangrijk:** met de huidige `profiles_select_own` RLS-policy kunnen vrienden elkaars `handle` NIET direct lezen via `from('profiles')`. Dit moet aangepast: vrienden moeten elkaar's handle kunnen lezen (anders kun je hun naam niet tonen in lijst/widget).

Voeg in T1's migration toe (of in een follow-up tweak in T2):
```sql
create policy "profiles_select_friends_handle"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((user_id_a = auth.uid() and user_id_b = profiles.id)
          or (user_id_b = auth.uid() and user_id_a = profiles.id))
    )
  );
```

Drop eerst de oude `profiles_select_own` policy:
```sql
drop policy "profiles_select_own" on public.profiles;
```

**Action:** voeg deze 2 SQL-statements toe aan `20260428_friends.sql` ná de `friendships`-tabel-creatie maar vóór de view, en run de migratie opnieuw als T2 al gedraaid is.

- [ ] **Step 2: Migration aanpassen + opnieuw applyen**

Voeg toe aan `20260428_friends.sql` direct ná de friendships RLS-policies:

```sql
-- Overrule profiles select-policy: own row OR accepted friend's row.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own_or_friend"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((user_id_a = auth.uid() and user_id_b = profiles.id)
          or (user_id_b = auth.uid() and user_id_a = profiles.id))
    )
  );
```

Re-run migration (Supabase Studio SQL Editor, alleen deze twee statements).

- [ ] **Step 3: Smoke-test**

In browser-console:
```javascript
const p = await import('./js/db/profiles.js');
await p.getMyProfile();  // verwacht: { ..., handle: null, share_level: 'entries' }
await p.updateMyShareLevel('total');
await p.getMyProfile();  // verwacht: share_level === 'total'
await p.updateMyShareLevel('entries'); // reset naar default
```

- [ ] **Step 4: Commit**

```bash
git add src/js/db/profiles.js supabase/migrations/20260428_friends.sql
git commit -m "Extend profiles client with handle/share_level + friend-readable RLS"
```

---

## Phase 3 — Handle-input component

### Task 5: Maak `views/components/handle-input.js`

**Files:**
- Create: `src/js/views/components/handle-input.js`

Herbruikbaar component met live availability-check. Gebruikt in onboarding (T6) en settings (T17).

- [ ] **Step 1: Schrijf het component**

```javascript
import { supabase } from '../../supabase.js';

// Renders a handle-input field with live validation.
//
// container: HTMLElement to mount into
// options.initial: starting value (string, may be '')
// options.onValidityChange: (isValid: boolean, value: string|null) => void
//
// Behaviour:
// - 300ms debounce after typing
// - Validates format client-side (3-20 chars, [A-Za-z0-9_-])
// - Checks server availability via lower(handle) lookup
// - Shows inline state: idle / checking / available / taken / invalid
// - Treats user's CURRENT handle as available (no false "taken")
export function mountHandleInput(container, { initial = '', onValidityChange }) {
  container.innerHTML = `
    <input class="input handle-input" type="text" maxlength="20"
      autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="bv. Kasper" value="${escapeAttr(initial)}">
    <p class="handle-status" data-state="idle"></p>
  `;

  const input = container.querySelector('.handle-input');
  const status = container.querySelector('.handle-status');
  const FORMAT_RE = /^[A-Za-z0-9_-]{3,20}$/;

  let debounceTimer = null;
  let lastChecked = null;

  const setState = (state, msg) => {
    status.dataset.state = state;
    status.textContent = msg || '';
  };

  const validate = async () => {
    const value = input.value.trim();
    if (value === '') {
      setState('idle', '');
      onValidityChange(false, null);
      return;
    }
    if (!FORMAT_RE.test(value)) {
      setState('invalid', '3-20 tekens, alleen letters, cijfers, _ en -');
      onValidityChange(false, null);
      return;
    }
    if (value.toLowerCase() === (initial || '').toLowerCase()) {
      // Same as starting handle — count as valid (no DB hit needed)
      setState('available', 'Dit is je huidige username');
      onValidityChange(true, value);
      return;
    }
    setState('checking', 'Beschikbaarheid controleren...');
    lastChecked = value;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .ilike('handle', value)
        .limit(1);
      if (lastChecked !== value) return; // stale response
      if (error) {
        setState('invalid', 'Kon niet controleren: ' + error.message);
        onValidityChange(false, null);
        return;
      }
      if (data && data.length > 0) {
        setState('taken', 'Deze username is al in gebruik');
        onValidityChange(false, null);
      } else {
        setState('available', 'Beschikbaar');
        onValidityChange(true, value);
      }
    } catch (e) {
      if (lastChecked !== value) return;
      setState('invalid', 'Fout: ' + e.message);
      onValidityChange(false, null);
    }
  };

  input.addEventListener('input', () => {
    setState('checking', '');
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(validate, 300);
  });

  // Initial validation on mount (if there's a starting value).
  if (initial) validate();
  else onValidityChange(false, null);
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

**Important caveat:** `ilike` query needs the policy uit T4. Met de aangepaste policy (own + friends) kan deze check NIET handles van vreemden vinden — wat dus altijd "available" returnt voor unieke handles van non-friends. Dit is een **false negative**: gebruiker kan een handle proberen die al in gebruik is door een non-friend, en pas bij UPDATE krijgt hij een unique-constraint violation.

**Oplossing:** een aparte RPC `check_handle_available` met `SECURITY DEFINER` die door RLS heen kijkt. Voeg toe aan T1-migration:

```sql
create or replace function public.check_handle_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(handle) = lower(candidate)
      and id != coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;

grant execute on function public.check_handle_available(text) to authenticated;
```

Vervang in `handle-input.js` de `ilike`-query door:
```javascript
const { data, error } = await supabase.rpc('check_handle_available', { candidate: value });
if (lastChecked !== value) return;
if (error) {
  setState('invalid', 'Kon niet controleren: ' + error.message);
  onValidityChange(false, null);
  return;
}
if (data === false) {
  setState('taken', 'Deze username is al in gebruik');
  onValidityChange(false, null);
} else {
  setState('available', 'Beschikbaar');
  onValidityChange(true, value);
}
```

**Action:** voeg de RPC toe aan migration én gebruik `rpc('check_handle_available')` in plaats van `ilike` in de component.

- [ ] **Step 2: RPC toevoegen aan migration en applyen**

Append in `20260428_friends.sql` (vóór de andere RPCs of erna, maakt niet uit):

```sql
create or replace function public.check_handle_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(handle) = lower(candidate)
      and id != coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;

grant execute on function public.check_handle_available(text) to authenticated;
```

Run dat statement in Supabase Studio.

- [ ] **Step 3: Pas component aan met de RPC-call**

Vervang in `handle-input.js` de `ilike`-block met de RPC-versie hierboven.

- [ ] **Step 4: Smoke-test in test-pagina**

Maak een tijdelijke testroute in `app.js` (verwijder later):
```javascript
defineRoute('#/test-handle', async () => ({ render: async (c) => {
  const { mountHandleInput } = await import('./views/components/handle-input.js');
  c.innerHTML = '<h2>Handle test</h2><div id="hi"></div><pre id="out"></pre>';
  mountHandleInput(c.querySelector('#hi'), {
    initial: '',
    onValidityChange: (ok, val) => c.querySelector('#out').textContent = `valid=${ok} val=${val}`,
  });
}}));
```

Bezoek `#/test-handle`, type "ka" → invalid, "kas" → checking → available, "TestKasper" → taken (als T2 al je eigen handle daarop zette).

Verwijder de testroute na bevestiging.

- [ ] **Step 5: Commit**

```bash
git add src/js/views/components/handle-input.js supabase/migrations/20260428_friends.sql
git commit -m "Add handle-input component with check_handle_available RPC"
```

---

## Phase 4 — Onboarding handle-stap

### Task 6: Onboarding uitbreiden met handle-stap

**Files:**
- Modify: `src/js/views/onboarding.js`

- [ ] **Step 1: Vervang de form met een 2-staps-flow**

Vervang de inhoud van `render` met:

```javascript
import { createMyProfile, updateMyHandle } from '../db/profiles.js';
import { mountHandleInput } from './components/handle-input.js';
import { hideBottomNav } from '../ui.js';
import { navigate } from '../router.js';

export async function render(container) {
  hideBottomNav();
  let step = 1;
  let target = 2000;
  let max = 2300;
  let handleValue = null;

  function renderStep1() {
    container.innerHTML = `
      <h1 class="page-title">Welkom bij Unfat 👋</h1>
      <p class="page-subtitle">Stel je dagdoel en max in.</p>
      <form id="onboarding-form-1">
        <div class="field">
          <label class="field-label" for="target">Dagelijks streefdoel (kcal)</label>
          <input class="input" id="target" type="number" min="800" max="6000" step="50" required value="${target}" inputmode="numeric">
        </div>
        <div class="field">
          <label class="field-label" for="max">Absoluut max (kcal)</label>
          <input class="input" id="max" type="number" min="800" max="8000" step="50" required value="${max}" inputmode="numeric">
          <p class="text-muted" style="font-size:11px;margin-top:4px;">Mag overschreden worden — je krijgt dan een rode waarschuwing.</p>
        </div>
        <button class="btn" type="submit">Volgende</button>
        <p class="error" id="onb-error" hidden></p>
      </form>
    `;
    document.getElementById('onboarding-form-1').addEventListener('submit', (e) => {
      e.preventDefault();
      const error = document.getElementById('onb-error');
      error.hidden = true;
      target = parseInt(document.getElementById('target').value, 10);
      max = parseInt(document.getElementById('max').value, 10);
      if (max < target) {
        error.textContent = 'Max moet hoger zijn dan streefdoel.';
        error.hidden = false;
        return;
      }
      step = 2;
      renderStep2();
    });
  }

  function renderStep2() {
    container.innerHTML = `
      <h1 class="page-title">Kies een username</h1>
      <p class="page-subtitle">Hiermee kunnen vrienden je vinden.</p>
      <form id="onboarding-form-2">
        <div class="field">
          <label class="field-label">Username</label>
          <div id="handle-mount"></div>
        </div>
        <button class="btn" type="submit" id="finish-btn" disabled>Aan de slag</button>
        <p class="error" id="onb-error" hidden></p>
      </form>
    `;
    const finishBtn = document.getElementById('finish-btn');
    mountHandleInput(document.getElementById('handle-mount'), {
      initial: '',
      onValidityChange: (ok, val) => {
        finishBtn.disabled = !ok;
        handleValue = ok ? val : null;
      },
    });
    document.getElementById('onboarding-form-2').addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = document.getElementById('onb-error');
      error.hidden = true;
      if (!handleValue) return;
      finishBtn.disabled = true;
      finishBtn.textContent = 'Bezig...';
      try {
        await createMyProfile({ daily_target_kcal: target, daily_max_kcal: max });
        await updateMyHandle(handleValue);
        navigate('#/');
      } catch (err) {
        error.textContent = 'Kon profiel niet opslaan: ' + err.message;
        error.hidden = false;
        finishBtn.disabled = false;
        finishBtn.textContent = 'Aan de slag';
      }
    });
  }

  renderStep1();
}
```

- [ ] **Step 2: Smoke-test**

In Live Server: gebruik incognito-tab + nieuwe magic-link signup → onboarding stap 1 → Volgende → handle-stap → kies "TestUser2" → Aan de slag → komt op dashboard.

Verwacht: profile + handle aangemaakt. Check in Supabase: `select id, handle from profiles`.

- [ ] **Step 3: Commit**

```bash
git add src/js/views/onboarding.js
git commit -m "Add handle step to onboarding flow"
```

---

## Phase 5 — Routes en bottom nav

### Task 7: Routes toevoegen aan `app.js`

**Files:**
- Modify: `src/js/app.js`

- [ ] **Step 1: Voeg routes en KNOWN_ROUTES uitbreiding toe**

In de bestaande `defineRoute`-block (rond regel 7-14), voeg toe vóór `defineRoute('#/settings', ...)`:

```javascript
defineRoute('#/friends',        () => import('./views/friends.js'));
defineRoute('#/friend',         () => import('./views/friend-day.js'));
```

In `KNOWN_ROUTES` array, voeg `'#/friends'` en `'#/friend'` toe vóór `'#/settings'`:

```javascript
const KNOWN_ROUTES = ['#/login', '#/onboarding', '#/', '#/day', '#/history', '#/add', '#/add/portion', '#/add/new', '#/friends', '#/friend', '#/settings'];
```

- [ ] **Step 2: Commit**

```bash
git add src/js/app.js
git commit -m "Register #/friends and #/friend routes"
```

---

### Task 8: Bottom nav uitbreiden met Vrienden-tab + badge

**Files:**
- Modify: `src/js/ui.js`

- [ ] **Step 1: Vervang `NAV_TABS` en `renderBottomNav`**

Vervang de `NAV_TABS`-array en `renderBottomNav`-functie:

```javascript
const NAV_TABS = [
  { hash: '#/',         label: 'Home' },
  { hash: '#/add',      label: 'Voeg toe' },
  { hash: '#/history',  label: 'Historie' },
  { hash: '#/friends',  label: 'Vrienden', badgeKey: 'incomingRequests' },
  { hash: '#/settings', label: 'Settings' },
];

// Module-scoped badge state. Updated by setNavBadge() — kept in memory only,
// re-render on each renderBottomNav() call.
const navBadges = { incomingRequests: 0 };

export function setNavBadge(key, count) {
  navBadges[key] = count;
  renderBottomNav();
}

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

    const btn = document.createElement('div');
    btn.className = 'nav-item' + (isActive ? ' active' : '');
    const badgeCount = tab.badgeKey ? (navBadges[tab.badgeKey] || 0) : 0;
    const badgeHtml = badgeCount > 0 ? `<span class="nav-badge">${badgeCount}</span>` : '';
    btn.innerHTML = `<span class="nav-icon">${badgeHtml}</span>${tab.label}`;
    btn.addEventListener('click', () => navigate(tab.hash));
    nav.appendChild(btn);
  }
}
```

- [ ] **Step 2: CSS styles voor badge**

Append aan `src/css/style.css`:

```css
.nav-icon {
  position: relative;
  display: inline-block;
}
.nav-badge {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #e53935;
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  font-weight: 600;
}
```

- [ ] **Step 3: Smoke-test**

Open de app. Bottom-nav moet nu 5 tabs tonen: Home / Voeg toe / Historie / Vrienden / Settings. Tap "Vrienden" → 404-fallback (gaat terug naar `#/`) want de view-file bestaat nog niet. Dat is OK voor nu.

- [ ] **Step 4: Commit**

```bash
git add src/js/ui.js src/css/style.css
git commit -m "Add Vrienden tab to bottom nav with badge support"
```

---

## Phase 6 — Vrienden-tab

### Task 9: Vrienden-tab basis met zoeken

**Files:**
- Create: `src/js/views/friends.js`

- [ ] **Step 1: Schrijf de view**

```javascript
import { searchUsers, sendFriendRequest, listFriendBuckets, getHandlesForUsers, respondFriendRequest, unfriend } from '../db/friendships.js';
import { getMyProfile, updateMyHandle } from '../db/profiles.js';
import { mountHandleInput } from './components/handle-input.js';
import { showToast, setNavBadge } from '../ui.js';
import { navigate } from '../router.js';

export async function render(container) {
  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let profile;
  try {
    profile = await getMyProfile();
  } catch (err) {
    container.innerHTML = `<p class="error">Kon niet laden: ${err.message}</p>`;
    return;
  }
  if (!profile) {
    navigate('#/onboarding');
    return;
  }

  if (!profile.handle) {
    renderHandlePromptModal(container, async () => render(container));
    return;
  }

  await renderTab(container);
}

async function renderTab(container) {
  container.innerHTML = `
    <h1 class="page-title">Vrienden</h1>

    <div class="field">
      <input class="input" id="friend-search" type="text"
        placeholder="Zoek op username..." autocomplete="off" autocapitalize="off">
    </div>

    <div id="search-results"></div>
    <div id="incoming-section"></div>
    <div id="outgoing-section"></div>
    <div id="friends-section"></div>
  `;

  const searchInput = container.querySelector('#friend-search');
  const resultsDiv = container.querySelector('#search-results');
  let debounceTimer = null;

  searchInput.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const q = searchInput.value.trim();
    if (q.length < 1) { resultsDiv.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await searchUsers(q);
        renderSearchResults(resultsDiv, results, () => render(container));
      } catch (err) {
        resultsDiv.innerHTML = `<p class="error">${err.message}</p>`;
      }
    }, 300);
  });

  await renderSections(container);
}

function renderSearchResults(div, results, refresh) {
  if (results.length === 0) {
    div.innerHTML = `<p class="text-muted" style="padding: 8px 0;">Geen resultaten.</p>`;
    return;
  }
  div.innerHTML = `
    <h3 style="font-size:14px;margin-top:16px;">Zoekresultaten</h3>
    <ul class="friend-list">
      ${results.map(r => `
        <li class="friend-row" data-user-id="${r.user_id}">
          <span class="friend-handle">${escapeHtml(r.handle)}</span>
          ${renderActionForStatus(r.friendship_status)}
        </li>
      `).join('')}
    </ul>
  `;
  div.querySelectorAll('.friend-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.closest('.friend-row').dataset.userId;
      btn.disabled = true;
      btn.textContent = 'Bezig...';
      try {
        const result = await sendFriendRequest(userId);
        if (result === 'requested') showToast('Verzoek verstuurd');
        else if (result === 'auto_accepted') showToast('Jullie zijn nu vrienden');
        else if (result === 'already_pending') showToast('Verzoek staat al uit');
        else if (result === 'already_friends') showToast('Jullie zijn al vrienden');
        await refresh();
      } catch (err) {
        showToast('Fout: ' + err.message);
      }
    });
  });
}

function renderActionForStatus(status) {
  if (status === 'accepted') return `<span class="text-muted">Vrienden</span>`;
  if (status === 'pending_outgoing') return `<span class="text-muted">Verzoek verstuurd</span>`;
  if (status === 'pending_incoming') return `<span class="text-muted">Heeft jou een verzoek gestuurd</span>`;
  return `<button class="btn-secondary friend-add-btn">Toevoegen</button>`;
}

async function renderSections(container) {
  let buckets, handleMap;
  try {
    buckets = await listFriendBuckets();
    const allIds = [
      ...buckets.accepted.map(r => r.friend_id),
      ...buckets.incoming.map(r => r.friend_id),
      ...buckets.outgoing.map(r => r.friend_id),
    ];
    handleMap = await getHandlesForUsers(allIds);
  } catch (err) {
    return;
  }

  // Update nav badge
  setNavBadge('incomingRequests', buckets.incoming.length);

  renderIncoming(container.querySelector('#incoming-section'), buckets.incoming, handleMap, () => render(container));
  renderOutgoing(container.querySelector('#outgoing-section'), buckets.outgoing, handleMap, () => render(container));
  renderFriends(container.querySelector('#friends-section'), buckets.accepted, handleMap, () => render(container));
}

function renderIncoming(div, rows, handleMap, refresh) {
  if (rows.length === 0) { div.innerHTML = ''; return; }
  div.innerHTML = `
    <h3 style="font-size:14px;margin-top:24px;">Inkomende verzoeken (${rows.length})</h3>
    <ul class="friend-list">
      ${rows.map(r => `
        <li class="friend-row" data-user-id="${r.friend_id}">
          <span class="friend-handle">${escapeHtml(handleMap.get(r.friend_id) || '?')}</span>
          <span class="friend-actions">
            <button class="btn-icon accept-btn" title="Accepteren">✓</button>
            <button class="btn-icon reject-btn" title="Weigeren">✗</button>
          </span>
        </li>
      `).join('')}
    </ul>
  `;
  div.querySelectorAll('.accept-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.closest('.friend-row').dataset.userId;
      try {
        await respondFriendRequest(userId, true);
        showToast('Verzoek geaccepteerd');
        await refresh();
      } catch (err) { showToast('Fout: ' + err.message); }
    });
  });
  div.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.closest('.friend-row').dataset.userId;
      try {
        await respondFriendRequest(userId, false);
        showToast('Verzoek geweigerd');
        await refresh();
      } catch (err) { showToast('Fout: ' + err.message); }
    });
  });
}

function renderOutgoing(div, rows, handleMap, refresh) {
  if (rows.length === 0) { div.innerHTML = ''; return; }
  div.innerHTML = `
    <h3 style="font-size:14px;margin-top:24px;">Verstuurde verzoeken (${rows.length})</h3>
    <ul class="friend-list">
      ${rows.map(r => `
        <li class="friend-row" data-user-id="${r.friend_id}">
          <span class="friend-handle">${escapeHtml(handleMap.get(r.friend_id) || '?')}</span>
          <button class="btn-secondary withdraw-btn">Intrekken</button>
        </li>
      `).join('')}
    </ul>
  `;
  div.querySelectorAll('.withdraw-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.closest('.friend-row').dataset.userId;
      try {
        await unfriend(userId);
        showToast('Ingetrokken');
        await refresh();
      } catch (err) { showToast('Fout: ' + err.message); }
    });
  });
}

function renderFriends(div, rows, handleMap, refresh) {
  if (rows.length === 0) {
    div.innerHTML = `
      <h3 style="font-size:14px;margin-top:24px;">Vrienden (0)</h3>
      <p class="text-muted">Vind je vrienden via hun username om elkaars voortgang te zien.</p>
    `;
    return;
  }
  div.innerHTML = `
    <h3 style="font-size:14px;margin-top:24px;">Vrienden (${rows.length})</h3>
    <ul class="friend-list">
      ${rows.map(r => `
        <li class="friend-row friend-clickable" data-user-id="${r.friend_id}">
          <span class="friend-handle">${escapeHtml(handleMap.get(r.friend_id) || '?')}</span>
          <button class="btn-icon remove-btn" title="Verwijderen">⋯</button>
        </li>
      `).join('')}
    </ul>
  `;
  div.querySelectorAll('.friend-clickable').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn')) return;
      const userId = row.dataset.userId;
      navigate(`#/friend?id=${userId}`);
    });
  });
  div.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const userId = btn.closest('.friend-row').dataset.userId;
      const handle = handleMap.get(userId) || '?';
      if (!confirm(`${handle} verwijderen als vriend?`)) return;
      try {
        await unfriend(userId);
        showToast('Verwijderd');
        await refresh();
      } catch (err) { showToast('Fout: ' + err.message); }
    });
  });
}

function renderHandlePromptModal(container, onDone) {
  container.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Kies eerst een username</h2>
        <p class="text-muted">Vrienden kunnen je vinden via deze naam.</p>
        <div id="handle-mount"></div>
        <button class="btn" id="modal-save-btn" disabled>Opslaan</button>
        <p class="error" id="modal-error" hidden></p>
      </div>
    </div>
  `;
  const saveBtn = container.querySelector('#modal-save-btn');
  let handleValue = null;
  mountHandleInput(container.querySelector('#handle-mount'), {
    initial: '',
    onValidityChange: (ok, val) => {
      saveBtn.disabled = !ok;
      handleValue = ok ? val : null;
    },
  });
  saveBtn.addEventListener('click', async () => {
    if (!handleValue) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';
    try {
      await updateMyHandle(handleValue);
      onDone();
    } catch (err) {
      const error = container.querySelector('#modal-error');
      error.textContent = 'Fout: ' + err.message;
      error.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Opslaan';
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: CSS toevoegen voor friend-list, btn-icon, en modal**

Append aan `src/css/style.css`:

```css
.friend-list {
  list-style: none;
  padding: 0;
  margin: 8px 0;
}
.friend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #1a1a20;
  border-radius: 8px;
  margin-bottom: 6px;
}
.friend-clickable { cursor: pointer; }
.friend-handle {
  font-weight: 500;
  font-size: 15px;
}
.friend-actions {
  display: flex;
  gap: 4px;
}
.btn-icon {
  background: transparent;
  border: 1px solid #333;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  font-size: 16px;
  cursor: pointer;
  color: #ddd;
}
.btn-icon:hover { background: #2a2a30; }

.handle-status[data-state="checking"] { color: #888; font-size: 12px; }
.handle-status[data-state="available"] { color: #4caf50; font-size: 12px; }
.handle-status[data-state="taken"],
.handle-status[data-state="invalid"] { color: #e53935; font-size: 12px; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 100;
}
.modal {
  background: #1a1a20;
  border-radius: 12px;
  padding: 24px;
  max-width: 360px;
  width: 100%;
}
.modal h2 {
  margin: 0 0 8px;
  font-size: 18px;
}
.modal .btn { margin-top: 16px; }
```

- [ ] **Step 3: Smoke-test**

Open `#/friends`. Verwacht:
- Als bestaande user zonder handle: modal verschijnt → kies handle → modal sluit, tab toont leeg.
- Als user met handle: titel + zoekveld + lege secties.
- Type in zoekveld "test" → debounced search → resultaten verschijnen of "geen resultaten".

Test met 2 accounts (incognito):
- Account A zoekt B → "Toevoegen" → verzoek staat uit
- B opent Vrienden-tab → ziet inkomend verzoek → ✓ → vriend in lijst, badge teller op tab

- [ ] **Step 4: Commit**

```bash
git add src/js/views/friends.js src/css/style.css
git commit -m "Add Vrienden-tab with search, requests, friends list, handle-prompt modal"
```

---

## Phase 7 — Friend dag-view

### Task 10: Friend dag-view

**Files:**
- Create: `src/js/views/friend-day.js`

- [ ] **Step 1: Schrijf de view**

```javascript
import { getFriendDay } from '../db/friendships.js';
import { heroState, todayIso } from '../calc.js';
import { parseIso, formatDayLongNl } from '../utils/dates.js';
import { navigate, getQueryParams } from '../router.js';

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
  const back = `<button class="back-btn" id="back-btn">‹ Vrienden</button>`;

  if (day.share_level === 'none') {
    container.innerHTML = `
      ${back}
      <h1 class="page-title">${escapeHtml(handle)}</h1>
      <p class="page-subtitle">${formatDayLongNl(date)}</p>
      <p class="text-muted" style="margin-top:32px;text-align:center;">${escapeHtml(handle)} deelt geen voortgang.</p>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => navigate('#/friends'));
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

  container.innerHTML = `
    ${back}
    <h1 class="page-title">${escapeHtml(handle)}</h1>
    <p class="page-subtitle">${formatDayLongNl(date)}</p>

    <div class="hero hero-${state}">
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-num">${heroNum}</div>
      ${target ? `<div class="hero-bar"><div class="hero-bar-fill" style="width: ${barPct}%"></div></div>` : ''}
      ${target ? `<div class="hero-meta"><span>${totalKcal} gehad</span>${max ? `<span>max ${max}</span>` : ''}</div>` : ''}
    </div>

    ${mealsHtml}
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('#/friends'));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: CSS voor back-btn en read-only entry**

Append aan `src/css/style.css`:

```css
.back-btn {
  background: transparent;
  border: none;
  color: #5cb6ff;
  font-size: 14px;
  padding: 4px 0;
  cursor: pointer;
}
.entry-row-readonly {
  cursor: default;
  opacity: 0.95;
}
.entry-row-readonly .entry-chevron { display: none; }
```

- [ ] **Step 3: Smoke-test**

Met 2 accounts: A bevriend met B. A open `#/friend?id=<B_uuid>` (uit Vrienden-tab tap). Test elke share_level:
- B: Settings → share_level=`none` → A refresht → toont "B deelt geen voortgang"
- B: share_level=`total` → toont alleen hero met totaal
- B: share_level=`per_meal` → toont hero + 4 maaltijd-rijen met totalen, geen entries
- B: share_level=`entries` (default) → volledige inzage

- [ ] **Step 4: Commit**

```bash
git add src/js/views/friend-day.js src/css/style.css
git commit -m "Add read-only friend day-view scaled to share_level"
```

---

## Phase 8 — Compare-widget op dashboard

### Task 11: Maak `views/components/compare-widget.js`

**Files:**
- Create: `src/js/views/components/compare-widget.js`

- [ ] **Step 1: Schrijf het component**

```javascript
import { getFriendDay } from '../../db/friendships.js';
import { heroState } from '../../calc.js';
import { navigate } from '../../router.js';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_SHORT = { breakfast: 'Ontbijt', lunch: 'Lunch', dinner: 'Diner', snack: 'Snack' };

// Mount a horizontal swipe-carousel showing one card per friend.
//
// container: HTMLElement
// friends: array of { friend_id, handle } (caller resolves handles)
// dateIso: 'YYYY-MM-DD' (usually today)
//
// Lazy-fetches getFriendDay() for each friend in parallel, then renders cards.
export async function mountCompareWidget(container, friends, dateIso) {
  if (friends.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `<p class="text-muted" style="padding: 8px 0;">Vrienden laden...</p>`;

  let days;
  try {
    days = await Promise.all(friends.map(async (f) => {
      try {
        const d = await getFriendDay(f.friend_id, dateIso);
        return { friendId: f.friend_id, fallbackHandle: f.handle, ...d };
      } catch (err) {
        return { friendId: f.friend_id, fallbackHandle: f.handle, error: err.message };
      }
    }));
  } catch (err) {
    container.innerHTML = `<p class="error">Kon vrienden niet laden: ${err.message}</p>`;
    return;
  }

  container.innerHTML = `
    <div class="compare-widget">
      <div class="compare-track">
        ${days.map(renderCard).join('')}
      </div>
      ${days.length > 1 ? `
        <div class="compare-dots">
          ${days.map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}"></span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;

  const track = container.querySelector('.compare-track');
  const dots = container.querySelectorAll('.compare-dots .dot');

  // Update active dot on scroll
  if (dots.length > 0) {
    track.addEventListener('scroll', () => {
      const cardW = track.clientWidth;
      const idx = Math.round(track.scrollLeft / cardW);
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    });
  }

  // Tap card → friend dag-view
  container.querySelectorAll('.compare-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.friendId;
      navigate(`#/friend?id=${id}&date=${dateIso}`);
    });
  });
}

function renderCard(d) {
  const handle = d.handle || d.fallbackHandle || 'Vriend';
  if (d.error) {
    return `<div class="compare-card" data-friend-id="${d.friendId}">
      <div class="compare-handle">${escapeHtml(handle)}</div>
      <p class="text-muted">Kon niet laden</p>
    </div>`;
  }
  if (d.share_level === 'none') {
    return `<div class="compare-card compare-card-muted" data-friend-id="${d.friendId}">
      <div class="compare-handle">${escapeHtml(handle)}</div>
      <p class="text-muted">deelt geen voortgang</p>
    </div>`;
  }

  const target = d.target;
  const max = d.max;
  const total = d.total_kcal || 0;
  const state = (target != null && max != null) ? heroState(total, target, max) : 'green';
  const barPct = (target && target > 0) ? Math.min(100, Math.round(total / target * 100)) : 0;

  let perMealRow = '';
  if ((d.share_level === 'per_meal' || d.share_level === 'entries') && d.per_meal) {
    perMealRow = `
      <div class="compare-meals">
        ${MEAL_ORDER.map(m => `<span><b>${d.per_meal[m] || 0}</b> ${MEAL_SHORT[m]}</span>`).join('')}
      </div>
    `;
  }

  return `
    <div class="compare-card compare-state-${state}" data-friend-id="${d.friendId}">
      <div class="compare-handle">${escapeHtml(handle)}</div>
      <div class="compare-num">${total}<small> / ${target ?? '?'}</small></div>
      <div class="compare-bar"><div class="compare-bar-fill" style="width: ${barPct}%"></div></div>
      ${perMealRow}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: CSS voor de carousel**

Append aan `src/css/style.css`:

```css
.compare-widget {
  margin-top: 16px;
}
.compare-track {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  gap: 8px;
}
.compare-track::-webkit-scrollbar { display: none; }
.compare-card {
  flex: 0 0 100%;
  scroll-snap-align: start;
  background: #1a1a20;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
}
.compare-state-green  { border-left: 4px solid #4caf50; }
.compare-state-orange { border-left: 4px solid #ff9800; }
.compare-state-red    { border-left: 4px solid #e53935; }
.compare-card-muted   { opacity: 0.7; }
.compare-handle {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
}
.compare-num {
  font-size: 22px;
  font-weight: 700;
}
.compare-num small {
  font-size: 12px;
  font-weight: 400;
  color: #888;
}
.compare-bar {
  height: 6px;
  background: #2a2a30;
  border-radius: 3px;
  margin-top: 8px;
  overflow: hidden;
}
.compare-bar-fill {
  height: 100%;
  background: #5cb6ff;
}
.compare-meals {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: #aaa;
}
.compare-meals b {
  color: #ddd;
  font-weight: 600;
}
.compare-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
}
.compare-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #444;
}
.compare-dots .dot.active {
  background: #5cb6ff;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/js/views/components/compare-widget.js src/css/style.css
git commit -m "Add compare-widget swipe carousel component"
```

---

### Task 12: Compare-widget integreren in `day.js`

**Files:**
- Modify: `src/js/views/day.js`

- [ ] **Step 1: Importeer en mount widget**

Voeg bovenaan imports toe:
```javascript
import { mountCompareWidget } from './components/compare-widget.js';
import { listFriendBuckets, getHandlesForUsers } from '../db/friendships.js';
```

In de `render`-functie, ná het rendern van het meal-list HTML (na `container.innerHTML = ...`), voeg toe:

```javascript
  // Render compare-widget for friends (only on today's view, only if friends exist).
  if (isToday) {
    const widgetMount = document.createElement('div');
    widgetMount.id = 'compare-widget-mount';
    container.appendChild(widgetMount);

    try {
      const buckets = await listFriendBuckets();
      if (buckets.accepted.length > 0) {
        const ids = buckets.accepted.map(r => r.friend_id);
        const handleMap = await getHandlesForUsers(ids);
        const friends = buckets.accepted.map(r => ({
          friend_id: r.friend_id,
          handle: handleMap.get(r.friend_id) || '?',
        }));
        await mountCompareWidget(widgetMount, friends, dateIso);
      } else {
        widgetMount.remove();
      }
    } catch (err) {
      console.warn('Compare widget failed:', err);
      widgetMount.remove();
    }
  }
```

- [ ] **Step 2: Smoke-test**

Met 2 accounts (A en B als vrienden):
- A opent dashboard → ziet eigen voortgang + compare-widget met B's kaart
- Swipe horizontaal werkt (als meer dan 1 vriend)
- Tap kaart → naar `#/friend?id=B&date=today`
- B is geen vriend van A → geen widget zichtbaar

- [ ] **Step 3: Commit**

```bash
git add src/js/views/day.js
git commit -m "Render compare-widget on today's dashboard"
```

---

## Phase 9 — Settings: handle + share-level

### Task 13: Settings uitbreiden

**Files:**
- Modify: `src/js/views/settings.js`

- [ ] **Step 1: Vervang `render`**

Vervang de hele `render`-functie inhoud (laat `escapeHtml` onderaan staan):

```javascript
import { getMyProfile, updateMyProfile, updateMyHandle, updateMyShareLevel } from '../db/profiles.js';
import { signOut } from '../auth.js';
import { supabase } from '../supabase.js';
import { showToast } from '../ui.js';
import { navigate } from '../router.js';
import { mountHandleInput } from './components/handle-input.js';

const SHARE_LABELS = {
  none:     'Niets',
  total:    'Totaal',
  per_meal: 'Per maaltijd',
  entries:  'Alles',
};

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

  if (!profile) { navigate('#/onboarding'); return; }

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

    <hr style="margin:32px 0;border:0;border-top:1px solid #333;">

    <h2 style="font-size:16px;margin:0 0 12px;">Username</h2>
    <p class="text-muted" style="font-size:12px;margin-bottom:12px;">
      Vrienden kunnen je vinden via deze naam.
    </p>
    <div id="handle-mount"></div>
    <button class="btn-secondary btn" id="handle-save-btn" disabled>Username opslaan</button>

    <hr style="margin:32px 0;border:0;border-top:1px solid #333;">

    <h2 style="font-size:16px;margin:0 0 12px;">Wat deel je met vrienden</h2>
    <div class="segmented" id="share-level-seg">
      ${Object.keys(SHARE_LABELS).map(level => `
        <button type="button" data-level="${level}"
          class="seg-btn${profile.share_level === level ? ' active' : ''}">
          ${SHARE_LABELS[level]}
        </button>
      `).join('')}
    </div>

    <hr style="margin:32px 0;border:0;border-top:1px solid #333;">

    <button class="btn-secondary btn" id="signout-btn">Uitloggen</button>

    <p class="text-muted" style="font-size:11px;text-align:center;margin-top:32px;">
      ${escapeHtml(session.user.email)}<br>
      Geregistreerd op ${created}
    </p>
  `;

  // Goal save
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
    btn.disabled = true; btn.textContent = 'Bezig...';
    try {
      await updateMyProfile({ daily_target_kcal: target, daily_max_kcal: max });
      showToast('Opgeslagen');
      btn.disabled = false; btn.textContent = 'Opslaan';
    } catch (err) {
      error.textContent = 'Kon niet opslaan: ' + err.message;
      error.hidden = false;
      btn.disabled = false; btn.textContent = 'Opslaan';
    }
  });

  // Handle change
  let handleValue = null;
  const handleSaveBtn = document.getElementById('handle-save-btn');
  mountHandleInput(document.getElementById('handle-mount'), {
    initial: profile.handle || '',
    onValidityChange: (ok, val) => {
      // Don't enable Save when value equals current (no-op)
      const changed = val && val !== profile.handle;
      handleSaveBtn.disabled = !(ok && changed);
      handleValue = (ok && changed) ? val : null;
    },
  });
  handleSaveBtn.addEventListener('click', async () => {
    if (!handleValue) return;
    handleSaveBtn.disabled = true;
    handleSaveBtn.textContent = 'Bezig...';
    try {
      await updateMyHandle(handleValue);
      showToast('Username bijgewerkt');
      profile.handle = handleValue;
      handleSaveBtn.textContent = 'Username opslaan';
    } catch (err) {
      showToast('Fout: ' + err.message);
      handleSaveBtn.disabled = false;
      handleSaveBtn.textContent = 'Username opslaan';
    }
  });

  // Share level segmented
  document.querySelectorAll('#share-level-seg .seg-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const level = btn.dataset.level;
      try {
        await updateMyShareLevel(level);
        document.querySelectorAll('#share-level-seg .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showToast('Bijgewerkt');
      } catch (err) {
        showToast('Fout: ' + err.message);
      }
    });
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    try { await signOut(); navigate('#/login'); }
    catch (err) { showToast('Uitloggen mislukt'); }
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 2: CSS voor segmented**

Append aan `src/css/style.css`:

```css
.segmented {
  display: flex;
  gap: 4px;
  background: #1a1a20;
  padding: 4px;
  border-radius: 8px;
}
.seg-btn {
  flex: 1;
  background: transparent;
  border: none;
  padding: 8px 4px;
  color: #aaa;
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
}
.seg-btn.active {
  background: #5cb6ff;
  color: #0f0f12;
  font-weight: 600;
}
```

- [ ] **Step 3: Smoke-test**

In Settings:
- Wijzig handle → live check → Save → toast
- Klik elke share-level → segmented switcht → toast
- Test impact: B wijzigt naar `none` → A's compare-widget toont "deelt geen voortgang" na refresh

- [ ] **Step 4: Commit**

```bash
git add src/js/views/settings.js src/css/style.css
git commit -m "Add handle + share-level controls to Settings"
```

---

## Phase 10 — Polish

### Task 14: Initialiseer nav-badge bij app-start

**Files:**
- Modify: `src/js/app.js`

Bij app-load moet de badge-counter al worden gevuld zodat nieuwe gebruikers met inkomende verzoeken meteen het rode bolletje zien — niet pas na bezoek aan Vrienden-tab.

- [ ] **Step 1: Initialisatie toevoegen**

In `app.js`, ná de `applySessionRouting()` call in de IIFE (rond regel 73), voeg toe:

```javascript
  // Initialize nav badge — best-effort; failure is non-fatal.
  try {
    const { listFriendBuckets } = await import('./db/friendships.js');
    const { setNavBadge } = await import('./ui.js');
    const buckets = await listFriendBuckets();
    setNavBadge('incomingRequests', buckets.incoming.length);
  } catch (e) {
    // ignore — user may not be logged in or table may not exist yet
  }
```

- [ ] **Step 2: Smoke-test**

Account A stuurt verzoek aan B. B opent app (dashboard, niet Vrienden-tab). Verwacht: rode badge "1" op Vrienden-tab direct zichtbaar.

- [ ] **Step 3: Commit**

```bash
git add src/js/app.js
git commit -m "Initialize friends-tab badge counter on app start"
```

---

### Task 15: CSS-polish voor handle-input + general

**Files:**
- Modify: `src/css/style.css`

- [ ] **Step 1: Handle-input style refinement**

Append aan `src/css/style.css`:

```css
.handle-input {
  font-family: inherit;
  letter-spacing: 0.5px;
}
.handle-status {
  margin: 4px 0 0;
  min-height: 16px;
  font-size: 12px;
}
```

- [ ] **Step 2: Verifier met blote oog**

Open onboarding, settings, vrienden-tab. Check uitlijning, kleur-states (groen/rood/grijs), modal-spacing. Tweak naar smaak.

- [ ] **Step 3: Commit**

```bash
git add src/css/style.css
git commit -m "Polish handle-input and general spacing"
```

---

## Phase 11 — Release

### Task 16: Service worker cache bumpen

**Files:**
- Modify: `src/sw.js`

- [ ] **Step 1: Bump CACHE_NAME en voeg nieuwe modules toe**

Wijzig regel 4:
```javascript
const CACHE_NAME = 'unfat-v5';
```

Voeg toe aan `STATIC_ASSETS` (alfabetisch geordend tussen bestaande paths):

```javascript
  './js/db/friendships.js',
  './js/views/friends.js',
  './js/views/friend-day.js',
  './js/views/components/handle-input.js',
  './js/views/components/compare-widget.js',
```

- [ ] **Step 2: Commit**

```bash
git add src/sw.js
git commit -m "Bump SW cache to v5 for friends release"
```

---

### Task 17: CHANGELOG en ROADMAP bijwerken

**Files:**
- Modify: `docs/general/CHANGELOG.md`
- Modify: `docs/general/ROADMAP.md`

- [ ] **Step 1: CHANGELOG entry toevoegen**

Lees eerst de bestaande CHANGELOG om de stijl te matchen. Voeg een nieuwe entry bovenaan toe onder een nieuwe of bestaande datum-header voor 2026-04-27 (of latere datum bij implementatie):

```markdown
## 2026-04-27

- Vrienden & sociale features (basis): username/handle, vriendschapsverzoeken met auto-accept bij wederzijdse intentie, per-gebruiker deel-niveau (niets / totaal / per maaltijd / alles), Vrienden-tab met zoek+inkomend+uitgaand+lijst, vergelijk-carousel op dashboard, read-only friend dag-view.
```

- [ ] **Step 2: ROADMAP item D verplaatsen naar Afgerond**

In `docs/general/ROADMAP.md`:
- Verwijder of verkort het hele "### D. Vrienden & sociale features" blok bovenaan. Als alleen scope A af is en B/C openblijven: pas de tekst aan om alleen B en C als open te tonen.
- Voeg in de "## Afgerond ✅" tabel een nieuwe rij toe:

```markdown
| 2026-04-27 | D-A. Vrienden basis (handle, verzoeken met auto-accept, deel-niveau, vergelijk-carousel, read-only friend dag-view) |
```

Concreet: vervang in het D-blok de afgevinkte items met een D2-blok dat alleen scope B en C beschrijft:

```markdown
### D. Vrienden — vervolg (scope B + C)
**Status:** open

- **Scope B**: vrienden in week/maand-historie. Friend dag-view ‹ › navigatie. Historie-tab met vriend-context.
- **Scope C**: maaltijden / producten overnemen van vrienden (één-klik kopiëren). Competitie-element.
```

- [ ] **Step 3: Commit**

```bash
git add docs/general/CHANGELOG.md docs/general/ROADMAP.md
git commit -m "Update CHANGELOG and ROADMAP for friends release (D-A)"
```

---

### Task 18: Finale manuele test sweep

**Files:** geen.

- [ ] **Step 1: Voer alle items uit "Manuele testchecklist" in spec uit**

Volg `docs/superpowers/specs/2026-04-27-friends-design.md` sectie "Manuele testchecklist". Vink elk item af. Bij regressie: maak een nieuwe taak (extra task in dit plan) om te fixen vóór release.

Test minimaal met 2 accounts (incognito-tab + reguliere tab).

- [ ] **Step 2: Push naar GitHub Pages (productie)**

```bash
git push origin main
```

GitHub Pages deploy volgt automatisch. Wacht ~1 min, open productie-URL, check:
- Service worker update-toast verschijnt (bij bestaande gebruikers met SW v4) → tap "Vernieuwen"
- Nieuwe Vrienden-tab zichtbaar
- Bestaande gebruiker zonder handle → modal verschijnt bij eerste tap op Vrienden-tab

- [ ] **Step 3: Update memory met release-bevestiging**

Geen commit nodig — eindstaat van het sub-project.

---

## Self-Review (uitgevoerd)

**Spec coverage:**
- Datamodel (profiles uitbreiding, friendships, view) → T1
- Friend-readable RLS-policy op profiles → T4 (toegevoegd in migration)
- Alle 6 RPCs (search_users, send_friend_request, respond_friend_request, unfriend, get_friend_day, check_handle_available) → T1, T5
- Auto-accept bij wederzijdse intentie → T1 (PL/pgSQL logica), T9 (UI-toast)
- Username regex 3-20 + lowercase uniciteit → T1 (CHECK + index), T5 (client-side validatie)
- Onboarding handle-stap → T6
- Bestaande user handle-prompt modal → T9 (renderHandlePromptModal)
- Vrienden-tab met zoek + 3 secties → T9
- Friend dag-view scaled naar share_level → T10
- Compare-widget swipe-carousel op dashboard → T11, T12
- Settings: handle + share_level → T13
- Bottom nav 5e tab + badge → T8, T14
- SW cache bump → T16
- CHANGELOG + ROADMAP → T17
- Manuele test → T18

**Placeholder scan:** geen "TBD" of "implement later". Alle code-blokken zijn compleet.

**Type/method-consistentie:**
- `searchUsers`, `sendFriendRequest`, `respondFriendRequest`, `unfriend`, `getFriendDay`, `listMyFriends`, `listFriendBuckets`, `getHandlesForUsers` (T3) → gebruikt in T9, T10, T11, T12, T14 ✓
- `updateMyHandle`, `updateMyShareLevel`, `getProfileById` (T4) → gebruikt in T6, T9, T13 ✓
- `mountHandleInput(container, { initial, onValidityChange })` (T5) → gebruikt in T6, T9, T13 ✓
- `mountCompareWidget(container, friends, dateIso)` (T11) → gebruikt in T12 ✓
- `setNavBadge('incomingRequests', count)` (T8) → gebruikt in T9, T14 ✓
- RPC-returns van `send_friend_request`: `'requested' | 'already_pending' | 'auto_accepted' | 'already_friends'` consistent in spec, T1, T9 ✓
- `share_level` enum-waarden `'none' | 'total' | 'per_meal' | 'entries'` consistent in spec, T1, T13 ✓

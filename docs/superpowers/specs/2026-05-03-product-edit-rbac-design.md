# Sub-project J — Rollen & moderation: producten editten

**Status:** Brainstorm afgerond — klaar voor review
**Datum start:** 2026-05-03
**Bouwt voort op:** F-A (NEVO seed, ~2300 staples + user-products in shared tabel) — afgerond 2026-04-30

## Scope

Doel: een rol-systeem op `profiles` introduceren (`user` / `editor` / `admin`) zodat aangewezen gebruikers álle door-users-aangemaakte producten kunnen corrigeren — niet alleen hun eigen. Dit lost het scenario op waarin user A een typo of foute kcal in zijn product heeft, en user B (of jij als beheerder) dat niet kan herstellen vandaag.

Het rol-systeem is bedoeld als fundament voor toekomstige moderation/admin-functies, niet alleen voor producten editten.

Daarnaast meegenomen: een UI-fix voor decimale stuks-invoer (`1,7 stuks`) — die hoort logisch bij dezelfde "stuks-gewicht editten kan de display van bestaande entries op 1,7 brengen"-flow.

**Niet in deze ronde** (geparkeerd):
- **NEVO-rijen editten** — `source='nevo'` blijft immutable. Later mogelijk via een override-laag (extra tabel `product_overrides`) zodat re-seeds niet je correcties wegvagen. ROADMAP-item.
- **Editor mag deleten** van andermans user-product. Vraagt soft-delete + entry-merge omdat `entries.product_id` een FK met `on delete restrict` heeft. Voor nu: editors mogen alléén editten — joke-producten kunnen ze hernoemen + corrigeren. ROADMAP-item.
- **Volledig audit-log** met voor/na waardes per edit. We doen alleen `last_edited_by` + `last_edited_at` op `products`. Een full log is later additief (extra tabel) zonder schema-breuk.
- **`unit_grams` snapshotten op entries** zodat *"2 stuks"* altijd *"2 stuks"* blijft. Voor nu accepteren we dat een unit_grams-edit oude entries naar *"1,7 stuks"* kan tonen — kcal en gram blijven sowieso intact.

## Beslissingen

### Rol-model: drie rollen op `profiles`
Eén `role`-kolom op `profiles`, default `'user'`, check-constraint op `('user','editor','admin')`. Alternatief was twee rollen (`user`/`editor`) met handmatige promotion via Supabase Dashboard — verworpen omdat een echte admin-rol breder bruikbaar is voor toekomstige moderation-features.

### Editor-rechten via extra RLS-policy, niet via vervanging
We **voegen** een update-policy toe aan `products` die editors/admins toestaat user-producten te wijzigen, en laten de bestaande `products_update_own_user_only` ongemoeid. Postgres OR't update-policies, dus aanmakers behouden hun rechten op hun eigen producten en editors/admins krijgen er bovenop rechten op alle user-producten.

Reden: minimal blast radius — de bestaande policy hoeft niet te veranderen, en het is duidelijk in de migration wat er nieuw is.

### Admin-functies via SECURITY DEFINER RPC's, niet via extra RLS op `profiles`
Twee server-side functies:
- `list_users_for_admin()` → `(id, handle, role)` voor alle profielen met handle.
- `set_user_role(target_user_id uuid, new_role text)` → update `profiles.role`.

Beide checken eerst of de caller `role='admin'` heeft, anders `raise exception 'forbidden'`.

Reden: `profiles` heeft strakke RLS (alleen self + friends). Een admin-policy erop bouwen ("zie alle profielen als je admin bent") werkt wel maar maakt de tabel-policies complexer en kruist met de friends-logica. Een aparte RPC met expliciete admin-check is leesbaarder en isoleert admin-gedrag.

### Light edit-trail op `products`, geen aparte log-tabel
Twee kolommen: `last_edited_by` (FK auth.users, `on delete set null`) en `last_edited_at` (timestamptz, nullable). Worden via een **server-side trigger** ingevuld op elke update — zo kan een client deze velden niet liegen of vergeten.

Reden: voldoende voor de huidige schaal (handvol users, jij kent iedereen). Een full audit-log met voor/na is een extra tabel + UI om te bekijken; nu te zwaar. Puur additief uitbreidbaar als de behoefte ontstaat.

### Eerste admin handmatig via SQL, daarna via app
Eenmalige bootstrap voor jezelf:
```sql
update public.profiles set role = 'admin' where id = '<jouw-user-id>';
```
Daarna kun je in de app andere users tot editor/admin maken via *Settings → Gebruikers beheren*.

Deze procedure én eventuele toekomstige admin-procedures (rol terugzetten, user blokkeren, etc.) worden gedocumenteerd in een nieuw bestand `docs/general/OPERATIONS.md` — eerste opzet als technische handleiding voor de tool.

### Edit-knop in portion-screen, niet in zoek-resultaat
De edit-knop verschijnt in `add-food-portion.js` (potlood rechtsboven naast back-button) en is alleen zichtbaar als:
- `myProfile.role` ∈ (`editor`, `admin`)
- `product.source === 'user'` (NEVO is buiten scope)

Tap → bottom sheet met de 4 velden (`name`, `kcal_per_100g`, `unit_grams`, `synonyms`) prefilled.

Alternatief was een long-press in de zoek-resultaten — verworpen omdat dat een nieuw UI-patroon zou zijn dat we elders nog niet gebruiken, en het portion-screen sowieso al de plek is waar je product-details ziet.

### Decimale stuks-input: switch naar `type="text" inputmode="decimal"`
Twee plekken (`add-food-portion.js:59`, `edit-entry-sheet.js:44`). Reden: iOS Safari toont bij `type="number"` met NL-locale een numpad zonder komma-toets, ook al staat `inputmode="decimal"`. Met `type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]?"` werkt zowel `1,7` als `1.7` op alle apparaten. JS-parser handelt al beide af (`replace(',', '.')`).

## Datamodel

Migration: `supabase/migrations/20260503000000_user_roles_and_product_edit.sql`

```sql
-- 1. role on profiles (default 'user')
alter table public.profiles
  add column role text not null default 'user'
  check (role in ('user', 'editor', 'admin'));

-- 2. light edit trail on products (set by trigger, not by client)
alter table public.products
  add column last_edited_by uuid references auth.users(id) on delete set null,
  add column last_edited_at timestamptz;

create or replace function public.products_set_edit_trail()
returns trigger
language plpgsql
as $$
begin
  new.last_edited_by = auth.uid();
  new.last_edited_at = now();
  return new;
end;
$$;

create trigger products_set_edit_trail
  before update on public.products
  for each row
  execute function public.products_set_edit_trail();

-- 3. extra update-policy: editors/admins may update any user-source product
create policy "products_update_user_by_editor"
  on public.products for update
  to authenticated
  using (
    source = 'user'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('editor','admin')
    )
  );

-- 4. admin RPC: list all users with a handle
create or replace function public.list_users_for_admin()
returns table (id uuid, handle text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.handle, p.role
    from public.profiles p
    where p.handle is not null
    order by p.handle;
end;
$$;

-- 5. admin RPC: set role on a target user
create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role not in ('user', 'editor', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  -- Block self-demote: an admin cannot lower or change their own role.
  -- This prevents accidentally locking the system out via the admin UI or curl.
  if target_user_id = auth.uid() then
    raise exception 'cannot change own role' using errcode = '42501';
  end if;
  update public.profiles set role = new_role where id = target_user_id;
end;
$$;

grant execute on function public.list_users_for_admin to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;
```

## Impact op bestaande functionaliteit

### Historie blijft betrouwbaar
- `entries.kcal` en `entries.amount_grams` zijn snapshots opgeslagen op de entry zelf (`src/js/db/entries.js:23-31`). Een wijziging op `products.kcal_per_100g` of `products.unit_grams` raakt deze waardes niet — historische dagtotalen blijven exact.
- De *display* in de dag-view (`src/js/views/day.js:267-275`) berekent "X stuks" wel live uit de huidige `unit_grams`. Gevolg: na een unit_grams-edit kan *"2 stuks"* getoond worden als *"1,7 stuks"*. Calorie-totaal blijft kloppen. Dit is bewust gedrag — de fix voor decimaal-input zorgt dat 1,7 een geldige weergave is.

### `getMyProfile()` returnt automatisch `role`
`src/js/db/profiles.js:5-17` doet `select('*')` — geen client-side wijziging nodig om het nieuwe veld te lezen.

### Service worker cache moet bumped
`src/sw.js` `CACHE_NAME` van `unfat-v26` → `unfat-v27`, omdat HTML/JS wijzigen.

## UI-flow

### a. Editen vanuit portion-screen
**File:** `src/js/views/add-food-portion.js`

- Render: potlood-knop `✏️` rechtsboven (naast back-button), conditioneel op `myProfile.role` ∈ (`editor`,`admin`) én `product.source === 'user'`.
- Tap → opent `openEditProductSheet(product, onSave)` — nieuw component in `src/js/views/components/edit-product-sheet.js`.
- Sheet bevat 4 velden:
  - `name` (text, required)
  - `kcal_per_100g` (number, > 0)
  - `unit_grams` (number, > 0, leeg = niet-stukbaar)
  - `synonyms` (textarea, comma-separated, optioneel)
- Save-knop → `updateProduct(id, {name, kcal_per_100g, unit_grams, synonyms})` → toast *"Bijgewerkt"* + portion-screen herlaadt het product zodat hero meteen klopt. (Server-trigger zet `last_edited_by` en `last_edited_at` automatisch.)
- Cancel-knop → close sheet zonder opslaan.

### b. Admin-screen in Settings
**File:** `src/js/views/settings.js`

- Nieuwe sectie *"Gebruikers beheren"*, alleen gerenderd als `myProfile.role === 'admin'`.
- Bij render: `listUsersForAdmin()` ophalen → tabel met `handle` + `<select>` met opties user/editor/admin (de huidige rol als geselecteerd).
- Wijzigen → `setUserRole(id, role)` + toast *"Rol bijgewerkt"*.
- Eigen rol staat erbij maar is niet wijzigbaar in de UI — én de RPC weigert het server-side ook (`raise 'cannot change own role'`). Demoten van jezelf moet bewust via SQL.

### c. Decimale stuks-input fix
**Files:** `src/js/views/add-food-portion.js:59`, `src/js/views/components/edit-entry-sheet.js:44`

- Vervang `<input type="number" min="0.1" step="0.1" inputmode="decimal" value="...">`
- Door `<input type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]?" value="...">`
- JS-parser (`parseFloat(value.replace(',', '.'))`) staat al klaar.

## Deliverables

1. `supabase/migrations/20260503000000_user_roles_and_product_edit.sql` — schema + policy + RPC's
2. `src/js/db/products.js` — `updateProduct(id, fields)` toevoegen (alleen inhoudelijke velden; trigger vult edit-trail)
3. `src/js/db/profiles.js` — `listUsersForAdmin()`, `setUserRole(id, role)` wrappers
4. `src/js/views/add-food-portion.js` — edit-knop conditioneel + decimaal-input fix
5. `src/js/views/components/edit-product-sheet.js` (nieuw) — bottom sheet
6. `src/js/views/components/edit-entry-sheet.js` — decimaal-input fix
7. `src/js/views/settings.js` — sectie *Gebruikers beheren* (admin-only)
8. `docs/general/OPERATIONS.md` (nieuw) — eerste opzet, met SQL voor admin-promote/demote en uitleg van de rollen
9. `src/sw.js` — `CACHE_NAME` bumpen
10. `docs/general/CHANGELOG.md` + `docs/general/ROADMAP.md` — entry + open-items bijwerken

## Bootstrap & rollout

1. Migration committen en `supabase db push` draaien (cloud-DB).
2. Eénmalig SQL-update voor jezelf in Supabase SQL editor:
   ```sql
   update public.profiles set role = 'admin' where id = '<jouw-id>';
   ```
3. Frontend deploy → CACHE_NAME bump zorgt voor update-toast.
4. Vanaf dat moment kun je in de app andere users tot editor/admin promoten.

Geen backfill nodig — bestaande user-products hebben simpelweg `last_edited_by = null` en `last_edited_at = null` tot de eerste edit.

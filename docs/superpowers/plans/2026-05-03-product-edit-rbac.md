# J-A: Producten editten + rol-systeem (RBAC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drie rollen op `profiles` (`user`/`editor`/`admin`), editors/admins kunnen alle `source='user'`-producten editten via een bottom sheet, admins beheren rollen via een nieuwe Settings-sectie, light edit-trail (`last_edited_by`/`last_edited_at`) via server-trigger, plus een UI-fix voor decimale stuks-invoer (1,7 stuks).

**Architecture:** Eén Postgres-migration legt schema + RLS-policy + trigger + twee SECURITY DEFINER RPC's vast. Frontend krijgt een nieuw `edit-product-sheet`-component, een edit-knop in `add-food-portion`, en een admin-only sectie in Settings. Decimaal-input fix vervangt `type="number"` door `type="text" inputmode="decimal"` op twee plekken.

**Tech Stack:** Vanilla HTML/CSS/JS PWA, Supabase (Postgres + RLS + RPC), GitHub Pages, Service Worker.

**Testing:** Codebase heeft geen geautomatiseerde tests (zie CLAUDE.md). Verificatie per task via handmatige browser-tests in Live Server (port 5500) en `supabase db push` voor de migration. Eind-test draait door de drie persona's: regular user, editor, admin.

---

## File Structure

**Created:**
- `supabase/migrations/20260503000000_user_roles_and_product_edit.sql` — schema + trigger + policy + RPC's
- `src/js/views/components/edit-product-sheet.js` — bottom sheet voor product-edit
- `docs/general/OPERATIONS.md` — eerste opzet operationele handleiding

**Modified:**
- `src/js/db/products.js` — `updateProduct(id, fields)` toevoegen
- `src/js/db/profiles.js` — `listUsersForAdmin()` + `setUserRole(id, role)` toevoegen
- `src/js/views/add-food-portion.js` — edit-knop conditioneel + decimaal-input fix
- `src/js/views/components/edit-entry-sheet.js` — decimaal-input fix
- `src/js/views/settings.js` — sectie *Gebruikers beheren* (admin-only)
- `src/sw.js` — `CACHE_NAME` bump `unfat-v26` → `unfat-v27`
- `docs/general/CHANGELOG.md` — entry voor 2026-05-03
- `docs/general/ROADMAP.md` — J-A naar Afgerond, J-B/C/D blijven open

---

## Task 1: SQL migration (schema + trigger + policy + RPC's)

**Files:**
- Create: `supabase/migrations/20260503000000_user_roles_and_product_edit.sql`

- [ ] **Step 1: Schrijf migration**

```sql
-- Migration: introduce user roles (user/editor/admin) and product edit support.
-- Adds profiles.role, products.last_edited_{by,at} via trigger, an extra
-- products update policy for editors/admins, and two admin RPCs.

-- =========================================================================
-- 1. role on profiles
-- =========================================================================
alter table public.profiles
  add column role text not null default 'user'
  check (role in ('user', 'editor', 'admin'));

-- =========================================================================
-- 2. light edit trail on products (set by trigger, not by client)
-- =========================================================================
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

-- =========================================================================
-- 3. extra update-policy: editors/admins may update any user-source product
-- =========================================================================
create policy "products_update_user_by_editor"
  on public.products for update
  to authenticated
  using (
    source = 'user'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('editor', 'admin')
    )
  );

-- =========================================================================
-- 4. admin RPC: list all profiles with a handle (caller must be admin)
-- =========================================================================
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

-- =========================================================================
-- 5. admin RPC: set role on a target user (caller must be admin, not self)
-- =========================================================================
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
  if target_user_id = auth.uid() then
    raise exception 'cannot change own role' using errcode = '42501';
  end if;
  update public.profiles set role = new_role where id = target_user_id;
end;
$$;

grant execute on function public.list_users_for_admin to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;
```

- [ ] **Step 2: Apply migration**

Run from repo root:
```bash
supabase db push
```
Expected: `Connecting...` → `Applying migration 20260503000000_user_roles_and_product_edit.sql...` → `Finished`. Geen errors.

Als `supabase` niet geïnstalleerd is, eerst de installatie-snippet uit `CLAUDE.md` draaien.

- [ ] **Step 3: Promote yourself to admin**

In Supabase Dashboard → SQL Editor:
```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = 'kasper.heijnen@insurancedata.nl');
select id, handle, role from public.profiles where role = 'admin';
```
Expected: één rij returned met `role = admin`.

- [ ] **Step 4: Smoke-test RLS in SQL Editor**

```sql
-- As admin, list_users_for_admin should return all profiles with handle:
select * from public.list_users_for_admin();

-- As admin, set_user_role for self should fail:
select public.set_user_role(auth.uid(), 'user');
-- Expected: ERROR: cannot change own role
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260503000000_user_roles_and_product_edit.sql
git commit -m "Migration: add user roles + product edit trail + admin RPCs"
```

---

## Task 2: DB-laag — `updateProduct` in products.js

**Files:**
- Modify: `src/js/db/products.js`

- [ ] **Step 1: Voeg `updateProduct` toe onderaan het bestand**

Append na de bestaande `createProduct`-functie:

```javascript
// Update an existing product. RLS allows this for the creator OR for users
// with role 'editor' or 'admin' (see migration 20260503000000). The trigger
// products_set_edit_trail fills last_edited_by/last_edited_at server-side.
export async function updateProduct(id, { name, kcal_per_100g, unit_grams, synonyms }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const patch = { name, kcal_per_100g };
  // Only include unit_grams/synonyms if provided so caller can omit them.
  if (unit_grams !== undefined) patch.unit_grams = unit_grams;
  if (synonyms !== undefined) patch.synonyms = synonyms;

  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Syntax-check via Live Server**

Open de app in Live Server en check de browser-console: er mogen geen import/syntax errors zijn (de functie is nog niet geroepen, alleen geladen).

- [ ] **Step 3: Commit**

```bash
git add src/js/db/products.js
git commit -m "Add updateProduct() wrapper for product edits"
```

---

## Task 3: DB-laag — `listUsersForAdmin` + `setUserRole` in profiles.js

**Files:**
- Modify: `src/js/db/profiles.js`

- [ ] **Step 1: Voeg twee admin-wrappers toe onderaan profiles.js**

Append na `updateMyProfile`:

```javascript
// Admin only: list all profiles with a handle. RPC enforces admin role server-side.
export async function listUsersForAdmin() {
  const { data, error } = await supabase.rpc('list_users_for_admin');
  if (error) throw error;
  return data;
}

// Admin only: change a user's role. Cannot target self (RPC blocks it).
export async function setUserRole(targetUserId, newRole) {
  const { error } = await supabase.rpc('set_user_role', {
    target_user_id: targetUserId,
    new_role: newRole,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Smoke-test via browser-console (admin user)**

In Live Server, ingelogd als admin, in de browser-console:
```javascript
const { listUsersForAdmin, setUserRole } = await import('/src/js/db/profiles.js');
console.log(await listUsersForAdmin());
```
Expected: array van objects met `{id, handle, role}`.

```javascript
try { await setUserRole((await listUsersForAdmin())[0].id /* eigen rij */, 'user'); }
catch (e) { console.log('blocked:', e.message); }
```
Expected: een error wordt gegooid waarvan `e.message` "cannot change own role" bevat.

- [ ] **Step 3: Commit**

```bash
git add src/js/db/profiles.js
git commit -m "Add listUsersForAdmin() and setUserRole() RPC wrappers"
```

---

## Task 4: Component — `edit-product-sheet.js`

**Files:**
- Create: `src/js/views/components/edit-product-sheet.js`

- [ ] **Step 1: Schrijf het component**

```javascript
import { updateProduct } from '../../db/products.js';
import { showToast } from '../../ui.js';
import { escapeHtml } from '../../utils/html.js';

// Open an edit sheet for an existing user-source product.
// product: { id, name, kcal_per_100g, unit_grams, synonyms }
// onSave: async () => void — called after successful update so caller can refresh.
export function openEditProductSheet(product, onSave) {
  if (document.querySelector('.sheet-overlay')) return;

  const synonymsCsv = (product.synonyms || []).join(', ');

  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Product bewerken">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Product bewerken</div>

      <div class="field">
        <label class="field-label" for="ep-name">Naam</label>
        <input class="input" id="ep-name" type="text" required maxlength="120" value="${escapeHtml(product.name)}">
      </div>

      <div class="field">
        <label class="field-label" for="ep-kcal">Kcal per 100 gram</label>
        <input class="input" id="ep-kcal" type="number" required min="1" max="2000" inputmode="numeric" value="${product.kcal_per_100g}">
      </div>

      <div class="field">
        <label class="field-label" for="ep-unit">Gewicht per stuk in gram (optioneel)</label>
        <input class="input" id="ep-unit" type="number" min="1" max="5000" inputmode="numeric" value="${product.unit_grams ?? ''}" placeholder="leeg = niet stukbaar">
      </div>

      <div class="field">
        <label class="field-label" for="ep-syn">Synoniemen (komma-gescheiden, optioneel)</label>
        <input class="input" id="ep-syn" type="text" value="${escapeHtml(synonymsCsv)}" placeholder="bv. boterham, snee brood">
      </div>

      <div class="sheet-actions">
        <button class="btn" id="ep-save">Opslaan</button>
        <button class="btn-secondary btn" id="ep-cancel">Annuleren</button>
      </div>
      <p class="error" id="ep-error" hidden></p>
    </div>
  `;
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#ep-cancel').addEventListener('click', close);

  overlay.querySelector('#ep-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#ep-error');
    errEl.hidden = true;

    const name = overlay.querySelector('#ep-name').value.trim();
    const kcal = parseInt(overlay.querySelector('#ep-kcal').value, 10);
    const unitRaw = overlay.querySelector('#ep-unit').value.trim();
    const synRaw = overlay.querySelector('#ep-syn').value.trim();

    if (!name) {
      errEl.textContent = 'Naam is verplicht.';
      errEl.hidden = false;
      return;
    }
    if (!Number.isFinite(kcal) || kcal < 1 || kcal > 2000) {
      errEl.textContent = 'Kcal moet tussen 1 en 2000 liggen.';
      errEl.hidden = false;
      return;
    }
    const unit_grams = unitRaw === '' ? null : parseInt(unitRaw, 10);
    if (unit_grams !== null && (!Number.isFinite(unit_grams) || unit_grams < 1 || unit_grams > 5000)) {
      errEl.textContent = 'Gewicht per stuk moet tussen 1 en 5000 liggen.';
      errEl.hidden = false;
      return;
    }
    const synonyms = synRaw === ''
      ? null
      : synRaw.split(',').map(s => s.trim()).filter(Boolean);

    const saveBtn = overlay.querySelector('#ep-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';

    try {
      await updateProduct(product.id, { name, kcal_per_100g: kcal, unit_grams, synonyms });
      showToast('Bijgewerkt');
      close();
      await onSave();
    } catch (err) {
      errEl.textContent = 'Kon niet opslaan: ' + err.message;
      errEl.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Opslaan';
    }
  });
}
```

- [ ] **Step 2: Syntax-check**

Open de app in Live Server. Browser-console moet leeg blijven (component is nog niet geïmporteerd, geen functionele test mogelijk).

- [ ] **Step 3: Commit**

```bash
git add src/js/views/components/edit-product-sheet.js
git commit -m "Add edit-product-sheet bottom sheet component"
```

---

## Task 5: View — add-food-portion: edit-knop + decimaal-input fix

**Files:**
- Modify: `src/js/views/add-food-portion.js`

- [ ] **Step 1: Importeer `getMyProfile` en `openEditProductSheet`**

Bovenaan, na de bestaande imports (regel 1-6):

```javascript
import { getMyProfile } from '../db/profiles.js';
import { openEditProductSheet } from './components/edit-product-sheet.js';
```

- [ ] **Step 2: Laad profile + bepaal of edit-knop zichtbaar is**

Vlak voor `const supportsUnits = !!product.unit_grams;` (regel 31), voeg toe:

```javascript
  let myProfile;
  try { myProfile = await getMyProfile(); }
  catch { myProfile = null; }
  const canEdit = myProfile
    && ['editor', 'admin'].includes(myProfile.role)
    && product.source === 'user';
```

- [ ] **Step 3: Render edit-knop conditioneel in view-header**

Vervang de huidige view-header div (regel 40-46) door:

```javascript
    <div class="view-header">
      <button class="btn-back" id="back-btn">←</button>
      <div>
        <h1>Hoeveelheid</h1>
        <small>${escapeHtml(product.name)}</small>
      </div>
      ${canEdit ? '<button class="btn-icon-secondary" id="edit-btn" aria-label="Product bewerken" style="margin-left:auto;">✏️</button>' : ''}
    </div>
```

- [ ] **Step 4: Decimaal-input fix op de amount input**

Vervang regel 59:
```html
    <input class="input input-large" id="amount" type="number" min="0.1" step="0.1" inputmode="decimal" value="${inputValue}">
```
door:
```html
    <input class="input input-large" id="amount" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]?" value="${inputValue}">
```

- [ ] **Step 5: Wire up edit-knop event handler**

Voeg toe direct na de back-btn-handler (na regel 80):

```javascript
  if (canEdit) {
    document.getElementById('edit-btn').addEventListener('click', () => {
      openEditProductSheet(product, async () => {
        // Re-fetch product to refresh the hero with new values.
        product = await getProduct(productId);
        // Re-render via navigate to same URL is heavy; just update hero text.
        document.querySelector('.hero-green > div:nth-child(2)').textContent = product.name;
        document.querySelector('.hero-green > div:nth-child(3)').textContent =
          `${product.kcal_per_100g} kcal per 100g${product.unit_grams ? ` · ${product.unit_grams}g per stuk` : ''}`;
      });
    });
  }
```

- [ ] **Step 6: Browser-test als admin**

Live Server (port 5500), ingelogd als admin:
1. Ga naar Toevoegen → zoek een user-product (door jezelf aangemaakt of door een testaccount).
2. Klik op het product → portion-screen opent.
3. Verifieer: potlood-icoon ✏️ rechtsboven zichtbaar.
4. Tap op potlood → bottom sheet opent met 4 velden ingevuld.
5. Wijzig de naam → Opslaan → toast *"Bijgewerkt"* + hero toont nieuwe naam.
6. Open hetzelfde product opnieuw → naam is gewijzigd.

- [ ] **Step 7: Browser-test als regular user**

In privé-venster of ander testaccount (`role='user'`):
1. Ga naar Toevoegen → kies een user-product (van iemand anders).
2. Verifieer: GEEN potlood-icoon zichtbaar in portion-screen.

- [ ] **Step 8: Browser-test decimaal-input**

In het portion-screen (mobile of mobile-emulatie):
1. Toggle naar Stuks.
2. Type `1,7` of `1.7` in het amount-veld.
3. Verifieer: preview toont *"= X kcal (1.7 stuks)"* — niet 1 of 0.

- [ ] **Step 9: Commit**

```bash
git add src/js/views/add-food-portion.js
git commit -m "Add product edit button (editor/admin) and decimal units input"
```

---

## Task 6: Component — edit-entry-sheet decimaal-input fix

**Files:**
- Modify: `src/js/views/components/edit-entry-sheet.js`

- [ ] **Step 1: Decimaal-input fix in edit-entry-sheet**

Vervang regel 44:
```html
      <input class="input" id="sheet-amount" type="number" min="0.1" step="0.1" inputmode="decimal" value="${inputValue}">
```
door:
```html
      <input class="input" id="sheet-amount" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]?" value="${inputValue}">
```

- [ ] **Step 2: Browser-test**

Live Server, ingelogd als willekeurige user:
1. Ga naar dag-view → tap op een bestaande entry van een stukbaar product (bv. ei).
2. Edit-sheet opent.
3. Type `1,7` in het amount-veld.
4. Verifieer: preview toont *"= X kcal (1.7 stuks)"*.
5. Opslaan → entry is geüpdatet met `amount_grams = 1.7 * unit_grams`.

- [ ] **Step 3: Commit**

```bash
git add src/js/views/components/edit-entry-sheet.js
git commit -m "Fix decimal units input in edit-entry-sheet (iOS Safari)"
```

---

## Task 7: View — settings.js admin-sectie

**Files:**
- Modify: `src/js/views/settings.js`

- [ ] **Step 1: Importeer admin-wrappers**

Vervang regel 1:
```javascript
import { getMyProfile, updateMyProfile, updateMyHandle, updateMyShareLevel } from '../db/profiles.js';
```
door:
```javascript
import { getMyProfile, updateMyProfile, updateMyHandle, updateMyShareLevel,
         listUsersForAdmin, setUserRole } from '../db/profiles.js';
```

- [ ] **Step 2: Voeg admin-sectie HTML toe**

Vlak voor de uitlog-`<hr>` (regel 73), voeg toe:

```javascript
    ${profile.role === 'admin' ? `
      <hr style="margin:32px 0;border:0;border-top:1px solid #333;">
      <h2 style="font-size:16px;margin:0 0 12px;">Gebruikers beheren</h2>
      <p class="text-muted" style="font-size:12px;margin-bottom:12px;">
        Editors kunnen alle door-gebruikers-aangemaakte producten bewerken. Admins kunnen rollen toekennen.
      </p>
      <div id="users-admin-mount">Laden...</div>
    ` : ''}
```

- [ ] **Step 3: Mount + render gebruikerslijst na de hoofd-render**

Voeg toe vlak voor de `signout-btn` event-handler (na de share-level loop, regel 168):

```javascript
  // Admin section: render user list with role dropdowns.
  if (profile.role === 'admin') {
    const mount = document.getElementById('users-admin-mount');
    try {
      const users = await listUsersForAdmin();
      mount.innerHTML = users.map(u => `
        <div class="user-row" data-id="${u.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span>${escapeHtml(u.handle)}</span>
          <select class="input" data-id="${u.id}" ${u.id === session.user.id ? 'disabled' : ''} style="width:auto;min-width:120px;">
            ${['user','editor','admin'].map(r =>
              `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`
            ).join('')}
          </select>
        </div>
      `).join('');
      mount.querySelectorAll('select[data-id]').forEach(sel => {
        sel.addEventListener('change', async () => {
          const id = sel.getAttribute('data-id');
          const newRole = sel.value;
          sel.disabled = true;
          try {
            await setUserRole(id, newRole);
            showToast('Rol bijgewerkt');
          } catch (err) {
            showToast('Fout: ' + err.message);
            // Revert select to previous value by re-rendering this row.
            const u = users.find(x => x.id === id);
            sel.value = u.role;
          } finally {
            sel.disabled = id === session.user.id; // keep self disabled
          }
        });
      });
    } catch (err) {
      mount.innerHTML = `<p class="error">Kon gebruikers niet laden: ${err.message}</p>`;
    }
  }
```

- [ ] **Step 4: Browser-test als admin**

Live Server, ingelogd als admin:
1. Ga naar Settings.
2. Verifieer: nieuwe sectie *"Gebruikers beheren"* zichtbaar onder share-level.
3. Verifieer: lijst toont alle users met handle.
4. Verifieer: jouw eigen rij is grijs/disabled.
5. Verander een andere user naar `editor` via dropdown → toast *"Rol bijgewerkt"*.
6. Reload → de wijziging is persisterend.

- [ ] **Step 5: Browser-test als regular user**

In privé-venster of ander testaccount (`role='user'`):
1. Ga naar Settings.
2. Verifieer: GEEN sectie *"Gebruikers beheren"* zichtbaar.

- [ ] **Step 6: Commit**

```bash
git add src/js/views/settings.js
git commit -m "Add admin user management section to Settings"
```

---

## Task 8: OPERATIONS.md — eerste opzet

**Files:**
- Create: `docs/general/OPERATIONS.md`

- [ ] **Step 1: Schrijf de doc**

```markdown
# Unfat — Operations Handbook

Operationele en admin-procedures voor Unfat. Deze handleiding groeit mee
naarmate de tool meer beheer-functies krijgt.

## Rollen

Sinds 2026-05-03 heeft `profiles.role` één van drie waardes:

- **`user`** (default): kan eigen producten aanmaken en wijzigen, eigen entries beheren.
- **`editor`**: alles wat `user` kan + alle door-gebruikers-aangemaakte producten (`source='user'`) wijzigen, ongeacht aanmaker. Kan NEVO-rijen niet aanraken.
- **`admin`**: alles wat `editor` kan + andere users tot editor/admin promoten via Settings → *Gebruikers beheren*.

NEVO-rijen (`source='nevo'`) zijn voor iedereen read-only. Editor-delete-rechten en NEVO-correcties staan op de roadmap (J-B / J-C).

## Eerste admin maken (bootstrap)

In Supabase Dashboard → SQL Editor:

```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where email = '<jouw-email>');

-- Verifieer:
select id, handle, role from public.profiles where role = 'admin';
```

Daarna kun je in de app andere admins aanwijzen via Settings.

## Iemand demoten/promoten via SQL (fallback)

Normaal gaat dit via de app, maar als de admin-UI tijdelijk stuk is:

```sql
update public.profiles set role = 'editor' where handle = '<handle>';
```

## Jezelf demoten

De `set_user_role`-RPC weigert dit server-side om accidentele lock-out te
voorkomen. Wil je het bewust toch:

```sql
update public.profiles set role = 'user' where id = auth.uid();
```

Wees voorzichtig — als je de enige admin bent, kun je de admin-UI daarna
niet meer gebruiken en moet een nieuwe admin via SQL gepromoot worden.

## Audit: wie editte welk product laatst

```sql
select p.name, p.last_edited_at, prof.handle as edited_by
  from public.products p
  left join public.profiles prof on prof.id = p.last_edited_by
 where p.last_edited_at is not null
 order by p.last_edited_at desc
 limit 50;
```

## Service worker cache bumpen

Bij elke deploy waarbij static assets wijzigen: bump `CACHE_NAME` in
`src/sw.js` (bv. `unfat-v26` → `unfat-v27`). Triggert het update-toast
mechanisme — gebruikers krijgen *"Nieuwe versie beschikbaar"* en kunnen
in 1 tap verversen.

## Supabase migrations toepassen

Vanuit repo-root:

```bash
supabase db push
```

Eerst inloggen + project linken volgens `CLAUDE.md` als de devcontainer
opnieuw is opgebouwd.
```

- [ ] **Step 2: Commit**

```bash
git add docs/general/OPERATIONS.md
git commit -m "Add OPERATIONS.md with role definitions and admin SQL recipes"
```

---

## Task 9: Final polish — CACHE_NAME, CHANGELOG, ROADMAP, end-to-end test

**Files:**
- Modify: `src/sw.js`
- Modify: `docs/general/CHANGELOG.md`
- Modify: `docs/general/ROADMAP.md`

- [ ] **Step 1: Bump CACHE_NAME**

In `src/sw.js` regel 4, vervang:
```javascript
const CACHE_NAME = 'unfat-v26';
```
door:
```javascript
const CACHE_NAME = 'unfat-v27';
```

- [ ] **Step 2: Update CHANGELOG.md**

Voeg bovenaan onder de meest recente datum-sectie een nieuwe entry toe voor `2026-05-03`. Format conform bestaande entries (zie `docs/general/CHANGELOG.md`):

```markdown
## 2026-05-03

### Added
- **Sub-project J-A — Producten editten + rol-systeem (RBAC):** drie rollen (`user`/`editor`/`admin`) op `profiles`, editors/admins kunnen alle door-gebruikers-aangemaakte producten wijzigen (NEVO blijft immutable), admin-screen in Settings voor rol-toekenning, light edit-trail (`last_edited_by`/`last_edited_at`) via server-trigger.
- `docs/general/OPERATIONS.md` — eerste opzet operationele handleiding (rol-uitleg + admin-SQL-recepten).

### Fixed
- Decimaal-input voor stuks (1,7) werkt nu betrouwbaar op iOS Safari NL-locale via `type="text" inputmode="decimal"` (`add-food-portion.js`, `edit-entry-sheet.js`).

### Migration
- `20260503000000_user_roles_and_product_edit.sql` — `profiles.role` (default `user`), `products.last_edited_by`/`last_edited_at`, edit-trail trigger, extra update-policy voor editors/admins, RPC's `list_users_for_admin()` en `set_user_role()`.
```

(Pas de exacte vorm aan op de bestaande style in CHANGELOG.md als die afwijkt.)

- [ ] **Step 3: Update ROADMAP.md**

In `docs/general/ROADMAP.md`, verplaats `### J. Rollen & moderation` van *open* naar *Afgerond*-tabel:

- Verwijder de hele `### J. Rollen & moderation`-sectie uit het open deel, MAAR behoud J-B, J-C, J-D als open vervolg-items onder een nieuw kopje:

```markdown
### J. Rollen & moderation — vervolg
**Status:** open

- **J-B**: editor mag andermans user-product **verwijderen** (vraagt soft-delete + entry-merge i.v.m. FK `on delete restrict`).
- **J-C**: NEVO-rijen corrigeerbaar via override-laag (`product_overrides`-tabel) zodat re-seeds correcties niet wegvagen.
- **J-D**: volledig audit-log met voor/na waardes per edit (extra tabel + UI).
```

- Voeg in de tabel onder `## Afgerond ✅` toe:

```markdown
| 2026-05-03 | J-A. Rollen & moderation: producten editten (rol-systeem `user`/`editor`/`admin` op `profiles`, editors/admins editen alle user-producten via portion-screen + bottom sheet, admin-rolbeheer in Settings, light edit-trail via server-trigger, decimaal-input fix voor stuks) |
```

- [ ] **Step 4: Verplaats het plan naar `plans/done/`**

```bash
mkdir -p docs/superpowers/plans/done
git mv docs/superpowers/plans/2026-05-03-product-edit-rbac.md docs/superpowers/plans/done/
```

- [ ] **Step 5: End-to-end browser-test**

Open Live Server (port 5500). Doorloop drie persona's:

**Als admin (jij):**
1. Settings → "Gebruikers beheren" zichtbaar, eigen rij disabled.
2. Promote een testaccount tot editor.
3. Add-food → kies user-product → potlood ✏️ zichtbaar → wijzig naam → opgeslagen.
4. Reload → naam is persisterend.

**Als editor (testaccount na promote):**
1. Add-food → kies user-product van een andere user → potlood ✏️ zichtbaar → wijzig kcal → opgeslagen.
2. Settings → GEEN "Gebruikers beheren"-sectie.

**Als regular user (`role='user'`):**
1. Add-food → kies user-product van een andere user → GEEN potlood-icoon.
2. Settings → GEEN "Gebruikers beheren".
3. Eigen producten kunnen edits ontvangen via Supabase Dashboard maar niet via UI (uit scope).

**Decimaal-input op alle plekken:**
4. Add-food → portion-screen → Stuks → vul `1,7` → preview toont 1.7.
5. Day-view → tap een stukbare entry → edit-sheet → vul `1,7` → preview toont 1.7.

**Update-toast:**
6. Hard reload (Ctrl-Shift-R) — nieuwe SW installeert. Bij volgende reload: toast *"Nieuwe versie beschikbaar"* zichtbaar.

- [ ] **Step 6: Commit alles tegelijk**

```bash
git add src/sw.js docs/general/CHANGELOG.md docs/general/ROADMAP.md docs/superpowers/plans/
git commit -m "Bump SW cache + finalize CHANGELOG/ROADMAP for J-A; archive plan"
```

---

## Self-Review

**Spec coverage:**
- ✅ Rol-model 3 rollen op profiles → Task 1
- ✅ RLS voor editor → Task 1
- ✅ Admin RPC's → Task 1
- ✅ Edit-trail via trigger → Task 1
- ✅ `updateProduct` wrapper → Task 2
- ✅ Admin DB-wrappers → Task 3
- ✅ Edit-product-sheet component → Task 4
- ✅ Edit-knop in portion-screen → Task 5
- ✅ Decimaal-input fix in portion-screen → Task 5
- ✅ Decimaal-input fix in edit-entry-sheet → Task 6
- ✅ Admin-screen in Settings → Task 7
- ✅ OPERATIONS.md → Task 8
- ✅ CACHE_NAME bump → Task 9
- ✅ CHANGELOG + ROADMAP-update → Task 9

**Placeholders:** geen TBD/TODO. Alle code-blokken volledig. Browser-test stappen concreet.

**Type consistency:** `updateProduct(id, fields)` signature consistent in tasks 2, 4, 5. `setUserRole(id, role)` consistent in tasks 3, 7. RPC-namen `list_users_for_admin` / `set_user_role` consistent tussen migration (Task 1) en JS-wrappers (Task 3).

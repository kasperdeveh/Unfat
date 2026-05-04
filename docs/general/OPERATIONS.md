# Unfat — Operations Handbook

Operationele en admin-procedures voor Unfat. Deze handleiding groeit mee
naarmate de tool meer beheer-functies krijgt.

## Rollen

Sinds 2026-05-03 heeft `profiles.role` één van drie waardes:

- **`user`** (default): kan eigen producten aanmaken en wijzigen, eigen entries beheren.
- **`editor`**: alles wat `user` kan + alle door-gebruikers-aangemaakte producten (`source='user'`) wijzigen, ongeacht aanmaker. Kan NEVO-rijen niet aanraken.
- **`admin`**: alles wat `editor` kan + andere users tot editor/admin promoten via Settings → *Gebruikers beheren*.

NEVO-rijen (`source='nevo'`) zijn voor iedereen read-only. Editor-delete-rechten en NEVO-correcties staan op de roadmap (J-B / J-C).

### Beperkingen van editor-rol

De RLS-policy `products_update_user_by_editor` staat editors/admins toe `source='user'`-producten te updaten. Sinds 2026-05-04 (J-E) zijn `created_by` en `source` immutable — afgedwongen door BEFORE UPDATE triggers (`products_protect_immutable`, `dishes_protect_owner`) i.p.v. een policy `with check`-subquery. Reden voor de trigger-aanpak: een `with check (col = (select col from same_table where ...))` veroorzaakt "infinite recursion in policy" omdat Postgres de SELECT-policies opnieuw moet evalueren. Triggers hebben directe OLD/NEW-toegang en kennen die beperking niet. Een vergelijkbare trigger `profiles_protect_role` houdt de `role`-kolom alleen wijzigbaar via de `set_user_role` admin-RPC. De client-wrapper `updateProduct()` in `src/js/db/products.js` stuurt nog steeds alleen `name`, `kcal_per_100g`, `unit_grams` en `synonyms` mee — defense-in-depth.

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

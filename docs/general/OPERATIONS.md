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

De RLS-policy `products_update_user_by_editor` staat editors/admins toe álle kolommen van een `source='user'`-product te updaten. De client-wrapper `updateProduct()` in `src/js/db/products.js` stuurt alleen `name`, `kcal_per_100g`, `unit_grams` en `synonyms` mee — `created_by` en `source` worden bewust NIET aangeraakt. Toekomstige callers die wel `created_by` of `source` patchen worden door RLS niet expliciet tegengehouden. Als de hoeveelheid editors groeit of als er ander client-code komt dat producten muteert: overweeg een trigger toe te voegen die niet-admins blokkeert van het wijzigen van die kolommen.

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

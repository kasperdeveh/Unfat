# Favorieten — design

**Datum:** 2026-05-04
**Sub-project:** L. Favorieten
**Status:** spec → plan

## Doel

Snelle toegang tot producten en gerechten die de gebruiker vaak eet, via handmatig pinnen (ster). De toevoegen-pagina krijgt een vierde filter-tab (`★`) die alleen gepinde items toont; ster-toggle is bereikbaar vanuit zoekresultaten en vanuit het portion-/dish-edit-scherm. Recent ("Laatst gegeten") blijft ongewijzigd.

Het primaire pijnpunt: een product als "Eiwitshake Choco" dat je 1× per maand eet (na een lange duurloop) zakt vandaag uit Recent omdat dagelijkse items het wegduwen. Met handmatig pinnen blijft het zichtbaar tot je 'm onster't.

## Scope

In:
- Twee favorieten-tabellen (producten + gerechten), elk met eigen FK en RLS
- Vierde filter-knop `★` op de toevoegen-pagina, naast Alles/Producten/Gerechten
- Ster-toggle in lijst-rijen (zoekresultaten en Favorieten-filter)
- Ster-toggle in portion-screen header (`#/add/portion`) en dish-edit (`#/dish/edit`)
- Empty state in Favorieten-filter
- SessionStorage voor filter-keuze (consistent met M)

Out of scope:
- "Vaak gegeten" / auto-frequentie-mechanisme (besloten: handmatig is voldoende; auto kan later als blijkt dat het mist)
- Quick-add bottom sheet op dashboard
- Ster-toggle vanuit friend-day view (kopiëren van een vriend's entry pin't niet automatisch)
- Sortering anders dan alfabetisch (op-pin-datum / op-laatst-gegeten zijn over-engineering voor <50 favorieten)
- Bulk-import / export van favorieten

## Datamodel

Twee aparte tabellen — geen polymorfe relatie. Postgres-best-practice: echte FKs per relatie, cascade delete, schema is zelf-documenterend.

```sql
create table public.product_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.dish_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  dish_id uuid not null references public.dishes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dish_id)
);
```

**Composite PK** `(user_id, item_id)` is tegelijk de unique-key (geen dubbele favorieten per user) én de query-index voor "alle favorieten van user X". Geen aparte `id` of unique-constraint nodig.

**Cascade delete** vangt twee scenario's automatisch:
- User account verwijderen → favorieten weg
- Product/gerecht hard-delete → bijbehorende favorieten weg

Geen update-policy — een favoriet bestaat of niet, je toggelt 'm via insert/delete.

### RLS-policies

Per tabel (alleen eigen rijen):

```sql
alter table public.product_favorites enable row level security;

create policy "select own product favorites"
  on public.product_favorites for select
  using (auth.uid() = user_id);

create policy "insert own product favorites"
  on public.product_favorites for insert
  with check (auth.uid() = user_id);

create policy "delete own product favorites"
  on public.product_favorites for delete
  using (auth.uid() = user_id);
```

Idem voor `dish_favorites` met `dish_id` ipv `product_id`.

### Migration

Filename via `date -u +%Y%m%d%H%M%S`, bv. `supabase/migrations/20260504XXXXXX_favorites.sql`.

## DB-laag

Nieuw bestand `src/js/db/favorites.js`:

```js
// Returns { productIds: Set<uuid>, dishIds: Set<uuid> } — used cold-start
// to render star-state in rows and to filter the "Favorites" tab.
export async function getMyFavorites();

// Toggles a product/dish favorite for the current user. `on` is the
// desired final state; the function inserts or deletes accordingly.
// Throws on RLS or network error.
export async function toggleProductFavorite(productId, on);
export async function toggleDishFavorite(dishId, on);
```

`getMyFavorites()` doet twee parallelle SELECTs op `product_favorites` en `dish_favorites`, gefilterd op de huidige user (RLS doet dat al, maar `.eq('user_id', session.user.id)` is goedkoop en duidelijk).

`toggleX(id, on)` doet een `insert` of `delete` afhankelijk van `on`. Bij race-conditions (twee devices ster'n tegelijk) errort de tweede insert op de PK; deze fout wordt gevangen en niet aan de gebruiker getoond — de UI is al in de juiste state.

## UI-laag

### Toevoegen-pagina (`src/js/views/add-food.js`)

**Filter-knop toevoegen.** De segmented filter krijgt een vierde optie `★`. Icon-only omdat "Favorieten" + de andere drie labels niet samen op een smal scherm passen.

```js
const FILTER_OPTIONS = [
  { key: 'all',       label: 'Alles' },
  { key: 'products',  label: 'Producten' },
  { key: 'dishes',    label: 'Gerechten' },
  { key: 'favorites', label: '★' },
];
```

Aria-label op de knop: `"Favorieten"` zodat screenreaders het icoon niet als "ster" voorlezen.

**Cold-start.** De bestaande `Promise.all` in `render()` krijgt een vijfde call:

```js
const [products, dishes, recentItems, profile, favorites] = await Promise.all([
  listProducts(),
  listDishes(),
  listRecentItemsForUser(TOP_N_DEFAULT),
  getMyProfile(),
  getMyFavorites(),
]);
```

`favorites = { productIds: Set, dishIds: Set }` wordt naar `renderItemList()` doorgegeven zodat elke rij weet of 'ie gepind is.

**Lijst-rij rendering.** Elke `meal-row` krijgt een ster-button vóór de `›`:

```html
<li class="meal-row" data-kind="product" data-id="${p.id}">
  <div>...naam + sub...</div>
  <button class="btn-fav-row" data-fav-id="${p.id}" data-fav-kind="product"
          aria-label="Favoriet" aria-pressed="${isFav}">
    ${isFav ? '★' : '☆'}
  </button>
  <span>›</span>
</li>
```

Tap-handling: één event-listener op `resultsEl` die delegeert. Voor de ster-button: `e.stopPropagation()` zodat de rij-tap niet ook afgaat. Optimistic update — meteen ster aan/uit visueel, async toggle, bij fail revert + toast.

**Favorieten-tab buildList:**

```js
if (filter === 'favorites') {
  const favProducts = allProducts.filter(p => favorites.productIds.has(p.id));
  const favDishes   = allDishes.filter(d => favorites.dishIds.has(d.id));
  // Sort by name, mix products + dishes alphabetically (case-insensitive, NL locale)
  const merged = [
    ...favProducts.map(p => ({ kind: 'product', product: p })),
    ...favDishes.map(d => ({ kind: 'dish', dish: d })),
  ].sort((a, b) => {
    const an = a.kind === 'dish' ? a.dish.name : a.product.name;
    const bn = b.kind === 'dish' ? b.dish.name : b.product.name;
    return an.localeCompare(bn, 'nl', { sensitivity: 'base' });
  });
  return { kind: 'favorites', items: merged };
}
```

Bij filter=favorites en lege lijst (en geen zoekterm) tonen we de empty state:

> "Je hebt nog geen favorieten. Tap ☆ bij een product of gerecht om er één toe te voegen."

Bij filter=favorites + zoekterm: `rankProducts(merged, q)` over alleen-favorieten — zelfde scoring als andere filters. Geeft "geen favoriet matcht je zoekterm" als de query niets oplevert.

**NEVO-chip**. Bij filter=favorites is hideNevo niet relevant (je toont alleen wat de user zelf gestard heeft, NEVO of niet). Chip wordt disabled, consistent met de bestaande disable bij filter=dishes.

**SessionStorage-key** blijft `addFoodFilter`, accepteert nu ook waarde `'favorites'`.

### Portion-screen (`src/js/views/add-food-portion.js`)

Bestaand `view-header` heeft rechts één knop (potlood, alleen voor canEdit). We voegen de ster-knop toe links van de potlood, voor élke user:

```html
<button class="btn-icon" id="fav-btn" aria-label="Favoriet" aria-pressed="${isFav}"
        style="margin-left:auto;">
  ${isFav ? '★' : '☆'}
</button>
${canEdit ? '<button class="btn-icon" id="edit-btn" ...>✏️</button>' : ''}
```

`isFav` komt uit een nieuwe `getMyFavorites()`-call die parallel naast de bestaande `getProduct()` en profile-fetch loopt. Toggle-handler doet hetzelfde als de rij-ster.

### Dish-builder (`src/js/views/dish-builder.js`)

Eén view-bestand voor zowel `#/dish/new` als `#/dish/edit?dish=…`. We zetten de ster alleen in **edit-mode** (er is dan een `dish_id`). Zelfde patroon als portion-screen: ster-knop in de header, voor élke authenticated user (mag ook een dish van een ander pinnen). Toggle gebruikt `toggleDishFavorite()`.

In create-mode wordt de knop niet gerenderd — er is nog geen `dish_id` om te ster'n.

### CSS

Nieuwe class `btn-fav-row` (rij-ster) en uitbreiding van bestaande `btn-icon` (header-ster). Specifiek:

- Geel `★` (`#ffc107`) bij gepind, grijs `☆` (`#444` / `--text-muted`) bij niet-gepind
- 44×44px tap-target (mobile), padding-based (geen vaste breedte op het icoon zelf)
- `cursor: pointer`; `transition: color 120ms` voor de toggle-feedback

## Edge cases

- **Race condition** (twee devices ster'n hetzelfde): unique PK voorkomt dubbele rij; tweede insert errort op `23505` (duplicate key) → vangen, niet tonen.
- **Toggle al gepind**: ontster't direct, geen confirm-dialog.
- **Item hard-delete** (eigen product weggegooid): cascade delete ruimt favoriet automatisch op.
- **Editor wijzigt naam** van een product dat jij gestard hebt: de favoriet blijft staan (FK is op `id`, niet op `name`); rij toont gewoon de nieuwe naam.
- **Zoeken in Favorieten-tab + 0 resultaten**: bestaande "Niets gevonden"-empty-state hergebruiken (geen aparte tekst nodig).
- **Lege Favorieten + zoekterm**: empty-state-tekst toont alleen bij lege Favorieten + lege zoekterm. Bij zoekterm gewoon "Niets gevonden".

## Performance

- Realistisch <50 favorieten per user. Geen pagination nodig.
- Twee extra cold-start `select`'s op `add-food` — beide indexed via PK, ms-snel.
- `getMyFavorites()` ook in portion-screen + dish-builder (edit-mode). In v1 hergebruiken we dezelfde full-set call; per-item-check (`.eq('user_id', …).eq('product_id', currentId)`) is mogelijk maar micro-optimalisatie.

## Bestandsimpact

**Nieuw:**
- `supabase/migrations/<ts>_favorites.sql`
- `src/js/db/favorites.js`

**Wijzigen:**
- `src/js/views/add-food.js` — vierde filter, favorites-list, rij-ster
- `src/js/views/add-food-portion.js` — header-ster
- `src/js/views/dish-builder.js` — header-ster (edit-mode)
- `src/css/style.css` — `btn-fav-row` styling (rij-ster) + ster-state-kleuren voor `btn-icon`
- `src/sw.js` — `CACHE_NAME` v32 → v33
- `docs/general/CHANGELOG.md` — entry onder 2026-05-04
- `docs/general/ROADMAP.md` — L. Favorieten naar Afgerond-tabel

## Open vragen

Geen blockers. De volgende details worden in het plan vastgelegd:

- Exacte CSS-waardes / padding voor `btn-fav-row` op mobile
- Plek van ster-knop in dish-builder-header (precieze positie t.o.v. bestaande knoppen daar)
- Of de portion-screen-ster gevuld moet zijn vóór de fetch resolved is (waarschijnlijk: hollow als default, hydraten zodra `getMyFavorites()` terug is)

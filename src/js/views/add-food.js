import { listProducts } from '../db/products.js';
import { listDishes } from '../db/dishes.js';
import { listRecentItemsForUser } from '../db/entries.js';
import { getMyProfile, updateMyHideNevo } from '../db/profiles.js';
import { getMyFavorites, toggleProductFavorite, toggleDishFavorite } from '../db/favorites.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import { escapeHtml } from '../utils/html.js';
import { normalize, rankProducts } from '../utils/product-search.js';

const TOP_N_DEFAULT = 20;
const TOP_N_SEARCH  = 50;
const RECENTS_VISIBLE = 5;

const FILTER_OPTIONS = [
  { key: 'all',       label: 'Alles' },
  { key: 'products',  label: 'Producten' },
  { key: 'dishes',    label: 'Gerechten' },
  { key: 'favorites', label: '★', ariaLabel: 'Favorieten' },
];

const MEAL_LABEL_SHORT = { breakfast: '🌅', lunch: '🥗', dinner: '🍽', snack: '🍪' };

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
        ${FILTER_OPTIONS.map(o => `<button data-filter="${o.key}" type="button"${o.ariaLabel ? ` aria-label="${o.ariaLabel}"` : ''}>${o.label}</button>`).join('')}
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
  // Filter persists for the browser session so toggling Producten/Gerechten
  // and then drilling into a row + back doesn't reset the user's choice.
  // Cleared on a fresh tab / next-day load (sessionStorage scope).
  let filter = sessionStorage.getItem('addFoodFilter') || 'all';
  let recentsExpanded = false;
  let favorites = { productIds: new Set(), dishIds: new Set() };

  try {
    const [products, dishes, recentItems, profile, favs] = await Promise.all([
      listProducts(),
      listDishes(),
      listRecentItemsForUser(TOP_N_DEFAULT),
      getMyProfile(),
      getMyFavorites(),
    ]);
    allProducts = products;
    allDishes = dishes;
    recents = recentItems;
    hideNevo = !!(profile && profile.hide_nevo);
    favorites = favs;
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
    chipEl.disabled = filter === 'dishes' || filter === 'favorites';
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
    sessionStorage.setItem('addFoodFilter', filter);
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
      chipEl.disabled = filter === 'dishes' || filter === 'favorites';
    }
  });

  function visibleProducts() {
    return hideNevo ? allProducts.filter(p => p.source !== 'nevo') : allProducts;
  }

  // Builds an array of displayable items: [{kind, name, payload}, ...]
  // Filter applies. For default-no-query view we show RECENTS for products
  // (list is too long) but on the Gerechten tab we surface ALL dishes
  // alphabetically — recents on top, the rest below — so the tab is never
  // a blank "type to search" page when the user has few dish-recents.
  function buildList(query) {
    const q = normalize(query.trim());

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

    let products = [];
    let dishes = [];
    if (filter !== 'dishes') {
      products = rankProducts(visibleProducts(), q, TOP_N_SEARCH);
    }
    if (filter !== 'products') {
      // dishes carry a `synonyms` array of ingredient names (filled by
      // listDishes), so a query like "ui" matches a dish that contains an
      // Ui-component via the same scoring path as product synonyms.
      dishes = rankProducts(allDishes, q, TOP_N_SEARCH);
    }

    const merged = [
      ...dishes.map(d => ({ kind: 'dish', dish: d })),
      ...products.map(p => ({ kind: 'product', product: p })),
    ];
    return { kind: 'search', items: merged };
  }

  function renderResults(query) {
    const built = buildList(query);
    const { kind } = built;

    // Empty-search empty-state: 'all' / 'products' / 'dishes' (when no dishes at all).
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

    if (kind === 'recents') {
      const items = built.items;
      const slice = recentsExpanded ? items : items.slice(0, RECENTS_VISIBLE);
      const hidden = items.length - slice.length;
      const moreBtn = hidden > 0
        ? `<button class="btn-more-recents" id="more-recents-btn" type="button">Meer tonen (${hidden})</button>`
        : '';
      const totalCount = (filter === 'products' ? visibleProducts().length : allDishes.length + visibleProducts().length);
      resultsEl.innerHTML =
        `<p class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 4px;">Laatst gegeten</p>` +
        renderItemList(slice) + moreBtn +
        `<p class="text-muted" style="font-size:11px;text-align:center;padding:12px 0;">Typ om te zoeken in ${totalCount} items</p>`;
    } else if (kind === 'dishes-all') {
      // Recents header + items (if any) + "Alle gerechten" header + rest.
      const recentsBlock = built.recents.length > 0
        ? `<p class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 4px;">Laatst gegeten</p>` +
          renderItemList(built.recents)
        : '';
      const remainingBlock = built.remaining.length > 0
        ? `<p class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 4px;">Alle gerechten</p>` +
          renderItemList(built.remaining)
        : '';
      resultsEl.innerHTML = recentsBlock + remainingBlock;
    } else {
      resultsEl.innerHTML = renderItemList(built.items);
    }
  }

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

  search.addEventListener('input', () => renderResults(search.value));
  renderResults('');

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
      } catch {
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

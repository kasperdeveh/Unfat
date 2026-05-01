import { listProducts } from '../db/products.js';
import { listRecentProductsForUser } from '../db/entries.js';
import { navigate } from '../router.js';

const TOP_N_DEFAULT = 20;
const TOP_N_SEARCH  = 50;

export async function render(container, params) {
  const meal = params.meal || '';
  const dateParam = params.date || '';

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

  document.getElementById('back-btn').addEventListener('click', () => {
    navigate(dateParam ? `#/day?date=${dateParam}` : '#/');
  });
  document.getElementById('new-btn').addEventListener('click', () => {
    const qs = new URLSearchParams();
    if (meal) qs.set('meal', meal);
    if (dateParam) qs.set('date', dateParam);
    const name = document.getElementById('search').value.trim();
    if (name) qs.set('name', name);
    const q = qs.toString();
    navigate(`#/add/new${q ? '?' + q : ''}`);
  });

  let allProducts = [];
  let recentProducts = [];
  try {
    [allProducts, recentProducts] = await Promise.all([
      listProducts(),
      listRecentProductsForUser(TOP_N_DEFAULT),
    ]);
  } catch (err) {
    document.getElementById('results').innerHTML =
      `<p class="error">Kon producten niet laden: ${err.message}</p>`;
    return;
  }

  const search = document.getElementById('search');
  const resultsEl = document.getElementById('results');

  function renderResults(query) {
    const q = normalize(query.trim());

    if (!q) {
      if (recentProducts.length > 0) {
        renderList(resultsEl, recentProducts, 'Laatst gegeten', allProducts.length);
      } else {
        resultsEl.innerHTML = `
          <p class="text-muted" style="padding:12px 0;">
            Typ om te zoeken in ${allProducts.length} producten — probeer: appel, brood, yoghurt
          </p>`;
      }
      return;
    }

    const scored = allProducts
      .map(p => ({ p, score: scoreQuery(p, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) =>
        b.score - a.score ||
        a.p.name.length - b.p.name.length ||
        a.p.name.localeCompare(b.p.name, 'nl'))
      .slice(0, TOP_N_SEARCH)
      .map(x => x.p);
    if (scored.length === 0) {
      resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Geen producten gevonden. Maak een nieuw product aan ↓</p>`;
      return;
    }
    renderList(resultsEl, scored, null, null);
  }

  search.addEventListener('input', () => renderResults(search.value));
  renderResults('');

  resultsEl.addEventListener('click', (e) => {
    const row = e.target.closest('.meal-row');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const qs = new URLSearchParams({ product: id });
    if (meal) qs.set('meal', meal);
    if (dateParam) qs.set('date', dateParam);
    navigate(`#/add/portion?${qs}`);
  });
}

function normalize(s) {
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
// Per-token tiers: exact > prefix+word-end > prefix+letter > word-boundary > substring; name beats synonym.
function scoreQuery(product, q) {
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

// Prefix+word-end ("Appel m schil") ranks above prefix+letter ("Appelcarre")
// so that standalone-word matches beat compound-word matches.
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

function renderList(el, products, sectionLabel, totalCount) {
  const header = sectionLabel
    ? `<p class="text-muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:8px 0 4px;">${sectionLabel}</p>`
    : '';
  const footer = totalCount != null
    ? `<p class="text-muted" style="font-size:11px;text-align:center;padding:12px 0;">Typ om te zoeken in ${totalCount} producten</p>`
    : '';
  el.innerHTML = header + `<ul class="list">${products.map(p => `
    <li class="meal-row" data-id="${p.id}">
      <div>
        <div>${escapeHtml(p.name)}</div>
        <div class="items">${p.kcal_per_100g} kcal/100g${p.unit_grams ? ` · ${p.unit_grams}g/stuk` : ''}</div>
      </div>
      <span>›</span>
    </li>
  `).join('')}</ul>` + footer;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

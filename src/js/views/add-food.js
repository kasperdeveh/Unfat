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

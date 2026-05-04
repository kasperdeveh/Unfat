import { listProducts } from '../../db/products.js';
import { getMyProfile, updateMyHideNevo } from '../../db/profiles.js';
import { showToast } from '../../ui.js';
import { escapeHtml } from '../../utils/html.js';
import { normalize, rankProducts } from '../../utils/product-search.js';

const TOP_N_SEARCH = 50;

// Open a sheet to pick (or re-edit) a single dish ingredient.
// Modes:
//   - { initial: undefined }       → search → portion → onSave({ product, amount_grams })
//   - { initial: { product, amount_grams } } → start in portion phase, show "Verwijderen"
// onSave: ({ product, amount_grams }) => void   — caller stores in dish state
// onDelete (optional): () => void               — only for re-edit mode
export function openDishComponentSheet({ initial } = {}, onSave, onDelete) {
  if (document.querySelector('.sheet-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  let allProducts = [];
  let hideNevo = false;
  let selectedProduct = initial?.product || null;
  let initialAmount = initial?.amount_grams;

  if (selectedProduct) {
    renderPortion();
  } else {
    renderSearch();
  }

  // -------------------------------------------------------------------------
  // Phase 1: search
  // -------------------------------------------------------------------------
  function renderSearch() {
    overlay.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Ingrediënt kiezen">
        <div class="sheet-handle"></div>
        <div class="sheet-title">Ingrediënt kiezen</div>

        <input class="input" id="dcs-search" type="search" placeholder="Zoek product..." autocomplete="off">

        <div class="chiprow">
          <button class="chip" id="dcs-nevo" type="button" aria-pressed="false">NEVO producten verbergen</button>
        </div>

        <div id="dcs-results" style="margin-top:8px;max-height:50vh;overflow-y:auto;">
          <p class="text-muted" style="padding:8px 0;">Laden...</p>
        </div>
      </div>
    `;

    bootstrapSearch();
  }

  async function bootstrapSearch() {
    try {
      const [products, profile] = await Promise.all([listProducts(), getMyProfile()]);
      allProducts = products;
      hideNevo = !!(profile && profile.hide_nevo);
    } catch (err) {
      overlay.querySelector('#dcs-results').innerHTML =
        `<p class="error">Kon producten niet laden: ${escapeHtml(err.message)}</p>`;
      return;
    }

    const search = overlay.querySelector('#dcs-search');
    const resultsEl = overlay.querySelector('#dcs-results');
    const chipEl = overlay.querySelector('#dcs-nevo');

    function syncChip() {
      chipEl.setAttribute('aria-pressed', String(hideNevo));
      chipEl.textContent = hideNevo ? 'NEVO producten tonen' : 'NEVO producten verbergen';
    }
    syncChip();

    chipEl.addEventListener('click', async () => {
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
        chipEl.disabled = false;
      }
    });

    function renderResults(query) {
      const q = normalize(query.trim());
      const visible = hideNevo ? allProducts.filter(p => p.source !== 'nevo') : allProducts;
      let list;
      if (!q) {
        list = visible.slice(0, TOP_N_SEARCH);
      } else {
        list = rankProducts(visible, q, TOP_N_SEARCH);
        if (list.length === 0) {
          resultsEl.innerHTML = `<p class="text-muted" style="padding:12px 0;">Geen producten gevonden</p>`;
          return;
        }
      }
      resultsEl.innerHTML = `<ul class="list">${list.map(p => `
        <li class="meal-row" data-id="${p.id}">
          <div>
            <div>${escapeHtml(p.name)}${p.source === 'nevo' ? '<span class="badge-nevo">NEVO</span>' : ''}</div>
            <div class="items">${p.kcal_per_100g} kcal/100g${p.unit_grams ? ` · ${p.unit_grams}g/stuk` : ''}</div>
          </div>
          <span>›</span>
        </li>
      `).join('')}</ul>`;
    }

    search.addEventListener('input', () => renderResults(search.value));
    renderResults('');

    resultsEl.addEventListener('click', (e) => {
      const row = e.target.closest('.meal-row');
      if (!row) return;
      const id = row.getAttribute('data-id');
      selectedProduct = allProducts.find(p => p.id === id) || null;
      if (selectedProduct) renderPortion();
    });
  }

  // -------------------------------------------------------------------------
  // Phase 2: portion
  // -------------------------------------------------------------------------
  function renderPortion() {
    const p = selectedProduct;
    const supportsUnits = !!p.unit_grams;
    let inputType = 'grams';
    let inputValue = supportsUnits ? 1 : 100;

    if (initialAmount != null) {
      // Re-edit: prefer 'units' if amount_grams is exact multiple of unit_grams.
      if (supportsUnits && initialAmount % p.unit_grams === 0) {
        inputType = 'units';
        inputValue = initialAmount / p.unit_grams;
      } else {
        inputType = 'grams';
        inputValue = initialAmount;
      }
    }

    overlay.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Portie">
        <div class="sheet-handle"></div>
        <div class="sheet-title">${escapeHtml(p.name)}</div>
        <div class="sheet-subtitle">${p.kcal_per_100g} kcal/100g${p.unit_grams ? ` · ${p.unit_grams}g/stuk` : ''}</div>

        <div class="segmented" id="dcs-type" ${supportsUnits ? '' : 'hidden'}>
          <button data-type="grams" class="${inputType === 'grams' ? 'active' : ''}">Gram</button>
          <button data-type="units" class="${inputType === 'units' ? 'active' : ''}">Stuks</button>
        </div>

        <input class="input" id="dcs-amount" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]?" value="${inputValue}">
        <div class="preview" id="dcs-preview"></div>

        <div class="sheet-actions">
          <button class="btn" id="dcs-save">${initialAmount != null ? 'Bijwerken' : 'Voeg toe'}</button>
          ${initialAmount != null ? '<button class="btn-icon-danger" id="dcs-delete" aria-label="Verwijderen">🗑</button>' : ''}
        </div>
        <p class="error" id="dcs-error" hidden></p>
      </div>
    `;

    function updatePreview() {
      const grams = inputType === 'units' ? inputValue * p.unit_grams : inputValue;
      const kcal = Math.round(grams * p.kcal_per_100g / 100);
      const unitLabel = inputType === 'units' ? (inputValue === 1 ? 'stuk' : 'stuks') : 'gram';
      overlay.querySelector('#dcs-preview').textContent = `= ${kcal} kcal (${inputValue} ${unitLabel})`;
    }
    updatePreview();

    overlay.querySelectorAll('#dcs-type button').forEach(btn => {
      btn.addEventListener('click', () => {
        inputType = btn.getAttribute('data-type');
        overlay.querySelectorAll('#dcs-type button').forEach(b =>
          b.classList.toggle('active', b === btn));
        const amt = overlay.querySelector('#dcs-amount');
        amt.value = inputType === 'units' ? 1 : 100;
        inputValue = parseFloat(amt.value);
        updatePreview();
      });
    });

    overlay.querySelector('#dcs-amount').addEventListener('input', (e) => {
      inputValue = parseFloat(e.target.value.replace(',', '.')) || 0;
      updatePreview();
    });

    overlay.querySelector('#dcs-save').addEventListener('click', () => {
      const errEl = overlay.querySelector('#dcs-error');
      errEl.hidden = true;
      if (inputValue <= 0) {
        errEl.textContent = 'Hoeveelheid moet groter dan 0 zijn.';
        errEl.hidden = false;
        return;
      }
      const amount_grams = inputType === 'units' ? inputValue * p.unit_grams : inputValue;
      close();
      onSave({ product: p, amount_grams });
    });

    if (initialAmount != null && onDelete) {
      overlay.querySelector('#dcs-delete').addEventListener('click', () => {
        close();
        onDelete();
      });
    }
  }
}

import { getProduct } from '../../db/products.js';
import { updateEntry, deleteEntry } from '../../db/entries.js';
import { calcKcal, toGrams } from '../../calc.js';
import { showToast } from '../../ui.js';

const MEAL_LABELS = { breakfast: '🌅', lunch: '🥗', dinner: '🍽', snack: '🍪' };
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];

// Open the edit sheet for an existing entry.
// onChange is called when entry was updated or deleted (so caller can reload).
export async function openEditSheet(entryId, entry, onChange) {
  // Guard against double-open: if a sheet is already in the DOM, ignore this call.
  if (document.querySelector('.sheet-overlay')) return;

  // entry: { id, amount_grams, kcal, meal_type, products: { id, name, unit_grams, kcal_per_100g } }
  // products may not have kcal_per_100g loaded — fetch full product if needed.
  let product = entry.products;
  if (!product || product.kcal_per_100g == null) {
    product = await getProduct(entry.products.id);
  }

  const supportsUnits = !!product.unit_grams;
  let inputType = supportsUnits && entry.amount_grams % product.unit_grams === 0 ? 'units' : 'grams';
  let inputValue = inputType === 'units'
    ? entry.amount_grams / product.unit_grams
    : entry.amount_grams;
  let selectedMeal = entry.meal_type;

  // Build sheet DOM
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-label="Entry bewerken">
      <div class="sheet-handle"></div>
      <div class="sheet-title">${escapeHtml(product.name)}</div>
      <div class="sheet-subtitle">${product.kcal_per_100g} kcal/100g${product.unit_grams ? ` · ${product.unit_grams}g/stuk` : ''}</div>

      <div class="segmented" id="sheet-type" ${supportsUnits ? '' : 'hidden'}>
        <button data-type="grams" class="${inputType === 'grams' ? 'active' : ''}">Gram</button>
        <button data-type="units" class="${inputType === 'units' ? 'active' : ''}">Stuks</button>
      </div>

      <input class="input" id="sheet-amount" type="number" min="0.1" step="0.1" inputmode="decimal" value="${inputValue}">
      <div class="preview" id="sheet-preview"></div>

      <div class="field-label">Maaltijd</div>
      <div class="meal-grid" id="sheet-meal">
        ${MEAL_KEYS.map(k =>
          `<button data-meal="${k}" class="${k === selectedMeal ? 'active' : ''}">${MEAL_LABELS[k]}</button>`
        ).join('')}
      </div>

      <div class="sheet-actions">
        <button class="btn" id="sheet-save">Opslaan</button>
        <button class="btn-icon-danger" id="sheet-delete" aria-label="Verwijderen">🗑</button>
      </div>
      <p class="error" id="sheet-error" hidden></p>
    </div>
  `;
  document.body.appendChild(overlay);

  // Helper: close sheet
  function close() {
    overlay.remove();
  }

  function updatePreview() {
    const kcal = calcKcal(product, inputType, inputValue);
    const unitLabel = inputType === 'units' ? (inputValue === 1 ? 'stuk' : 'stuks') : 'gram';
    overlay.querySelector('#sheet-preview').textContent = `= ${kcal} kcal (${inputValue} ${unitLabel})`;
  }
  updatePreview();

  // Type toggle
  overlay.querySelectorAll('#sheet-type button').forEach(btn => {
    btn.addEventListener('click', () => {
      inputType = btn.getAttribute('data-type');
      overlay.querySelectorAll('#sheet-type button').forEach(b =>
        b.classList.toggle('active', b === btn));
      const amt = overlay.querySelector('#sheet-amount');
      amt.value = inputType === 'units' ? 1 : 100;
      inputValue = parseFloat(amt.value);
      updatePreview();
    });
  });

  // Meal grid
  overlay.querySelectorAll('#sheet-meal button').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMeal = btn.getAttribute('data-meal');
      overlay.querySelectorAll('#sheet-meal button').forEach(b =>
        b.classList.toggle('active', b === btn));
    });
  });

  // Amount input
  overlay.querySelector('#sheet-amount').addEventListener('input', (e) => {
    inputValue = parseFloat(e.target.value) || 0;
    updatePreview();
  });

  // Overlay tap → close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Save
  overlay.querySelector('#sheet-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#sheet-error');
    errEl.hidden = true;
    if (inputValue <= 0) {
      errEl.textContent = 'Hoeveelheid moet groter dan 0 zijn.';
      errEl.hidden = false;
      return;
    }
    const grams = toGrams(product, inputType, inputValue);
    const kcal = calcKcal(product, inputType, inputValue);
    try {
      await updateEntry(entryId, { amount_grams: grams, kcal, meal_type: selectedMeal });
      showToast('Bijgewerkt');
      close();
      await onChange();
    } catch (err) {
      errEl.textContent = 'Kon niet opslaan: ' + err.message;
      errEl.hidden = false;
    }
  });

  // Delete (explicit, no undo)
  overlay.querySelector('#sheet-delete').addEventListener('click', async () => {
    try {
      await deleteEntry(entryId);
      showToast('Verwijderd');
      close();
      await onChange();
    } catch (err) {
      const errEl = overlay.querySelector('#sheet-error');
      errEl.textContent = 'Kon niet verwijderen: ' + err.message;
      errEl.hidden = false;
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

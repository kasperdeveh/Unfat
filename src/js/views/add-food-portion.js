import { getProduct } from '../db/products.js';
import { createEntry } from '../db/entries.js';
import { calcKcal, toGrams, todayIso } from '../calc.js';
import { showToast } from '../ui.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../utils/html.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];

export async function render(container, params) {
  const productId = params.product;
  if (!productId) {
    navigate('#/add');
    return;
  }

  let product;
  try {
    product = await getProduct(productId);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon product niet laden: ${err.message}</p>`;
    return;
  }

  const supportsUnits = !!product.unit_grams;
  let inputType = 'grams';   // 'grams' | 'units'
  let inputValue = supportsUnits ? 1 : 100;
  let selectedMeal = params.meal || guessMeal();
  const todayStr = todayIso();
  const dateParam = params.date || todayStr;
  const isToday = dateParam === todayStr;

  container.innerHTML = `
    <div class="view-header">
      <button class="btn-back" id="back-btn">←</button>
      <div>
        <h1>Hoeveelheid</h1>
        <small>${escapeHtml(product.name)}</small>
      </div>
    </div>

    <div class="hero hero-green">
      <div class="hero-label">Product</div>
      <div style="font-size:18px;font-weight:700;margin-top:4px;">${escapeHtml(product.name)}</div>
      <div style="font-size:12px;opacity:0.75;margin-top:2px;">${product.kcal_per_100g} kcal per 100g${product.unit_grams ? ` · ${product.unit_grams}g per stuk` : ''}</div>
    </div>

    <div class="segmented" id="type-toggle" ${supportsUnits ? '' : 'hidden'}>
      <button data-type="grams" class="active">Gram</button>
      <button data-type="units">Stuks</button>
    </div>

    <input class="input input-large" id="amount" type="number" min="0.1" step="0.1" inputmode="decimal" value="${inputValue}">

    <div class="preview" id="preview"></div>

    <span class="field-label">Maaltijd</span>
    <div class="meal-grid" id="meal-grid">
      ${MEAL_KEYS.map(k => `<button data-meal="${k}" class="${k === selectedMeal ? 'active' : ''}">${MEAL_LABELS[k]}</button>`).join('')}
    </div>

    <div style="height:16px;"></div>

    <button class="btn" id="save-btn">Toevoegen${isToday ? ' aan vandaag' : ''}</button>
    <p class="error" id="ap-error" hidden></p>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    const qs = new URLSearchParams();
    if (selectedMeal) qs.set('meal', selectedMeal);
    if (!isToday) qs.set('date', dateParam);
    const q = qs.toString();
    navigate(`#/add${q ? '?' + q : ''}`);
  });

  // Type toggle
  document.getElementById('type-toggle').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      inputType = btn.getAttribute('data-type');
      document.getElementById('type-toggle').querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b === btn));
      // Reset to a sensible default for the new type
      const amountEl = document.getElementById('amount');
      amountEl.value = inputType === 'units' ? 1 : 100;
      inputValue = parseFloat(amountEl.value);
      updatePreview();
    });
  });

  // Meal grid
  document.getElementById('meal-grid').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMeal = btn.getAttribute('data-meal');
      document.getElementById('meal-grid').querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b === btn));
    });
  });

  // Amount input
  const amountEl = document.getElementById('amount');
  amountEl.addEventListener('input', () => {
    // Users on NL locale type "1,5" — parseFloat stops at the comma → 1.
    inputValue = parseFloat(amountEl.value.replace(',', '.')) || 0;
    updatePreview();
  });

  function updatePreview() {
    const kcal = calcKcal(product, inputType, inputValue);
    const unitLabel = inputType === 'units' ? (inputValue === 1 ? 'stuk' : 'stuks') : 'gram';
    document.getElementById('preview').textContent =
      `= ${kcal} kcal (${inputValue} ${unitLabel})`;
  }
  updatePreview();

  // Save
  document.getElementById('save-btn').addEventListener('click', async () => {
    const error = document.getElementById('ap-error');
    error.hidden = true;
    if (inputValue <= 0) {
      error.textContent = 'Hoeveelheid moet groter dan 0 zijn.';
      error.hidden = false;
      return;
    }
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';

    const grams = toGrams(product, inputType, inputValue);
    const kcal = calcKcal(product, inputType, inputValue);

    try {
      await createEntry({
        product_id: product.id,
        amount_grams: grams,
        kcal,
        meal_type: selectedMeal,
        date: dateParam,
      });
      showToast(`Toegevoegd: ${kcal} kcal`);
      navigate(isToday ? '#/' : `#/day?date=${dateParam}`);
    } catch (err) {
      error.textContent = 'Kon niet opslaan: ' + err.message;
      error.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = `Toevoegen${isToday ? ' aan vandaag' : ''}`;
    }
  });
}

// Pick a meal based on current local time when none is given.
function guessMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}
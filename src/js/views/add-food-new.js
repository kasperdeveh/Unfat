import { createProduct } from '../db/products.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../utils/html.js';

export async function render(container, params) {
  const meal = params.meal || '';
  const dateParam = params.date || '';
  const namePrefill = params.name || '';

  container.innerHTML = `
    <div class="view-header">
      <button class="btn-back" id="back-btn">←</button>
      <div>
        <h1>Nieuw product</h1>
        <small>Voeg een product toe aan de gedeelde database</small>
      </div>
    </div>

    <form id="new-product-form">
      <div class="field">
        <label class="field-label" for="name">Naam</label>
        <input class="input" id="name" type="text" required maxlength="120" placeholder="bv. Volkoren brood" value="${escapeHtml(namePrefill)}">
      </div>

      <div class="field">
        <label class="field-label" for="kcal">Kcal per 100 gram</label>
        <input class="input" id="kcal" type="number" required min="1" max="2000" inputmode="numeric">
      </div>

      <div class="field">
        <label class="field-label" for="unit">Gewicht per stuk in gram (optioneel)</label>
        <input class="input" id="unit" type="number" min="1" max="5000" inputmode="numeric" placeholder="bv. 102 voor een banaan">
        <p class="text-muted" style="font-size:11px;margin-top:4px;">Vul alleen in als het product per stuk telt (banaan, plak, blik). Anders leeg laten.</p>
      </div>

      <button class="btn" type="submit" id="save-btn">Opslaan en kiezen</button>
      <p class="error" id="np-error" hidden></p>
    </form>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    const qs = new URLSearchParams();
    if (meal) qs.set('meal', meal);
    if (dateParam) qs.set('date', dateParam);
    const q = qs.toString();
    navigate(`#/add${q ? '?' + q : ''}`);
  });

  const form = document.getElementById('new-product-form');
  const error = document.getElementById('np-error');
  const saveBtn = document.getElementById('save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;

    const name = document.getElementById('name').value.trim();
    const kcal = parseInt(document.getElementById('kcal').value, 10);
    const unitRaw = document.getElementById('unit').value.trim();
    const unit_grams = unitRaw === '' ? null : parseInt(unitRaw, 10);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';

    try {
      const product = await createProduct({
        name,
        kcal_per_100g: kcal,
        unit_grams,
      });
      const qs = new URLSearchParams({ product: product.id });
      if (meal) qs.set('meal', meal);
      if (dateParam) qs.set('date', dateParam);
      navigate(`#/add/portion?${qs}`);
    } catch (err) {
      error.textContent = 'Kon product niet opslaan: ' + err.message;
      error.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Opslaan en kiezen';
    }
  });
}
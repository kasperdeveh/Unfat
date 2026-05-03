import { updateProduct } from '../../db/products.js';
import { showToast } from '../../ui.js';
import { escapeHtml } from '../../utils/html.js';

// Open an edit sheet for an existing user-source product.
// product: { id, name, kcal_per_100g, unit_grams, synonyms }
// onSave: async () => void — called after successful update so caller can refresh.
export function openEditProductSheet(product, onSave) {
  if (document.querySelector('.sheet-overlay')) return;

  const synonymsCsv = (product.synonyms || []).join(', ');

  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Product bewerken">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Product bewerken</div>

      <div class="field">
        <label class="field-label" for="ep-name">Naam</label>
        <input class="input" id="ep-name" type="text" required maxlength="120" value="${escapeHtml(product.name)}">
      </div>

      <div class="field">
        <label class="field-label" for="ep-kcal">Kcal per 100 gram</label>
        <input class="input" id="ep-kcal" type="number" required min="1" max="2000" inputmode="numeric" value="${escapeHtml(product.kcal_per_100g)}">
      </div>

      <div class="field">
        <label class="field-label" for="ep-unit">Gewicht per stuk in gram (optioneel)</label>
        <input class="input" id="ep-unit" type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9])?" value="${escapeHtml(product.unit_grams ?? '')}" placeholder="leeg = niet stukbaar">
      </div>

      <div class="field">
        <label class="field-label" for="ep-syn">Synoniemen (komma-gescheiden, optioneel)</label>
        <input class="input" id="ep-syn" type="text" value="${escapeHtml(synonymsCsv)}" placeholder="bv. boterham, snee brood">
      </div>

      <div class="sheet-actions">
        <button class="btn" id="ep-save">Opslaan</button>
        <button class="btn-secondary btn" id="ep-cancel">Annuleren</button>
      </div>
      <p class="error" id="ep-error" hidden></p>
    </div>
  `;
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#ep-cancel').addEventListener('click', close);

  overlay.querySelector('#ep-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#ep-error');
    errEl.hidden = true;

    const name = overlay.querySelector('#ep-name').value.trim();
    const kcal = parseInt(overlay.querySelector('#ep-kcal').value, 10);
    const unitRaw = overlay.querySelector('#ep-unit').value.trim();
    const synRaw = overlay.querySelector('#ep-syn').value.trim();

    if (!name) {
      errEl.textContent = 'Naam is verplicht.';
      errEl.hidden = false;
      return;
    }
    if (!Number.isFinite(kcal) || kcal < 1 || kcal > 2000) {
      errEl.textContent = 'Kcal moet tussen 1 en 2000 liggen.';
      errEl.hidden = false;
      return;
    }
    const unit_grams = unitRaw === '' ? null : parseFloat(unitRaw.replace(',', '.'));
    if (unit_grams !== null && (!Number.isFinite(unit_grams) || unit_grams < 1 || unit_grams > 5000)) {
      errEl.textContent = 'Gewicht per stuk moet tussen 1 en 5000 liggen.';
      errEl.hidden = false;
      return;
    }
    const synonyms = synRaw === ''
      ? null
      : synRaw.split(',').map(s => s.trim()).filter(Boolean);

    const saveBtn = overlay.querySelector('#ep-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';

    try {
      await updateProduct(product.id, { name, kcal_per_100g: kcal, unit_grams, synonyms });
      showToast('Bijgewerkt');
      close();
      await onSave();
    } catch (err) {
      errEl.textContent = 'Kon niet opslaan: ' + err.message;
      errEl.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Opslaan';
    }
  });
}

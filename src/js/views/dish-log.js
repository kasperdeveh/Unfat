import { getDish } from '../db/dishes.js';
import { bulkCreateEntries } from '../db/entries.js';
import { getMyProfile } from '../db/profiles.js';
import { todayIso } from '../calc.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import { escapeHtml } from '../utils/html.js';
import { openDishComponentSheet } from './components/dish-component-sheet.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MULTIPLIERS = [
  { value: 0.5, label: '½×' },
  { value: 1.0, label: '1×' },
  { value: 1.5, label: '1½×' },
  { value: 2.0, label: '2×' },
];

function guessMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

function formatPortion(amountG, product) {
  const u = product.unit_grams;
  // Display whole/half stuks naturally; otherwise grams.
  if (u && Math.abs((amountG / u) - Math.round(amountG / u * 2) / 2) < 1e-6) {
    const n = +(amountG / u).toFixed(1);
    return `${n} ${n === 1 ? 'stuk' : 'stuks'}`;
  }
  return `${Math.round(amountG)}g`;
}

export async function render(container, params) {
  const dishId = params.dish;
  const dateParam = params.date || todayIso();
  const isToday = dateParam === todayIso();

  if (!dishId) { navigate('#/add'); return; }

  let dish, profile;
  try {
    [dish, profile] = await Promise.all([getDish(dishId), getMyProfile()]);
  } catch (err) {
    container.innerHTML = `<p class="error" style="padding:16px;">Kon gerecht niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  const components = (dish.components || []);
  const isOwner = dish.created_by === profile.id;
  const isElevated = ['editor', 'admin'].includes(profile.role);
  const canEdit = isOwner || isElevated;

  // Per-row state. `amounts[i]` is the current grams that will be logged for
  // ingredient i; `overridden[i]` flags it as manually edited (for visual cue).
  // The multiplier-presets reset both: amounts ← base × multiplier, overridden ← false.
  const baseAmounts = components.map(c => Number(c.amount_grams));
  let amounts = baseAmounts.slice();
  let overridden = components.map(() => false);
  let multiplier = 1.0;
  let selectedMeal = params.meal || dish.default_meal_type || guessMeal();
  let active = components.map(() => true);

  function compKcal(i) {
    return Math.round(amounts[i] * components[i].products.kcal_per_100g / 100);
  }
  function totalKcal() {
    return components.reduce((sum, _c, i) => active[i] ? sum + compKcal(i) : sum, 0);
  }

  function renderAll() {
    const validCount = active.filter(Boolean).length;

    container.innerHTML = `
      <div class="view-header">
        <button class="btn-back" id="back-btn">←</button>
        <div>
          <h1>${escapeHtml(dish.name)}</h1>
          <small>Gerecht · ${components.length} ingrediënten</small>
        </div>
        ${canEdit ? '<button class="btn-icon" id="edit-btn" aria-label="Gerecht bewerken" style="margin-left:auto;">✏️</button>' : ''}
      </div>

      <div class="hero hero-green">
        <div class="hero-label">Totaal</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px;">${totalKcal()}<small style="font-size:14px;font-weight:600;opacity:0.8;"> kcal</small></div>
      </div>

      <span class="field-label">Porties</span>
      <div class="dish-portion-segmented" id="dl-mult">
        ${MULTIPLIERS.map(m => `
          <button data-mult="${m.value}" class="${m.value === multiplier ? 'active' : ''}">${m.label}</button>
        `).join('')}
      </div>

      <span class="field-label">Ingrediënten</span>
      <div id="dl-components">
        ${components.map((c, i) => `
          <div class="dish-component-row ${active[i] ? '' : 'disabled'}" data-index="${i}">
            <span class="dl-toggle" data-index="${i}" style="width:18px;color:${active[i] ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;">${active[i] ? '☑' : '☐'}</span>
            <span class="name dl-toggle" data-index="${i}" style="cursor:pointer;">${escapeHtml(c.products.name)}</span>
            <span class="portion dl-portion ${overridden[i] ? 'dl-portion-edited' : ''}" data-index="${i}">${formatPortion(amounts[i], c.products)}${overridden[i] ? ' ✏' : ''}</span>
            <span class="kcal">${compKcal(i)} kcal</span>
          </div>
        `).join('')}
      </div>

      <span class="field-label" style="margin-top:12px;">Maaltijd</span>
      <div class="meal-grid" id="dl-meal">
        ${MEAL_KEYS.map(k => `
          <button data-meal="${k}" class="${k === selectedMeal ? 'active' : ''}">${MEAL_LABELS[k]}</button>
        `).join('')}
      </div>

      <div style="height:16px;"></div>
      <button class="btn" id="dl-save" ${validCount === 0 ? 'disabled' : ''}>
        Toevoegen${isToday ? ' aan vandaag' : ''} — ${totalKcal()} kcal
      </button>
      <p class="error" id="dl-error" hidden></p>
    `;

    bindEvents();
  }

  function bindEvents() {
    container.querySelector('#back-btn').addEventListener('click', () => {
      const qs = new URLSearchParams();
      if (params.meal) qs.set('meal', params.meal);
      if (!isToday) qs.set('date', dateParam);
      const q = qs.toString();
      navigate(`#/add${q ? '?' + q : ''}`);
    });
    if (canEdit) {
      container.querySelector('#edit-btn').addEventListener('click', () =>
        navigate(`#/dish/edit?dish=${dishId}`));
    }

    container.querySelectorAll('#dl-mult button').forEach(btn => {
      btn.addEventListener('click', () => {
        multiplier = parseFloat(btn.getAttribute('data-mult'));
        // Scale-all action: reset amounts to base × multiplier, clear overrides.
        amounts = baseAmounts.map(a => a * multiplier);
        overridden = components.map(() => false);
        renderAll();
      });
    });

    // Toggle active: tap on checkbox or name area.
    container.querySelectorAll('#dl-components .dl-toggle').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(el.getAttribute('data-index'), 10);
        active[i] = !active[i];
        renderAll();
      });
    });

    // Edit per-ingredient amount: tap on portion-pill opens the same sheet
    // dish-builder uses for re-edit.
    container.querySelectorAll('#dl-components .dl-portion').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(el.getAttribute('data-index'), 10);
        const c = components[i];
        openDishComponentSheet(
          { initial: { product: c.products, amount_grams: amounts[i] } },
          ({ amount_grams }) => {
            amounts[i] = amount_grams;
            overridden[i] = true;
            renderAll();
          }
          // No onDelete: removing an ingredient from a log is the toggle-off,
          // not a sheet action.
        );
      });
    });

    container.querySelectorAll('#dl-meal button').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedMeal = btn.getAttribute('data-meal');
        container.querySelectorAll('#dl-meal button').forEach(b =>
          b.classList.toggle('active', b === btn));
      });
    });

    container.querySelector('#dl-save').addEventListener('click', async () => {
      const errEl = container.querySelector('#dl-error');
      errEl.hidden = true;
      const saveBtn = container.querySelector('#dl-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Bezig...';

      const rows = components
        .map((c, i) => ({ c, i }))
        .filter(({ i }) => active[i])
        .map(({ c, i }) => ({
          product_id: c.products.id,
          amount_grams: amounts[i],
          kcal: compKcal(i),
          meal_type: selectedMeal,
          date: dateParam,
          dish_id: dishId,
        }));

      try {
        await bulkCreateEntries(rows);
        showToast(`Toegevoegd: ${totalKcal()} kcal`);
        navigate(isToday ? '#/' : `#/day?date=${dateParam}`);
      } catch (err) {
        errEl.textContent = 'Kon niet opslaan: ' + err.message;
        errEl.hidden = false;
        saveBtn.disabled = false;
        saveBtn.textContent = `Toevoegen — ${totalKcal()} kcal`;
      }
    });
  }

  renderAll();
}

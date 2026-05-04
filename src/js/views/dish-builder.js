import { createDish, updateDish, getDish, deleteDish } from '../db/dishes.js';
import { getMyProfile } from '../db/profiles.js';
import { openDishComponentSheet } from './components/dish-component-sheet.js';
import { navigate } from '../router.js';
import { showToast } from '../ui.js';
import { escapeHtml } from '../utils/html.js';
import { getMyFavorites, toggleDishFavorite } from '../db/favorites.js';

const MEAL_BUTTONS = [
  { key: '',          label: 'Geen' },
  { key: 'breakfast', label: '🌅' },
  { key: 'lunch',     label: '🥗' },
  { key: 'dinner',    label: '🍽' },
  { key: 'snack',     label: '🍪' },
];

// Mode is determined by params.dish (edit) vs absent (new).
// State held in-memory until "Opslaan":
//   name: string
//   defaultMeal: '' | meal_type
//   components: [{ product: {id,name,kcal_per_100g,unit_grams,...}, amount_grams }]
export async function render(container, params) {
  const dishId = params.dish || null;
  const isEdit = !!dishId;

  // Load existing dish (edit) + profile (for editor/admin check)
  let initialName = '';
  let initialMeal = '';
  let initialComponents = [];
  let canEdit = true;
  let canDelete = true;
  let isFavInitial = false;

  try {
    const profile = await getMyProfile();
    if (isEdit) {
      const [dish, favs] = await Promise.all([getDish(dishId), getMyFavorites()]);
      initialName = dish.name;
      initialMeal = dish.default_meal_type || '';
      initialComponents = (dish.components || []).map(c => ({
        product: c.products,
        amount_grams: Number(c.amount_grams),
      }));
      isFavInitial = favs.dishIds.has(dishId);
      const isOwner = dish.created_by === profile.id;
      const isElevated = ['editor', 'admin'].includes(profile.role);
      canEdit = isOwner || isElevated;
      canDelete = isOwner;
      if (!canEdit) {
        container.innerHTML = `<p class="error" style="padding:16px;">Je mag dit gerecht niet bewerken.</p>`;
        return;
      }
    }
  } catch (err) {
    container.innerHTML = `<p class="error" style="padding:16px;">Kon gerecht niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  let state = {
    name: initialName,
    defaultMeal: initialMeal,
    components: initialComponents.slice(),
    isFav: isFavInitial,
  };

  function totalKcal() {
    return state.components.reduce((sum, c) => {
      const kcal = Math.round(c.amount_grams * c.product.kcal_per_100g / 100);
      return sum + kcal;
    }, 0);
  }

  function formatPortion(c) {
    const u = c.product.unit_grams;
    if (u && c.amount_grams % u === 0) {
      const n = c.amount_grams / u;
      return `${n} ${n === 1 ? 'stuk' : 'stuks'} (${c.amount_grams}g)`;
    }
    return `${c.amount_grams}g`;
  }

  function renderAll() {
    const valid = state.name.trim().length > 0 && state.components.length > 0;

    container.innerHTML = `
      <div class="view-header">
        <button class="btn-back" id="back-btn">←</button>
        <div>
          <h1>${isEdit ? 'Gerecht bewerken' : 'Nieuw gerecht'}</h1>
          <small>Bundel producten tot één gerecht</small>
        </div>
        ${isEdit ? `<button class="btn-icon btn-fav-header" id="db-fav" aria-label="Favoriet" aria-pressed="${state.isFav}" style="margin-left:auto;">${state.isFav ? '★' : '☆'}</button>` : ''}
      </div>

      <div class="field">
        <label class="field-label" for="db-name">Naam</label>
        <input class="input" id="db-name" type="text" required maxlength="120" value="${escapeHtml(state.name)}" placeholder="bv. Spaghetti bolognese">
      </div>

      <div class="field">
        <label class="field-label">Voorgestelde maaltijd</label>
        <div class="meal-grid" id="db-meal" style="grid-template-columns:repeat(5,1fr);">
          ${MEAL_BUTTONS.map(m => `
            <button data-meal="${m.key}" class="${m.key === state.defaultMeal ? 'active' : ''}">${m.label}</button>
          `).join('')}
        </div>
      </div>

      <span class="field-label">Ingrediënten (${state.components.length})</span>
      <div id="db-components">
        ${state.components.map((c, i) => `
          <button class="dish-component-row" type="button" data-index="${i}">
            <span class="name">${escapeHtml(c.product.name)}</span>
            <span class="portion">${formatPortion(c)}</span>
            <span class="kcal">${Math.round(c.amount_grams * c.product.kcal_per_100g / 100)} kcal</span>
          </button>
        `).join('')}
      </div>
      <button class="btn-secondary btn" id="db-add" style="margin-top:8px;background:rgba(0,230,118,0.12);border:1px dashed var(--accent);color:var(--accent);">
        + Ingrediënt toevoegen
      </button>

      <p style="text-align:center;color:var(--text-muted);margin:14px 0 4px;">Totaal: <strong>${totalKcal()}</strong> kcal</p>

      <button class="btn" id="db-save" ${valid ? '' : 'disabled'}>${isEdit ? 'Opslaan' : 'Aanmaken'}</button>
      ${isEdit && canDelete ? '<button class="btn-secondary btn" id="db-delete" style="margin-top:8px;color:var(--danger);border-color:var(--danger);">Verwijderen</button>' : ''}
      <p class="error" id="db-error" hidden></p>
    `;

    bindEvents();
  }

  function bindEvents() {
    container.querySelector('#back-btn').addEventListener('click', () => navigate('#/add'));

    if (isEdit) {
      const favBtn = container.querySelector('#db-fav');
      favBtn.addEventListener('click', async () => {
        const wasOn = state.isFav;
        state.isFav = !state.isFav;
        favBtn.setAttribute('aria-pressed', String(state.isFav));
        favBtn.textContent = state.isFav ? '★' : '☆';
        try {
          await toggleDishFavorite(dishId, state.isFav);
        } catch {
          state.isFav = wasOn;
          favBtn.setAttribute('aria-pressed', String(state.isFav));
          favBtn.textContent = state.isFav ? '★' : '☆';
          showToast('Kon favoriet niet opslaan');
        }
      });
    }

    container.querySelector('#db-name').addEventListener('input', (e) => {
      state.name = e.target.value;
      const saveBtn = container.querySelector('#db-save');
      const valid = state.name.trim().length > 0 && state.components.length > 0;
      saveBtn.disabled = !valid;
    });

    container.querySelectorAll('#db-meal button').forEach(btn => {
      btn.addEventListener('click', () => {
        state.defaultMeal = btn.getAttribute('data-meal');
        container.querySelectorAll('#db-meal button').forEach(b =>
          b.classList.toggle('active', b === btn));
      });
    });

    container.querySelector('#db-add').addEventListener('click', () => {
      openDishComponentSheet({}, ({ product, amount_grams }) => {
        state.components.push({ product, amount_grams });
        renderAll();
      });
    });

    container.querySelectorAll('.dish-component-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.getAttribute('data-index'), 10);
        const c = state.components[idx];
        openDishComponentSheet(
          { initial: { product: c.product, amount_grams: c.amount_grams } },
          ({ product, amount_grams }) => {
            state.components[idx] = { product, amount_grams };
            renderAll();
          },
          () => {
            state.components.splice(idx, 1);
            renderAll();
          }
        );
      });
    });

    container.querySelector('#db-save').addEventListener('click', async () => {
      const errEl = container.querySelector('#db-error');
      errEl.hidden = true;
      const saveBtn = container.querySelector('#db-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Bezig...';

      const payload = {
        name: state.name.trim(),
        default_meal_type: state.defaultMeal || null,
        components: state.components.map((c, i) => ({
          product_id: c.product.id,
          amount_grams: c.amount_grams,
          position: i,
        })),
      };

      try {
        if (isEdit) {
          await updateDish(dishId, payload);
          showToast('Gerecht bijgewerkt');
        } else {
          await createDish(payload);
          showToast('Gerecht aangemaakt');
        }
        navigate('#/add');
      } catch (err) {
        errEl.textContent = 'Kon niet opslaan: ' + err.message;
        errEl.hidden = false;
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Opslaan' : 'Aanmaken';
      }
    });

    if (isEdit && canDelete) {
      container.querySelector('#db-delete').addEventListener('click', async () => {
        if (!confirm(`Gerecht "${state.name}" verwijderen?`)) return;
        try {
          await deleteDish(dishId);
          showToast('Gerecht verwijderd');
          navigate('#/add');
        } catch (err) {
          const errEl = container.querySelector('#db-error');
          errEl.textContent = 'Kon niet verwijderen: ' + err.message;
          errEl.hidden = false;
        }
      });
    }
  }

  renderAll();
}

import { getMyProfile } from '../db/profiles.js';
import { listEntriesForDate } from '../db/entries.js';
import { heroState, formatDateNl, todayIso } from '../calc.js';
import { navigate } from '../router.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export async function render(container) {
  // Loading state
  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let profile, entries;
  try {
    [profile, entries] = await Promise.all([
      getMyProfile(),
      listEntriesForDate(todayIso()),
    ]);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon dashboard niet laden: ${err.message}</p>`;
    return;
  }

  const totalKcal = entries.reduce((sum, e) => sum + e.kcal, 0);
  const remainingTarget = profile.daily_target_kcal - totalKcal;
  const overTarget = totalKcal - profile.daily_target_kcal;
  const overMax = totalKcal - profile.daily_max_kcal;
  const state = heroState(totalKcal, profile.daily_target_kcal, profile.daily_max_kcal);

  // Group entries by meal
  const byMeal = {};
  for (const meal of MEAL_ORDER) byMeal[meal] = [];
  for (const e of entries) byMeal[e.meal_type].push(e);

  // Hero content per state
  let heroLabel, heroNum, heroBadge = '';
  if (state === 'green') {
    heroLabel = 'Nog beschikbaar';
    heroNum = `${remainingTarget}<small> / ${profile.daily_target_kcal} kcal</small>`;
  } else if (state === 'orange') {
    heroLabel = 'Boven streefdoel';
    heroNum = `+${overTarget}<small> kcal</small>`;
    heroBadge = `<div class="hero-badge">⚠ Let op je max</div>`;
  } else {
    heroLabel = 'Max overschreden';
    heroNum = `+${overMax}<small> kcal boven max</small>`;
    heroBadge = `<div class="hero-badge">🚫 Max overschreden</div>`;
  }

  // Bar fill: clamp to 100%
  const barPct = Math.min(100, Math.round(totalKcal / profile.daily_target_kcal * 100));

  container.innerHTML = `
    <h1 class="page-title">Vandaag</h1>
    <p class="page-subtitle">${formatDateNl()}</p>

    <div class="hero hero-${state}">
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-num">${heroNum}</div>
      <div class="hero-bar"><div class="hero-bar-fill" style="width: ${barPct}%"></div></div>
      <div class="hero-meta">
        <span>${totalKcal} gehad</span>
        <span>max ${profile.daily_max_kcal}</span>
      </div>
      ${heroBadge}
    </div>

    <ul class="list" id="meal-list">
      ${MEAL_ORDER.map(meal => {
        const items = byMeal[meal];
        const sum = items.reduce((s, e) => s + e.kcal, 0);
        const isEmpty = items.length === 0;
        const itemsLabel = isEmpty
          ? '<span class="kcal">+ toevoegen</span>'
          : `<span class="kcal">${sum}</span>`;
        const itemsList = isEmpty
          ? ''
          : `<div class="items">${items.map(e =>
              `${e.products.name} (${Math.round(e.amount_grams)}g)`
            ).join(' · ')}</div>`;
        return `
          <li class="meal-row ${isEmpty ? 'empty' : ''}" data-meal="${meal}">
            <div>
              <div>${MEAL_LABELS[meal]}</div>
              ${itemsList}
            </div>
            ${itemsLabel}
          </li>
        `;
      }).join('')}
    </ul>
  `;

  // Tap on a meal row → go to add-food with that meal pre-selected
  container.querySelectorAll('.meal-row').forEach(row => {
    row.addEventListener('click', () => {
      const meal = row.getAttribute('data-meal');
      navigate(`#/add?meal=${meal}`);
    });
  });
}

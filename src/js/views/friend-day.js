import { getFriendDay } from '../db/friendships.js';
import { heroState, todayIso } from '../calc.js';
import { parseIso, formatDayLongNl } from '../utils/dates.js';
import { navigate } from '../router.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export async function render(container, params) {
  const friendId = params?.id;
  if (!friendId) { navigate('#/friends'); return; }
  const dateIso = params?.date || todayIso();
  const date = parseIso(dateIso);

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let day;
  try {
    day = await getFriendDay(friendId, dateIso);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon vriend niet laden: ${err.message}</p>`;
    return;
  }

  const handle = day.handle || 'Vriend';
  const back = `<button class="back-btn" id="back-btn">‹ Vrienden</button>`;

  if (day.share_level === 'none') {
    container.innerHTML = `
      ${back}
      <h1 class="page-title">${escapeHtml(handle)}</h1>
      <p class="page-subtitle">${formatDayLongNl(date)}</p>
      <p class="text-muted" style="margin-top:32px;text-align:center;">${escapeHtml(handle)} deelt geen voortgang.</p>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => navigate('#/friends'));
    return;
  }

  const target = day.target;
  const max = day.max;
  const totalKcal = day.total_kcal || 0;

  let heroLabel, heroNum, state;
  if (target == null || max == null) {
    state = 'green';
    heroLabel = 'Geen target/max bekend';
    heroNum = `${totalKcal}<small> kcal</small>`;
  } else {
    state = heroState(totalKcal, target, max);
    if (state === 'green') {
      heroLabel = 'Doel gehaald';
      heroNum = `${totalKcal}<small> / ${target} kcal</small>`;
    } else if (state === 'orange') {
      heroLabel = 'Boven streefdoel';
      heroNum = `+${totalKcal - target}<small> kcal</small>`;
    } else {
      heroLabel = 'Boven max';
      heroNum = `+${totalKcal - max}<small> kcal boven max</small>`;
    }
  }

  const barPct = (target && target > 0) ? Math.min(100, Math.round(totalKcal / target * 100)) : 0;

  let mealsHtml = '';
  if (day.share_level === 'per_meal' || day.share_level === 'entries') {
    const perMeal = day.per_meal || {};
    const entries = day.entries || [];
    mealsHtml = MEAL_ORDER.map(meal => {
      const sum = perMeal[meal] || 0;
      const items = entries.filter(e => e.meal_type === meal);
      return `
        <section class="meal-section">
          <header class="meal-header">
            <span class="meal-title">${MEAL_LABELS[meal]}</span>
            <span class="meal-sum">${sum === 0 ? '' : sum}</span>
          </header>
          ${items.map(e => `
            <div class="entry-row entry-row-readonly">
              <div class="entry-info">
                <div class="entry-name">${escapeHtml(e.product_name)}</div>
                <div class="entry-meta">${Math.round(e.amount_grams)}g · ${e.kcal} kcal</div>
              </div>
            </div>
          `).join('')}
        </section>
      `;
    }).join('');
  }

  container.innerHTML = `
    ${back}
    <h1 class="page-title">${escapeHtml(handle)}</h1>
    <p class="page-subtitle">${formatDayLongNl(date)}</p>

    <div class="hero hero-${state}">
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-num">${heroNum}</div>
      ${target ? `<div class="hero-bar"><div class="hero-bar-fill" style="width: ${barPct}%"></div></div>` : ''}
      ${target ? `<div class="hero-meta"><span>${totalKcal} gehad</span>${max ? `<span>max ${max}</span>` : ''}</div>` : ''}
    </div>

    ${mealsHtml}
  `;

  container.querySelector('#back-btn').addEventListener('click', () => navigate('#/friends'));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

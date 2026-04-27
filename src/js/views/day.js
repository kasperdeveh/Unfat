import { getMyProfile } from '../db/profiles.js';
import { listProfileHistory, getTargetForDate } from '../db/profile_history.js';
import { listEntriesForDate } from '../db/entries.js';
import { heroState, todayIso } from '../calc.js';
import { isoDate, parseIso, formatDayLongNl, isSameDay } from '../utils/dates.js';
import { navigate } from '../router.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export async function render(container, params) {
  const dateIso = params?.date || todayIso();
  const date = parseIso(dateIso);
  const isToday = isSameDay(date, new Date());

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let profile, entries, history;
  try {
    [profile, entries, history] = await Promise.all([
      getMyProfile(),
      listEntriesForDate(dateIso),
      listProfileHistory(),
    ]);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon dag-view niet laden: ${err.message}</p>`;
    return;
  }

  if (!profile) {
    navigate('#/onboarding');
    return;
  }

  // Pick target/max: today uses profiles (fast path), past uses profile_history lookup.
  let target, max;
  if (isToday) {
    target = profile.daily_target_kcal;
    max = profile.daily_max_kcal;
  } else {
    const t = getTargetForDate(history, dateIso);
    target = t?.target ?? profile.daily_target_kcal;
    max = t?.max ?? profile.daily_max_kcal;
  }

  const totalKcal = entries.reduce((sum, e) => sum + e.kcal, 0);
  const remaining = target - totalKcal;
  const overTarget = totalKcal - target;
  const overMax = totalKcal - max;
  const state = heroState(totalKcal, target, max);

  // Group by meal
  const byMeal = {};
  for (const meal of MEAL_ORDER) byMeal[meal] = [];
  for (const e of entries) byMeal[e.meal_type].push(e);

  // Hero text varies for today vs past
  let heroLabel, heroNum;
  if (isToday) {
    if (state === 'green') {
      heroLabel = 'Nog beschikbaar';
      heroNum = `${remaining}<small> / ${target} kcal</small>`;
    } else if (state === 'orange') {
      heroLabel = 'Boven streefdoel';
      heroNum = `+${overTarget}<small> kcal</small>`;
    } else {
      heroLabel = 'Max overschreden';
      heroNum = `+${overMax}<small> kcal boven max</small>`;
    }
  } else {
    if (state === 'green') {
      heroLabel = entries.length === 0 ? 'Geen invoer' : 'Doel gehaald';
      heroNum = entries.length === 0 ? '—' : `${totalKcal}<small> kcal</small>`;
    } else if (state === 'orange') {
      heroLabel = 'Boven streefdoel';
      heroNum = `+${overTarget}<small> kcal</small>`;
    } else {
      heroLabel = 'Boven max';
      heroNum = `+${overMax}<small> kcal boven max</small>`;
    }
  }

  const barPct = target > 0 ? Math.min(100, Math.round(totalKcal / target * 100)) : 0;

  container.innerHTML = `
    <h1 class="page-title">${isToday ? 'Vandaag' : formatDayLongNl(date)}</h1>
    <p class="page-subtitle">${isToday ? formatDayLongNl(date) : ''}</p>

    <div class="hero hero-${state}">
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-num">${heroNum}</div>
      <div class="hero-bar"><div class="hero-bar-fill" style="width: ${barPct}%"></div></div>
      <div class="hero-meta">
        <span>${totalKcal} gehad</span>
        <span>max ${max}</span>
      </div>
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
              `${escapeHtml(e.products?.name || 'Onbekend')} (${Math.round(e.amount_grams)}g)`
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

  container.querySelectorAll('.meal-row').forEach(row => {
    row.addEventListener('click', () => {
      const meal = row.getAttribute('data-meal');
      navigate(`#/add?meal=${meal}&date=${dateIso}`);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

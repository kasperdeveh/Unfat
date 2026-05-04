import { getFriendDay } from '../db/friendships.js';
import { heroState, todayIso } from '../calc.js';
import { parseIso, formatDayLongNl, isoDate, addDays } from '../utils/dates.js';
import { navigate } from '../router.js';
import { mount as mountFriendHeader } from './components/friend-header.js';
import { escapeHtml } from '../utils/html.js';

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
    container.innerHTML = `<p class="error">Kon vriend niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  const handle = day.handle || 'Vriend';

  // Build skeleton: header at top, then a content slot beneath
  const friendCreated = day.friend_created_at ? parseIso(day.friend_created_at) : null;
  const prevIso = isoDate(addDays(date, -1));
  const nextIso = isoDate(addDays(date, 1));
  const prevDisabled = friendCreated && dateIso <= day.friend_created_at;
  const nextDisabled = dateIso >= todayIso();

  container.innerHTML = `
    <div id="friend-header-slot"></div>
    <div class="day-nav">
      <button class="day-nav-btn" id="friend-prev-day" ${prevDisabled ? 'disabled' : ''}>‹</button>
      <p class="page-subtitle" style="margin:0 1rem;">${formatDayLongNl(date)}</p>
      <button class="day-nav-btn" id="friend-next-day" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div id="friend-day-content"></div>
  `;

  mountFriendHeader(
    container.querySelector('#friend-header-slot'),
    { friendId, handle, currentView: 'day', anchor: dateIso }
  );

  const prevBtn = container.querySelector('#friend-prev-day');
  const nextBtn = container.querySelector('#friend-next-day');
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => {
      navigate(`#/friend-day?id=${encodeURIComponent(friendId)}&date=${prevIso}`);
    });
  }
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/friend-day?id=${encodeURIComponent(friendId)}&date=${nextIso}`);
    });
  }

  const content = container.querySelector('#friend-day-content');

  if (day.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:32px;text-align:center;">${escapeHtml(handle)} deelt geen voortgang.</p>`;
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
    const showCopy = day.share_level === 'entries';
    mealsHtml = MEAL_ORDER.map(meal => {
      const sum = perMeal[meal] || 0;
      const items = entries.filter(e => e.meal_type === meal);
      const mealCopyBtn = (showCopy && items.length > 0)
        ? `<button class="meal-copy-btn" data-meal="${meal}">Kopieer</button>`
        : '';
      return `
        <section class="meal-section">
          <header class="meal-header">
            <span class="meal-title">${MEAL_LABELS[meal]}</span>
            <span class="meal-sum">${sum === 0 ? '' : sum}</span>
            ${mealCopyBtn}
          </header>
          ${items.map(e => `
            <div class="entry-row entry-row-readonly" data-entry-idx="${entries.indexOf(e)}">
              <div class="entry-info">
                <div class="entry-name">${escapeHtml(e.product_name)}</div>
                <div class="entry-meta">${Math.round(e.amount_grams)}g · ${e.kcal} kcal</div>
              </div>
              ${showCopy ? `<button class="entry-copy-btn" data-entry-idx="${entries.indexOf(e)}">Kopieer</button>` : ''}
            </div>
          `).join('')}
        </section>
      `;
    }).join('');
  }

  content.innerHTML = `
    <div class="hero hero-${state}">
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-num">${heroNum}</div>
      ${target ? `<div class="hero-bar"><div class="hero-bar-fill" style="width: ${barPct}%"></div></div>` : ''}
      ${target ? `<div class="hero-meta"><span>${totalKcal} gehad</span>${max ? `<span>max ${max}</span>` : ''}</div>` : ''}
    </div>

    ${mealsHtml}
  `;

  if (day.share_level === 'entries') {
    const entries = day.entries || [];

    content.querySelectorAll('.entry-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.entryIdx, 10);
        const entry = entries[idx];
        if (!entry) return;
        await runCopy(handle, [entry], MEAL_LABELS[entry.meal_type] + ' entry');
      });
    });

    content.querySelectorAll('.meal-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const meal = btn.dataset.meal;
        const items = entries.filter(e => e.meal_type === meal);
        if (items.length === 0) return;
        await runCopy(handle, items, MEAL_LABELS[meal]);
      });
    });
  }
}

async function runCopy(handle, items, label) {
  const { open: openCopySheet } = await import('./components/copy-date-sheet.js');
  const { createEntry } = await import('../db/entries.js');
  const { showToast } = await import('../ui.js');

  const target = await openCopySheet({
    title: `Kopieer ${label} naar...`,
    defaultDate: todayIso(),
  });
  if (!target) return;

  try {
    for (const e of items) {
      await createEntry({
        product_id: e.product_id,
        amount_grams: e.amount_grams,
        kcal: e.kcal,
        meal_type: e.meal_type,
        date: target,
      });
    }
    const n = items.length;
    showToast(`${n} ${n === 1 ? 'entry' : 'entries'} gekopieerd naar ${target}`);
  } catch (err) {
    showToast(`Kopieer-fout: ${err.message}`);
  }
}
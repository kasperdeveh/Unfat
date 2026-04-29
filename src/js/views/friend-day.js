import { getFriendDay } from '../db/friendships.js';
import { heroState, todayIso } from '../calc.js';
import { parseIso, formatDayLongNl, isoDate, addDays } from '../utils/dates.js';
import { navigate } from '../router.js';
import { mount as mountFriendHeader } from './components/friend-header.js';

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

  content.innerHTML = `
    <div class="hero hero-${state}">
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-num">${heroNum}</div>
      ${target ? `<div class="hero-bar"><div class="hero-bar-fill" style="width: ${barPct}%"></div></div>` : ''}
      ${target ? `<div class="hero-meta"><span>${totalKcal} gehad</span>${max ? `<span>max ${max}</span>` : ''}</div>` : ''}
    </div>

    ${mealsHtml}
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

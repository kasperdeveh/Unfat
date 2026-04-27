import { getMyProfile } from '../db/profiles.js';
import { listProfileHistory } from '../db/profile_history.js';
import { listEntriesForDateRange } from '../db/entries.js';
import {
  parseIso, isoDate, weekStart, weekEnd, monthStart, monthEnd,
  addDays, addMonths, isoWeekNumber, formatWeekRangeNl, formatMonthNl, isSameDay,
} from '../utils/dates.js';
import { renderWeekRows, computeWeekStats } from './components/week-view.js';
import { renderMonthGrid, computeMonthStats } from './components/month-view.js';
import { navigate } from '../router.js';

export async function render(container, params) {
  const view = params?.view === 'month' ? 'month' : 'week';
  const today = new Date();

  // Default start = current week-start or month-start.
  let start;
  if (params?.start) {
    start = parseIso(params.start);
  } else {
    start = view === 'month' ? monthStart(today) : weekStart(today);
  }

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  // Determine date range to query.
  const rangeStart = view === 'month' ? monthStart(start) : weekStart(start);
  const rangeEnd = view === 'month' ? monthEnd(start) : weekEnd(start);

  let profile, history, entries;
  try {
    [profile, history, entries] = await Promise.all([
      getMyProfile(),
      listProfileHistory(),
      listEntriesForDateRange(isoDate(rangeStart), isoDate(rangeEnd)),
    ]);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon historie niet laden: ${err.message}</p>`;
    return;
  }

  const fbTarget = profile.daily_target_kcal;
  const fbMax = profile.daily_max_kcal;

  // Compute period stats.
  const stats = view === 'month'
    ? computeMonthStats(start, entries, history, fbTarget, fbMax)
    : computeWeekStats(start, entries, history, fbTarget, fbMax);

  // Period title + sub-label
  let title, sub, isCurrent;
  if (view === 'month') {
    title = formatMonthNl(start);
    isCurrent = start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth();
    sub = isCurrent
      ? 'deze maand'
      : `<button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;
  } else {
    title = formatWeekRangeNl(start);
    isCurrent = isSameDay(start, weekStart(today));
    const wnr = isoWeekNumber(start);
    sub = isCurrent
      ? `Week ${wnr} · deze week`
      : `Week ${wnr} · <button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;
  }

  // Determine arrow availability. ISO-string compare avoids time-of-day drift.
  const prevStart = view === 'month' ? addMonths(start, -1) : addDays(start, -7);
  const nextStart = view === 'month' ? addMonths(start, 1) : addDays(start, 7);
  const nextDisabled = isoDate(nextStart) > isoDate(today);

  container.innerHTML = `
    <div class="history-toggle">
      <button data-view="week" class="${view === 'week' ? 'active' : ''}">Week</button>
      <button data-view="month" class="${view === 'month' ? 'active' : ''}">Maand</button>
    </div>

    <div class="period-nav">
      <button class="period-arrow" id="prev-period">‹</button>
      <div class="period-title">
        <div class="period-title-main">${title}</div>
        <div class="period-title-sub">${sub}</div>
      </div>
      <button class="period-arrow" id="next-period" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>

    <div class="period-stats">
      <div class="period-stat">
        <div class="period-stat-label">Gemiddeld per dag</div>
        <div class="period-stat-value">${stats.avgKcal === 0 ? '—' : stats.avgKcal + ' kcal'}</div>
      </div>
      <div class="period-stat">
        <div class="period-stat-label">Doel gehaald</div>
        <div class="period-stat-value">${stats.daysMet} / ${stats.daysWithEntries}</div>
      </div>
    </div>

    ${view === 'week'
      ? `<div class="week-list">${renderWeekRows(start, entries, history, fbTarget, fbMax)}</div>`
      : renderMonthGrid(start, entries, history, fbTarget, fbMax)
    }
  `;

  // Toggle handlers
  container.querySelectorAll('.history-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const newView = btn.getAttribute('data-view');
      if (newView === view) return;
      // Pick a new start that aligns with the new period type. Going week → month
      // uses the Thursday of the week (ISO 8601 rule: a week belongs to the year
      // and month containing its Thursday) so e.g. 30 mrt - 5 apr maps to april,
      // not march.
      const anchor = view === 'week' ? addDays(start, 3) : start;
      const newStart = newView === 'month' ? monthStart(anchor) : weekStart(anchor);
      navigate(`#/history?view=${newView}&start=${isoDate(newStart)}`);
    });
  });

  // Period arrows
  container.querySelector('#prev-period').addEventListener('click', () => {
    navigate(`#/history?view=${view}&start=${isoDate(prevStart)}`);
  });
  const nextBtn = container.querySelector('#next-period');
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/history?view=${view}&start=${isoDate(nextStart)}`);
    });
  }

  // Today pill
  const todayBtn = container.querySelector('#today-pill');
  if (todayBtn) {
    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = view === 'month' ? monthStart(today) : weekStart(today);
      navigate(`#/history?view=${view}&start=${isoDate(target)}`);
    });
  }

  // Day-cell tap → day-view
  container.querySelectorAll('.week-row, .month-cell').forEach(el => {
    if (el.classList.contains('outside') || el.classList.contains('future')) return;
    el.addEventListener('click', () => {
      const iso = el.getAttribute('data-date');
      navigate(`#/day?date=${iso}`);
    });
  });
}

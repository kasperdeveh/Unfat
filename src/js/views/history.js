import { getMyProfile } from '../db/profiles.js';
import { listProfileHistory } from '../db/profile_history.js';
import { listEntriesForDateRange } from '../db/entries.js';
import {
  parseIso, isoDate, weekStart, weekEnd, monthStart, monthEnd,
  addDays, addMonthsKeepDay, isoWeekNumber, formatWeekRangeNl, formatMonthNl,
} from '../utils/dates.js';
import { renderWeekRows, computeWeekStats } from './components/week-view.js';
import { renderMonthGrid, computeMonthStats } from './components/month-view.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../utils/html.js';

export async function render(container, params) {
  const view = params?.view === 'month' ? 'month' : 'week';
  const today = new Date();

  // Anchor = a representative day. Survives toggles, moves with arrows so
  // toggling Week ↔ Maand keeps you in the same neighbourhood. Defaults to
  // today on first load. Legacy `start` param is converted to a sensible
  // anchor for back-compat with old links.
  let anchor;
  if (params?.anchor) {
    anchor = parseIso(params.anchor);
  } else if (params?.start) {
    const s = parseIso(params.start);
    // Pick mid-period so weekStart/monthStart of it stays inside.
    anchor = view === 'week' ? addDays(s, 3) : addDays(s, 14);
  } else {
    anchor = today;
  }

  // Period start derived from anchor.
  const start = view === 'month' ? monthStart(anchor) : weekStart(anchor);

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

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
    container.innerHTML = `<p class="error">Kon historie niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  const fbTarget = profile.daily_target_kcal;
  const fbMax = profile.daily_max_kcal;

  const stats = view === 'month'
    ? computeMonthStats(start, entries, history, fbTarget, fbMax)
    : computeWeekStats(start, entries, history, fbTarget, fbMax);

  // Period title + sub-label (with today-pill if not current period)
  const todayIso = isoDate(today);
  const startIso = isoDate(start);
  let title, sub, isCurrent;
  if (view === 'month') {
    title = formatMonthNl(start);
    isCurrent = start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth();
    sub = isCurrent
      ? 'deze maand'
      : `<button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;
  } else {
    title = formatWeekRangeNl(start);
    isCurrent = startIso === isoDate(weekStart(today));
    const wnr = isoWeekNumber(start);
    sub = isCurrent
      ? `Week ${wnr} · deze week`
      : `Week ${wnr} · <button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;
  }

  // Arrow targets shift the anchor by one period. ISO-string compare for time-of-day robustness.
  const prevAnchor = view === 'month' ? addMonthsKeepDay(anchor, -1) : addDays(anchor, -7);
  const nextAnchor = view === 'month' ? addMonthsKeepDay(anchor, 1) : addDays(anchor, 7);
  const nextStart = view === 'month' ? monthStart(nextAnchor) : weekStart(nextAnchor);
  const nextDisabled = isoDate(nextStart) > todayIso;

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

  // Toggle handlers — anchor stays the same, only view changes.
  container.querySelectorAll('.history-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const newView = btn.getAttribute('data-view');
      if (newView === view) return;
      navigate(`#/history?view=${newView}&anchor=${isoDate(anchor)}`);
    });
  });

  // Period arrows — shift anchor, view stays.
  container.querySelector('#prev-period').addEventListener('click', () => {
    navigate(`#/history?view=${view}&anchor=${isoDate(prevAnchor)}`);
  });
  const nextBtn = container.querySelector('#next-period');
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/history?view=${view}&anchor=${isoDate(nextAnchor)}`);
    });
  }

  // Today pill — anchor = today, view stays.
  const todayBtn = container.querySelector('#today-pill');
  if (todayBtn) {
    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`#/history?view=${view}&anchor=${todayIso}`);
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

import { getMyProfile } from '../db/profiles.js';
import { listProfileHistory } from '../db/profile_history.js';
import { listEntriesForDateRange } from '../db/entries.js';
import { listFriendBuckets } from '../db/friendships.js';
import { supabase } from '../supabase.js';
import {
  parseIso, isoDate, weekStart, weekEnd, monthStart, monthEnd,
  addDays, addMonthsKeepDay, isoWeekNumber, formatWeekRangeNl, formatMonthNl,
  formatDayLongNl,
} from '../utils/dates.js';
import { renderWeekRows, computeWeekStats } from './components/week-view.js';
import { renderMonthGrid, computeMonthStats } from './components/month-view.js';
import { mount as mountPersonSelector } from './components/person-selector.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../utils/html.js';
import { showToast } from '../ui.js';

export async function render(container, params) {
  const view = params?.view === 'month' ? 'month' :
               params?.view === 'day'   ? 'day'   : 'week';
  const friendId = params?.friend || null;
  const today = new Date();
  const todayIsoStr = isoDate(today);

  // Anchor (week/month) or date (day) — same fallback chain as before, plus 'date' for day-view.
  let anchor;
  if (params?.anchor) {
    anchor = parseIso(params.anchor);
  } else if (params?.date && view === 'day') {
    anchor = parseIso(params.date);
  } else if (params?.start) {
    const s = parseIso(params.start);
    anchor = view === 'week' ? addDays(s, 3) : addDays(s, 14);
  } else {
    anchor = today;
  }

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  // Load profile + friends list (for selector) in parallel.
  let profile, buckets, friendsForSelector;
  try {
    [profile, buckets] = await Promise.all([
      getMyProfile(),
      listFriendBuckets(),
    ]);
    const ids = buckets.accepted.map(r => r.friend_id);

    // Each friend needs share_level for the selector's none-guard. Read in one round-trip.
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, handle, share_level')
        .in('id', ids);
      if (error) throw error;
      friendsForSelector = (data || []).map(p => ({
        id: p.id, handle: p.handle, share_level: p.share_level,
      }));
    } else {
      friendsForSelector = [];
    }
  } catch (err) {
    container.innerHTML = `<p class="error">Kon historie niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  // Build the page shell: selector + view-toggle + content slot
  const dateIso = view === 'day' ? isoDate(anchor) : null;
  const start = view === 'month' ? monthStart(anchor) : view === 'week' ? weekStart(anchor) : null;

  container.innerHTML = `
    <h1 class="page-title">Historie</h1>
    <div id="person-selector-mount"></div>
    <div class="history-toggle">
      <button data-view="day"   class="${view === 'day'   ? 'active' : ''}">Dag</button>
      <button data-view="week"  class="${view === 'week'  ? 'active' : ''}">Week</button>
      <button data-view="month" class="${view === 'month' ? 'active' : ''}">Maand</button>
    </div>
    <div id="history-content"></div>
  `;

  // Mount selector
  mountPersonSelector(container.querySelector('#person-selector-mount'), {
    friends: friendsForSelector,
    currentFriendId: friendId,
    onSelect: (newFriendId) => {
      const qp = new URLSearchParams();
      qp.set('view', view);
      if (view === 'day') qp.set('date', dateIso);
      else qp.set('anchor', isoDate(start));
      if (newFriendId) qp.set('friend', newFriendId);
      navigate('#/history?' + qp.toString());
    },
    onShareNoneTap: (f) => {
      showToast(`${f.handle} deelt geen voortgang`);
    },
  });

  // Wire view-toggle (anchor preservation)
  container.querySelectorAll('.history-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const newView = btn.getAttribute('data-view');
      if (newView === view) return;
      const qp = new URLSearchParams();
      qp.set('view', newView);
      if (newView === 'day') {
        qp.set('date', view === 'day' ? dateIso : isoDate(anchor));
      } else {
        qp.set('anchor', view === 'day' ? dateIso : isoDate(anchor));
      }
      if (friendId) qp.set('friend', friendId);
      navigate('#/history?' + qp.toString());
    });
  });

  // Render content based on (view, friendId)
  const content = container.querySelector('#history-content');

  if (view === 'day' && !friendId) {
    // Solo dag-view: delegate to day.js (full edit-/add-flow). historyMode keeps
    // the ‹ › nav inside #/history instead of routing back to #/day.
    const dayMod = await import('./day.js');
    await dayMod.render(content, { date: dateIso }, { historyMode: true });
    return;
  }

  if (view === 'day' && friendId) {
    const friendHandle = friendsForSelector.find(f => f.id === friendId)?.handle || 'Vriend';
    const compareDay = await import('./components/compare-day.js');
    const reload = () => render(container, params);
    await compareDay.render(content, { friendId, friendHandle, dateIso, myProfile: profile, reloadFn: reload });

    // Wire ‹ › nav (re-render history with prev/next date)
    const prevDate = isoDate(addDays(parseIso(dateIso), -1));
    const nextDate = isoDate(addDays(parseIso(dateIso), 1));
    const nextDisabled = nextDate > todayIsoStr;
    const navHtml = `
      <div class="day-nav" style="margin-top:14px;">
        <button class="day-nav-btn" id="prev-day">‹</button>
        <p class="page-subtitle" style="margin:0 1rem;">${formatDayLongNl(parseIso(dateIso))}</p>
        <button class="day-nav-btn" id="next-day" ${nextDisabled ? 'disabled' : ''}>›</button>
      </div>
    `;
    content.insertAdjacentHTML('afterbegin', navHtml);
    content.querySelector('#prev-day').addEventListener('click', () => {
      navigate(`#/history?friend=${friendId}&view=day&date=${prevDate}`);
    });
    const nextBtn = content.querySelector('#next-day');
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.addEventListener('click', () => {
        navigate(`#/history?friend=${friendId}&view=day&date=${nextDate}`);
      });
    }
    return;
  }

  if (view === 'week' && !friendId) {
    await renderSoloWeek(content, profile, start);
    return;
  }

  if (view === 'week' && friendId) {
    const friendHandle = friendsForSelector.find(f => f.id === friendId)?.handle || 'Vriend';
    await renderCompareWeek(content, profile, start, friendId, friendHandle, todayIsoStr);
    return;
  }

  if (view === 'month' && !friendId) {
    await renderSoloMonth(content, profile, start);
    return;
  }

  // view === 'month' && friendId
  const friendHandle = friendsForSelector.find(f => f.id === friendId)?.handle || 'Vriend';
  await renderCompareMonth(content, profile, start, friendId, friendHandle, todayIsoStr);
}

// ---- Solo helpers (extracted from old history.js) ----

async function renderSoloWeek(content, profile, start) {
  const today = new Date();
  const todayIsoStr = isoDate(today);
  const rangeStart = weekStart(start);
  const rangeEnd = weekEnd(start);

  let history, entries;
  try {
    [history, entries] = await Promise.all([
      listProfileHistory(),
      listEntriesForDateRange(isoDate(rangeStart), isoDate(rangeEnd)),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }

  const fbTarget = profile.daily_target_kcal;
  const fbMax = profile.daily_max_kcal;
  const stats = computeWeekStats(start, entries, history, fbTarget, fbMax);
  const title = formatWeekRangeNl(start);
  const isCurrent = isoDate(start) === isoDate(weekStart(today));
  const wnr = isoWeekNumber(start);
  const sub = isCurrent
    ? `Week ${wnr} · deze week`
    : `Week ${wnr} · <button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;

  const prevAnchor = addDays(start, -7);
  const nextAnchor = addDays(start, 7);
  const nextDisabled = isoDate(weekStart(nextAnchor)) > todayIsoStr;

  content.innerHTML = `
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
    <div class="week-list">${renderWeekRows(start, entries, history, fbTarget, fbMax)}</div>
  `;

  wirePeriodNav(content, 'week', prevAnchor, nextAnchor, todayIsoStr);

  // Week-row tap → solo dag-view in /history
  content.querySelectorAll('.week-row').forEach(el => {
    if (el.classList.contains('outside') || el.classList.contains('future')) return;
    el.addEventListener('click', () => {
      const iso = el.getAttribute('data-date');
      navigate(`#/history?view=day&date=${iso}`);
    });
  });
}

async function renderSoloMonth(content, profile, start) {
  const today = new Date();
  const todayIsoStr = isoDate(today);
  const rangeStart = monthStart(start);
  const rangeEnd = monthEnd(start);

  let history, entries;
  try {
    [history, entries] = await Promise.all([
      listProfileHistory(),
      listEntriesForDateRange(isoDate(rangeStart), isoDate(rangeEnd)),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    return;
  }

  const fbTarget = profile.daily_target_kcal;
  const fbMax = profile.daily_max_kcal;
  const stats = computeMonthStats(start, entries, history, fbTarget, fbMax);
  const title = formatMonthNl(start);
  const isCurrent = start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth();
  const sub = isCurrent
    ? 'deze maand'
    : `<button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;

  const prevAnchor = addMonthsKeepDay(start, -1);
  const nextAnchor = addMonthsKeepDay(start, 1);
  const nextDisabled = isoDate(monthStart(nextAnchor)) > todayIsoStr;

  content.innerHTML = `
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
    ${renderMonthGrid(start, entries, history, fbTarget, fbMax)}
  `;

  wirePeriodNav(content, 'month', prevAnchor, nextAnchor, todayIsoStr);

  // Day-cell tap → solo dag-view in /history
  content.querySelectorAll('.month-cell').forEach(el => {
    if (el.classList.contains('outside') || el.classList.contains('future')) return;
    el.addEventListener('click', () => {
      const iso = el.getAttribute('data-date');
      navigate(`#/history?view=day&date=${iso}`);
    });
  });
}

function wirePeriodNav(content, view, prevAnchor, nextAnchor, todayIsoStr) {
  content.querySelector('#prev-period').addEventListener('click', () => {
    navigate(`#/history?view=${view}&anchor=${isoDate(prevAnchor)}`);
  });
  const nextBtn = content.querySelector('#next-period');
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/history?view=${view}&anchor=${isoDate(nextAnchor)}`);
    });
  }
  const todayBtn = content.querySelector('#today-pill');
  if (todayBtn) {
    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`#/history?view=${view}&anchor=${todayIsoStr}`);
    });
  }
}

async function renderCompareWeek(content, profile, start, friendId, friendHandle, todayIsoStr) {
  const prevAnchor = addDays(start, -7);
  const nextAnchor = addDays(start, 7);
  const nextDisabled = isoDate(weekStart(nextAnchor)) > todayIsoStr;
  const isCurrent = isoDate(start) === isoDate(weekStart(new Date()));
  const wnr = isoWeekNumber(start);
  const sub = isCurrent
    ? `Week ${wnr} · deze week`
    : `Week ${wnr} · <button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;
  content.innerHTML = `
    <div class="period-nav">
      <button class="period-arrow" id="prev-period">‹</button>
      <div class="period-title">
        <div class="period-title-main">${formatWeekRangeNl(start)}</div>
        <div class="period-title-sub">${sub}</div>
      </div>
      <button class="period-arrow" id="next-period" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div id="compare-week-content"></div>
  `;
  wireComparePeriodNav(content, 'week', prevAnchor, nextAnchor, todayIsoStr, friendId);

  const compareWeek = await import('./components/compare-week.js');
  await compareWeek.render(content.querySelector('#compare-week-content'), {
    friendId, friendHandle, weekStartDate: start, myProfile: profile,
  });
}

function wireComparePeriodNav(content, view, prevAnchor, nextAnchor, todayIsoStr, friendId) {
  content.querySelector('#prev-period').addEventListener('click', () => {
    navigate(`#/history?friend=${friendId}&view=${view}&anchor=${isoDate(prevAnchor)}`);
  });
  const nextBtn = content.querySelector('#next-period');
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/history?friend=${friendId}&view=${view}&anchor=${isoDate(nextAnchor)}`);
    });
  }
  const todayBtn = content.querySelector('#today-pill');
  if (todayBtn) {
    todayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`#/history?friend=${friendId}&view=${view}&anchor=${todayIsoStr}`);
    });
  }
}

async function renderCompareMonth(content, profile, start, friendId, friendHandle, todayIsoStr) {
  const prevAnchor = addMonthsKeepDay(start, -1);
  const nextAnchor = addMonthsKeepDay(start, 1);
  const nextDisabled = isoDate(monthStart(nextAnchor)) > todayIsoStr;
  const today = new Date();
  const isCurrent = start.getFullYear() === today.getFullYear() && start.getMonth() === today.getMonth();
  const sub = isCurrent
    ? 'deze maand'
    : `<button class="today-pill" id="today-pill"><span class="today-pill-icon">⌖</span> vandaag</button>`;
  content.innerHTML = `
    <div class="period-nav">
      <button class="period-arrow" id="prev-period">‹</button>
      <div class="period-title">
        <div class="period-title-main">${formatMonthNl(start)}</div>
        <div class="period-title-sub">${sub}</div>
      </div>
      <button class="period-arrow" id="next-period" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div id="compare-month-content"></div>
  `;
  wireComparePeriodNav(content, 'month', prevAnchor, nextAnchor, todayIsoStr, friendId);

  const compareMonth = await import('./components/compare-month.js');
  await compareMonth.render(content.querySelector('#compare-month-content'), {
    friendId, friendHandle, monthStartDate: start, myProfile: profile,
  });
}

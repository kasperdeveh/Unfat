import { addDays, isoDate, monthStart, monthEnd } from '../../utils/dates.js';
import { heroState } from '../../calc.js';
import { frBarClass } from './compare-shared.js';
import { listProfileHistory, getTargetForDate } from '../../db/profile_history.js';
import { listEntriesForDateRange } from '../../db/entries.js';
import { getFriendPeriod } from '../../db/friendships.js';
import { navigate } from '../../router.js';
import { escapeHtml } from '../../utils/html.js';

/**
 * Render compare month-view: kalender-grid met 2 mini verticale bars per cel.
 *
 * @param {HTMLElement} content
 * @param {object} opts
 * @param {string} opts.friendId
 * @param {string} opts.friendHandle
 * @param {Date} opts.monthStartDate
 * @param {object} opts.myProfile — own profile (passed from history orchestrator to avoid a refetch)
 */
export async function render(content, { friendId, friendHandle, monthStartDate, myProfile }) {
  const start = monthStart(monthStartDate);
  const startIso = isoDate(start);
  const endIso = isoDate(monthEnd(start));

  let myEntries, myHistory, friendData;
  try {
    [myEntries, myHistory, friendData] = await Promise.all([
      listEntriesForDateRange(startIso, endIso),
      listProfileHistory(),
      getFriendPeriod(friendId, startIso, endIso),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">Kon vergelijking niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (friendData.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:24px;text-align:center;">${escapeHtml(friendHandle)} deelt geen voortgang.</p>`;
    return;
  }

  const fbTarget = myProfile.daily_target_kcal;
  const fbMax = myProfile.daily_max_kcal;
  const todayIsoStr = isoDate(new Date());

  const friendDays = new Map();
  for (const d of (friendData.days || [])) friendDays.set(d.date, d);

  // Calendar layout: 6 rows × 7 cols starting at Monday of the week containing the 1st
  const firstWeekday = start.getDay(); // 0=Sun
  const offsetToMon = (firstWeekday + 6) % 7;
  const gridStart = addDays(start, -offsetToMon);

  let myKcalSum = 0, frKcalSum = 0, myDays = 0, frDays = 0, myMet = 0, frMet = 0;
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const iso = isoDate(d);
    const inMonth = d.getMonth() === start.getMonth();
    const isFuture = iso > todayIsoStr;
    const isToday = iso === todayIsoStr;

    const dayEntries = myEntries.filter(e => e.date === iso);
    const myTotal = dayEntries.reduce((s, e) => s + e.kcal, 0);
    const myT = getTargetForDate(myHistory, iso) || { target: fbTarget, max: fbMax };
    const myState = myTotal === 0 ? null : heroState(myTotal, myT.target, myT.max);
    const myPct = myT.target > 0 ? Math.min(100, Math.round(myTotal / myT.target * 100)) : 0;

    const fr = friendDays.get(iso);
    const frTotal = fr?.total_kcal || 0;
    const frTarget = fr?.target || null;
    const frMax = fr?.max || null;
    const frState = frTotal === 0
      ? null
      : (frTarget != null && frMax != null) ? heroState(frTotal, frTarget, frMax) : 'green';
    const frPct = frTarget > 0 ? Math.min(100, Math.round(frTotal / frTarget * 100)) : 0;

    if (inMonth && !isFuture && myTotal > 0) {
      myKcalSum += myTotal; myDays++;
      if (myTotal <= myT.target) myMet++;
    }
    if (inMonth && !isFuture && frTotal > 0) {
      frKcalSum += frTotal; frDays++;
      if (frTarget && frTotal <= frTarget) frMet++;
    }

    const cls = [
      'compare-month-cell',
      !inMonth ? 'outside' : '',
      isFuture ? 'future' : '',
      isToday ? 'today' : '',
    ].filter(Boolean).join(' ');

    const myFillCls = myState ? `state-${myState}` : '';
    const frFillCls = frBarClass(frState);

    cells.push(`
      <div class="${cls}" data-date="${iso}" data-in-month="${inMonth}">
        <span class="compare-month-cell-num">${d.getDate()}</span>
        ${inMonth && !isFuture ? `
          <div class="compare-month-cell-bars">
            <div class="compare-month-cell-bar ${myFillCls}" style="height:${Math.max(myState ? 10 : 0, myPct * 0.7)}%"></div>
            <div class="compare-month-cell-bar ${frFillCls}" style="height:${Math.max(frState ? 10 : 0, frPct * 0.7)}%"></div>
          </div>
        ` : ''}
      </div>
    `);
  }

  const myAvg = myDays === 0 ? 0 : Math.round(myKcalSum / myDays);
  const frAvg = frDays === 0 ? 0 : Math.round(frKcalSum / frDays);

  content.innerHTML = `
    <div class="period-stats compare-stats">
      <div class="period-stat">
        <div class="period-stat-label">Gemiddeld per dag</div>
        <div class="period-stat-value">${myAvg === 0 ? '—' : myAvg + ' kcal'}<small style="display:block;color:var(--text-muted);">${frAvg === 0 ? '—' : frAvg + ' kcal'}</small></div>
      </div>
      <div class="period-stat">
        <div class="period-stat-label">Doel gehaald</div>
        <div class="period-stat-value">${myMet} / ${myDays}<small style="display:block;color:var(--text-muted);">${frMet} / ${frDays}</small></div>
      </div>
    </div>
    <div class="month-weekdays">
      <div>ma</div><div>di</div><div>wo</div><div>do</div><div>vr</div><div>za</div><div>zo</div>
    </div>
    <div class="month-grid">${cells.join('')}</div>
  `;

  content.querySelectorAll('.compare-month-cell').forEach(cell => {
    if (cell.classList.contains('outside') || cell.classList.contains('future')) return;
    cell.addEventListener('click', () => {
      const iso = cell.getAttribute('data-date');
      navigate(`#/history?friend=${friendId}&view=day&date=${iso}`);
    });
  });
}

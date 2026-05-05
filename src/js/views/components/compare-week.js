import { addDays, isoDate, shortWeekdayNl, weekEnd } from '../../utils/dates.js';
import { heroState } from '../../calc.js';
import { frBarClass } from './compare-shared.js';
import { listProfileHistory, getTargetForDate } from '../../db/profile_history.js';
import { listEntriesForDateRange } from '../../db/entries.js';
import { getFriendPeriod } from '../../db/friendships.js';
import { navigate } from '../../router.js';
import { escapeHtml } from '../../utils/html.js';

/**
 * Render compare week-view: 7 dag-rijen met dual horizontal bars (vol = ik, gestreept = vriend).
 *
 * @param {HTMLElement} content
 * @param {object} opts
 * @param {string} opts.friendId
 * @param {string} opts.friendHandle
 * @param {Date} opts.weekStartDate
 * @param {object} opts.myProfile — own profile (passed from history orchestrator to avoid a refetch)
 */
export async function render(content, { friendId, friendHandle, weekStartDate, myProfile }) {
  const startIso = isoDate(weekStartDate);
  const endIso = isoDate(weekEnd(weekStartDate));

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

  // Index friend days by date for O(1) lookup
  const friendDays = new Map();
  for (const d of (friendData.days || [])) friendDays.set(d.date, d);

  const rowsHtml = [];
  let myKcalSum = 0, frKcalSum = 0, myDays = 0, frDays = 0, myMet = 0, frMet = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStartDate, i);
    const iso = isoDate(d);
    const isFuture = iso > todayIsoStr;

    const dayEntries = myEntries.filter(e => e.date === iso);
    const myTotal = dayEntries.reduce((s, e) => s + e.kcal, 0);
    const myT = getTargetForDate(myHistory, iso) || { target: fbTarget, max: fbMax };
    const myState = myTotal === 0 ? 'empty' : heroState(myTotal, myT.target, myT.max);
    const myPct = myT.target > 0 ? Math.min(100, Math.round(myTotal / myT.target * 100)) : 0;

    const fr = friendDays.get(iso);
    const frTotal = fr?.total_kcal || 0;
    const frTarget = fr?.target || null;
    const frMax = fr?.max || null;
    const frState = frTotal === 0
      ? null
      : (frTarget != null && frMax != null) ? heroState(frTotal, frTarget, frMax) : 'green';
    const frPct = frTarget > 0 ? Math.min(100, Math.round(frTotal / frTarget * 100)) : 0;

    if (!isFuture && myTotal > 0) { myKcalSum += myTotal; myDays++; if (myTotal <= myT.target) myMet++; }
    if (!isFuture && frTotal > 0) { frKcalSum += frTotal; frDays++; if (frTarget && frTotal <= frTarget) frMet++; }

    const myFillCls = myState === 'empty' ? '' : `state-${myState}`;
    const frFillCls = frBarClass(frState);

    rowsHtml.push(`
      <div class="compare-week-row${isFuture ? ' future' : ''}" data-date="${iso}">
        <span class="day-label">${shortWeekdayNl(d)}</span>
        <div class="compare-week-bars">
          <div class="compare-week-bar"><div class="compare-week-bar-fill ${myFillCls}" style="width:${myPct}%"></div></div>
          <div class="compare-week-bar"><div class="compare-week-bar-fill ${frFillCls}" style="width:${frPct}%"></div></div>
        </div>
        <span class="compare-week-kcal">${myTotal === 0 ? '—' : myTotal}<small>${frTotal === 0 ? '—' : frTotal}</small></span>
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
    <div class="week-list">${rowsHtml.join('')}</div>
  `;

  content.querySelectorAll('.compare-week-row').forEach(row => {
    if (row.classList.contains('future')) return;
    row.addEventListener('click', () => {
      const iso = row.getAttribute('data-date');
      navigate(`#/history?friend=${friendId}&view=day&date=${iso}`);
    });
  });
}

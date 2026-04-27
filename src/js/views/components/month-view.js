import { addDays, monthStart, monthEnd, isoDate, isSameDay } from '../../utils/dates.js';
import { heroState } from '../../calc.js';
import { getTargetForDate } from '../../db/profile_history.js';

// Render a calendar grid for the month containing `monthDate`.
// Cells: weekday header row + grid with leading/trailing days from neighbour months greyed out.
export function renderMonthGrid(monthDate, entries, history, fallbackTarget, fallbackMax) {
  const start = monthStart(monthDate);
  const end = monthEnd(monthDate);
  const today = new Date();

  // Calendar starts from Monday of the week containing `start`.
  const firstWeekday = start.getDay(); // 0=Sun
  const offsetToMon = (firstWeekday + 6) % 7; // 0 for Mon, 6 for Sun
  const gridStart = addDays(start, -offsetToMon);
  // Show 6 weeks (42 cells) — handles all month layouts.
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const inMonth = d.getMonth() === start.getMonth();
    const iso = isoDate(d);
    const dayEntries = entries.filter(e => e.date === iso);
    const total = dayEntries.reduce((s, e) => s + e.kcal, 0);
    const t = getTargetForDate(history, iso) || { target: fallbackTarget, max: fallbackMax };
    const state = !inMonth ? 'outside' : (total === 0 ? 'empty' : heroState(total, t.target, t.max));
    const isToday = isSameDay(d, today);
    const isFuture = d > today;

    cells.push(`
      <div class="month-cell ${state}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}"
           data-date="${iso}" data-in-month="${inMonth}">
        <div class="month-cell-num">${d.getDate()}</div>
        ${inMonth && total > 0 ? `<div class="month-cell-kcal state-${state}">${total}</div>` :
          inMonth && !isFuture ? `<div class="month-cell-kcal empty">—</div>` : ''}
      </div>
    `);
  }

  return `
    <div class="month-weekdays">
      <div>ma</div><div>di</div><div>wo</div><div>do</div><div>vr</div><div>za</div><div>zo</div>
    </div>
    <div class="month-grid">${cells.join('')}</div>
  `;
}

// Stats for the displayed month (avg kcal, days met).
export function computeMonthStats(monthDate, entries, history, fallbackTarget, fallbackMax) {
  const start = monthStart(monthDate);
  const end = monthEnd(monthDate);
  const today = new Date();
  let totalKcalSum = 0;
  let daysWithEntries = 0;
  let daysMet = 0;
  for (let d = new Date(start); d <= end && d <= today; d = addDays(d, 1)) {
    const iso = isoDate(d);
    const dayEntries = entries.filter(e => e.date === iso);
    if (dayEntries.length === 0) continue;
    daysWithEntries += 1;
    const total = dayEntries.reduce((s, e) => s + e.kcal, 0);
    totalKcalSum += total;
    const t = getTargetForDate(history, iso) || { target: fallbackTarget };
    if (total <= t.target) daysMet += 1;
  }
  return {
    avgKcal: daysWithEntries === 0 ? 0 : Math.round(totalKcalSum / daysWithEntries),
    daysMet,
    daysWithEntries,
  };
}

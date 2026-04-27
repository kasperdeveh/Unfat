import { addDays, isoDate, shortWeekdayNl, isSameDay } from '../../utils/dates.js';
import { heroState } from '../../calc.js';
import { getTargetForDate } from '../../db/profile_history.js';

// Render 7 day-rows for the week starting at `weekStartDate`.
// Returns HTML string (caller injects into DOM).
// entries: result of listEntriesForDateRange covering this week
// history: result of listProfileHistory
// fallbackTarget/Max: profiles values, used when history has no row for a date
export function renderWeekRows(weekStartDate, entries, history, fallbackTarget, fallbackMax) {
  const today = new Date();
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStartDate, i);
    const iso = isoDate(d);
    const dayEntries = entries.filter(e => e.date === iso);
    const total = dayEntries.reduce((s, e) => s + e.kcal, 0);
    const t = getTargetForDate(history, iso) || { target: fallbackTarget, max: fallbackMax };
    const state = total === 0 ? 'empty' : heroState(total, t.target, t.max);
    const isToday = isSameDay(d, today);
    const isFuture = d > today;
    const barPct = t.target > 0 ? Math.min(100, Math.round(total / t.target * 100)) : 0;

    rows.push(`
      <div class="week-row ${state}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}" data-date="${iso}">
        <div class="week-row-day">
          <div class="week-row-name">${shortWeekdayNl(d)}</div>
          <div class="week-row-num">${d.getDate()}</div>
        </div>
        <div class="week-row-bar"><div class="week-row-bar-fill state-${state}" style="width: ${barPct}%"></div></div>
        <div class="week-row-kcal state-${state}">${total === 0 ? '—' : total}</div>
      </div>
    `);
  }
  return rows.join('');
}

// Compute period stats (avg kcal, days target met) for a list of entries
// over a date range, using history+fallback.
export function computeWeekStats(weekStartDate, entries, history, fallbackTarget, fallbackMax) {
  let totalKcalSum = 0;
  let daysWithEntries = 0;
  let daysMet = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStartDate, i);
    if (d > new Date()) continue; // skip future days
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

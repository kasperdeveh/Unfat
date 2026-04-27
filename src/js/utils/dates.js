// Date helpers for history sub-project. All work in local time;
// `date` columns in DB are date-only (YYYY-MM-DD), no timezone.

// Format date as YYYY-MM-DD (matches DB date column).
export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Parse YYYY-MM-DD into a Date at local midnight.
export function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Monday of the week containing `d` (ISO week — Mon is start of week).
export function weekStart(d) {
  const result = new Date(d);
  const day = result.getDay(); // 0 = Sunday, 1 = Monday...
  const diff = (day === 0 ? -6 : 1 - day);
  result.setDate(result.getDate() + diff);
  return result;
}

// Sunday of the week containing `d`.
export function weekEnd(d) {
  const start = weekStart(d);
  start.setDate(start.getDate() + 6);
  return start;
}

// First day of the month containing `d`.
export function monthStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Last day of the month containing `d`.
export function monthEnd(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// Add days to a date (returns new Date).
export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Add n months; always returns the 1st of the target month (used for month navigation).
export function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

// Add n months while keeping the day-of-month, clamped to last day of the target.
// E.g. 31 jan + 1 month → 28/29 feb. Used for shifting an anchor across months.
export function addMonthsKeepDay(d, n) {
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), lastDay));
}

// ISO 8601 week number for given date.
export function isoWeekNumber(d) {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // 0 = Mon
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / (7 * 24 * 3600 * 1000));
}

// "13 — 19 april" — week range, NL.
export function formatWeekRangeNl(start) {
  const end = weekEnd(start);
  const startMonth = start.toLocaleDateString('nl-NL', { month: 'long' });
  const endMonth = end.toLocaleDateString('nl-NL', { month: 'long' });
  if (startMonth === endMonth) {
    return `${start.getDate()} — ${end.getDate()} ${endMonth}`;
  }
  return `${start.getDate()} ${startMonth} — ${end.getDate()} ${endMonth}`;
}

// "april 2026"
export function formatMonthNl(d) {
  return d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
}

// "Donderdag 16 april" (full long for day-view header)
export function formatDayLongNl(d) {
  const s = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "ma" — short weekday in NL, lowercase.
export function shortWeekdayNl(d) {
  return d.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '');
}

// True if two dates are the same day.
export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

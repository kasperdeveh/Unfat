// Calculate kcal for a given amount of grams of a product.
// product: { kcal_per_100g, unit_grams }
// inputType: 'grams' | 'units'
// inputValue: number
export function calcKcal(product, inputType, inputValue) {
  const grams = (inputType === 'units')
    ? inputValue * (product.unit_grams || 0)
    : inputValue;
  return Math.round(grams * product.kcal_per_100g / 100);
}

// Convert input value to grams (so we can store amount_grams consistently).
export function toGrams(product, inputType, inputValue) {
  return (inputType === 'units')
    ? inputValue * (product.unit_grams || 0)
    : inputValue;
}

// Determine hero state based on consumed vs target/max.
// Returns: 'green' | 'orange' | 'red'
export function heroState(consumedKcal, targetKcal, maxKcal) {
  if (consumedKcal > maxKcal) return 'red';
  if (consumedKcal > targetKcal) return 'orange';
  return 'green';
}

// Format date as Dutch long form, e.g. "vrijdag 26 april".
export function formatDateNl(date = new Date()) {
  return date.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// Today as YYYY-MM-DD in LOCAL time (for `entries.date` column).
// Earlier this used `toISOString()` which is UTC — that put entries from
// the late evening (after local midnight UTC) on the wrong calendar day.
import { isoDate } from './utils/dates.js';
export function todayIso() {
  return isoDate(new Date());
}

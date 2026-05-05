/**
 * Translate a kcal heroState (`green`/`orange`/`red`) to the friend-bar
 * striped CSS class. Returns '' for null/empty/unknown so it can be inlined
 * into a class string without producing the literal "undefined".
 */
export function frBarClass(state) {
  if (state === 'green')  return 'bar-fr-ok';
  if (state === 'orange') return 'bar-fr-warn';
  if (state === 'red')    return 'bar-fr-bad';
  return '';
}

// Tokenized product search. Used by the add-food page and the dish-component
// picker so scoring is consistent across the app.

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Higher score = better match. 0 = no match.
// Multi-token query: AND-match (every token must hit), total = sum of per-token scores.
export function scoreProductQuery(product, q) {
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const token of tokens) {
    const s = scoreToken(product, token);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

// Per-token scoring. Name beats synonym; word-boundary beats substring;
// prefix-at-word-end beats prefix-into-letter ("Appel m schil" > "Appelcarre").
function scoreToken(product, q) {
  const wordRe = new RegExp(`\\b${escapeRegex(q)}`);
  const name = normalize(product.name);
  if (name === q) return 1000;
  if (name.startsWith(q)) {
    return /\w/.test(name.charAt(q.length)) ? 750 : 850;
  }
  if (wordRe.test(name)) return 600;
  let best = name.includes(q) ? 200 : 0;
  if (Array.isArray(product.synonyms)) {
    for (const syn of product.synonyms) {
      const s = normalize(syn);
      if (s === q) best = Math.max(best, 500);
      else if (s.startsWith(q)) {
        best = Math.max(best, /\w/.test(s.charAt(q.length)) ? 375 : 425);
      }
      else if (wordRe.test(s)) best = Math.max(best, 300);
      else if (s.includes(q))  best = Math.max(best, 100);
    }
  }
  return best;
}

// Sort + cap helper used by both consumers.
// Returns top N products, scored & ranked, given a normalized query string.
export function rankProducts(products, normalizedQuery, limit = 50) {
  return products
    .map(p => ({ p, score: scoreProductQuery(p, normalizedQuery) }))
    .filter(x => x.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      a.p.name.length - b.p.name.length ||
      a.p.name.localeCompare(b.p.name, 'nl'))
    .slice(0, limit)
    .map(x => x.p);
}

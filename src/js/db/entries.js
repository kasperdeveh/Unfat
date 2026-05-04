import { supabase } from '../supabase.js';

export async function listEntriesForDate(dateIso) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('entries')
    .select('id, product_id, amount_grams, kcal, meal_type, date, products(id, name, unit_grams)')
    .eq('user_id', session.user.id)
    .eq('date', dateIso)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createEntry({ product_id, amount_grams, kcal, meal_type, date, dish_id }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: session.user.id,
      product_id,
      amount_grams,
      kcal,
      meal_type,
      date: date || new Date().toISOString().slice(0, 10),
      dish_id: dish_id || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Update an existing entry. Caller passes recomputed kcal + amount_grams.
export async function updateEntry(id, { amount_grams, kcal, meal_type }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('entries')
    .update({ amount_grams, kcal, meal_type })
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Delete an entry by id (RLS ensures user can only delete own rows).
export async function deleteEntry(id) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

  if (error) throw error;
}

// Entries between two ISO dates (inclusive). Used for week/month aggregation.
export async function listEntriesForDateRange(startIso, endIso) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('entries')
    .select('id, amount_grams, kcal, meal_type, date')
    .eq('user_id', session.user.id)
    .gte('date', startIso)
    .lte('date', endIso)
    .order('date', { ascending: true });

  if (error) throw error;
  return data;
}

// Insert multiple entries in one round-trip. Used by dish-log to expand
// a dish into N entries. RLS still applies per row.
// rows: [{ product_id, amount_grams, kcal, meal_type, date, dish_id }, ...]
export async function bulkCreateEntries(rows) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const enriched = rows.map(r => ({
    user_id: session.user.id,
    product_id: r.product_id,
    amount_grams: r.amount_grams,
    kcal: r.kcal,
    meal_type: r.meal_type,
    date: r.date || new Date().toISOString().slice(0, 10),
    dish_id: r.dish_id || null,
  }));

  const { data, error } = await supabase
    .from('entries')
    .insert(enriched)
    .select();
  if (error) throw error;
  return data;
}

// Returns up to `limit` distinct items (products + dishes) the current user
// recently logged, ordered by most recent. A 'recent item' is keyed on
// dish_id when present (one row per dish-log), else on product_id.
//
// Returns rows of the form:
//   { kind: 'dish',    dish:    { id, name, default_meal_type } }
// | { kind: 'product', product: { id, name, kcal_per_100g, unit_grams, source, synonyms, nevo_code } }
//
// The add-food page can render both shapes uniformly (badge differs).
export async function listRecentItemsForUser(limit = 20) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  // Pull a generous slice so dedup by (dish_id || product_id) yields enough.
  const { data, error } = await supabase
    .from('entries')
    .select(`
      product_id,
      dish_id,
      created_at,
      products (id, name, kcal_per_100g, unit_grams, source, synonyms, nevo_code),
      dishes (id, name, default_meal_type)
    `)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(150);
  if (error) throw error;

  const seen = new Set();
  const result = [];
  for (const row of data) {
    const key = row.dish_id ? `d:${row.dish_id}` : `p:${row.product_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (row.dish_id && row.dishes) {
      result.push({ kind: 'dish', dish: row.dishes });
    } else if (!row.dish_id && row.products) {
      result.push({ kind: 'product', product: row.products });
    }
    if (result.length >= limit) break;
  }
  return result;
}

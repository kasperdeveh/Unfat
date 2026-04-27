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

export async function createEntry({ product_id, amount_grams, kcal, meal_type, date }) {
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

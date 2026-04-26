import { supabase } from '../supabase.js';

export async function listEntriesForDate(dateIso) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('entries')
    .select('id, amount_grams, kcal, meal_type, date, products(id, name, unit_grams)')
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

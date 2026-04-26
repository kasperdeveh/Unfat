import { supabase } from '../supabase.js';

export async function listProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, kcal_per_100g, unit_grams')
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, kcal_per_100g, unit_grams, created_by')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createProduct({ name, kcal_per_100g, unit_grams }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('products')
    .insert({
      name,
      kcal_per_100g,
      unit_grams: unit_grams || null,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

import { supabase } from '../supabase.js';

const PRODUCT_FIELDS = 'id, name, kcal_per_100g, unit_grams, source, synonyms, nevo_code';

// Supabase API caps a single select at 1000 rows by default; we have 2300+
// NEVO products plus user-added ones, so paginate via .range() until exhausted.
export async function listProducts() {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_FIELDS)
      .order('name', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function getProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .select(`${PRODUCT_FIELDS}, created_by`)
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

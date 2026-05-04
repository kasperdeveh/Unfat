import { supabase } from '../supabase.js';

const DISH_FIELDS = 'id, name, default_meal_type, created_by, last_edited_by, last_edited_at';

// List all dishes (shared, RLS allows all authenticated to select).
// Each dish gets a flat `synonyms` array filled with its ingredient product
// names so the existing rankProducts() scorer matches a query like "ui"
// against any dish that contains an Ui-component. Components themselves are
// stripped from the returned shape — call getDish(id) for full component data.
export async function listDishes() {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('dishes')
      .select(`${DISH_FIELDS}, components:dish_components (products (name))`)
      .order('name', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const d of data) {
      d.synonyms = (d.components || [])
        .map(c => c.products?.name)
        .filter(Boolean);
      delete d.components;
    }
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Read a single dish with its components (joined product fields), ordered by position.
export async function getDish(id) {
  const { data, error } = await supabase
    .from('dishes')
    .select(`
      ${DISH_FIELDS},
      components:dish_components (
        id, product_id, amount_grams, position,
        products (id, name, kcal_per_100g, unit_grams, source, synonyms)
      )
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  // Supabase returns embedded relation unsorted; sort client-side.
  if (data?.components) {
    data.components.sort((a, b) => a.position - b.position);
  }
  return data;
}

// Create a dish + its components. Two round-trips (no transactions in PostgREST
// from the client). On component-insert failure we rollback by deleting the dish.
// components: [{ product_id, amount_grams, position }, ...]
export async function createDish({ name, default_meal_type, components }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data: dish, error: dishErr } = await supabase
    .from('dishes')
    .insert({
      name,
      default_meal_type: default_meal_type || null,
      created_by: session.user.id,
    })
    .select(DISH_FIELDS)
    .single();
  if (dishErr) throw dishErr;

  if (components && components.length > 0) {
    const rows = components.map((c, i) => ({
      dish_id: dish.id,
      product_id: c.product_id,
      amount_grams: c.amount_grams,
      position: c.position ?? i,
    }));
    const { error: compErr } = await supabase.from('dish_components').insert(rows);
    if (compErr) {
      // Best-effort rollback: delete the orphaned dish row. If this also fails
      // (network blip, RLS edge case after session refresh) we swallow it and
      // surface the original component error — orphan dishes are harmless.
      const { error: rollbackErr } = await supabase.from('dishes').delete().eq('id', dish.id);
      if (rollbackErr) console.warn('createDish rollback failed', rollbackErr);
      throw compErr;
    }
  }
  return dish;
}

// Update dish meta (name, default_meal_type) and replace components.
// Components are replaced wholesale (delete-all-then-insert) — simpler than diffing.
// The dish_components_touch_dish trigger keeps last_edited_at fresh.
export async function updateDish(id, { name, default_meal_type, components }) {
  const { data: dish, error: dishErr } = await supabase
    .from('dishes')
    .update({ name, default_meal_type: default_meal_type || null })
    .eq('id', id)
    .select(DISH_FIELDS)
    .single();
  if (dishErr) throw dishErr;

  const { error: delErr } = await supabase.from('dish_components').delete().eq('dish_id', id);
  if (delErr) throw delErr;

  if (components && components.length > 0) {
    const rows = components.map((c, i) => ({
      dish_id: id,
      product_id: c.product_id,
      amount_grams: c.amount_grams,
      position: c.position ?? i,
    }));
    const { error: insErr } = await supabase.from('dish_components').insert(rows);
    if (insErr) throw insErr;
  }
  return dish;
}

// Delete a dish (cascade removes components; entries.dish_id becomes null).
export async function deleteDish(id) {
  const { error } = await supabase.from('dishes').delete().eq('id', id);
  if (error) throw error;
}


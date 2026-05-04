import { supabase } from '../supabase.js';

// Returns the current user's favorites as two id-Sets.
// Used cold-start by add-food (to render star-state in rows + filter the
// Favorites tab) and by portion-screen / dish-builder (to render the
// header-star). Two parallel SELECTs; PK-indexed and bounded (<50 rows
// realistic) so no pagination needed.
export async function getMyFavorites() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const [pf, df] = await Promise.all([
    supabase.from('product_favorites').select('product_id').eq('user_id', session.user.id),
    supabase.from('dish_favorites').select('dish_id').eq('user_id', session.user.id),
  ]);
  if (pf.error) throw pf.error;
  if (df.error) throw df.error;

  return {
    productIds: new Set(pf.data.map(r => r.product_id)),
    dishIds:    new Set(df.data.map(r => r.dish_id)),
  };
}

// Toggle a product favorite. `on=true` inserts, `on=false` deletes.
// Race-safe: a duplicate insert (PK collision, code 23505) is silently
// ignored — the UI is already in the desired state.
export async function toggleProductFavorite(productId, on) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  if (on) {
    const { error } = await supabase
      .from('product_favorites')
      .insert({ user_id: session.user.id, product_id: productId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('product_favorites')
      .delete()
      .eq('user_id', session.user.id)
      .eq('product_id', productId);
    if (error) throw error;
  }
}

// Toggle a dish favorite. Same race-safety as toggleProductFavorite.
export async function toggleDishFavorite(dishId, on) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  if (on) {
    const { error } = await supabase
      .from('dish_favorites')
      .insert({ user_id: session.user.id, dish_id: dishId });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('dish_favorites')
      .delete()
      .eq('user_id', session.user.id)
      .eq('dish_id', dishId);
    if (error) throw error;
  }
}

import { supabase } from '../supabase.js';

export async function getMyProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createMyProfile({ daily_target_kcal, daily_max_kcal }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: session.user.id,
      daily_target_kcal,
      daily_max_kcal,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMyProfile({ daily_target_kcal, daily_max_kcal }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update({ daily_target_kcal, daily_max_kcal })
    .eq('id', session.user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

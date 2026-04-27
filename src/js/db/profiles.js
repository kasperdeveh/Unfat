import { supabase } from '../supabase.js';
import { upsertProfileHistory } from './profile_history.js';
import { todayIso } from '../calc.js';

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

  // Seed profile_history with today's snapshot so backdated lookups work.
  // Best-effort: profile is already committed, no transactions available.
  // A missing row only affects history colour coding; T6 (settings save)
  // will write a row on the first goal change as natural recovery.
  try {
    await upsertProfileHistory({
      daily_target_kcal,
      daily_max_kcal,
      valid_from: todayIso(),
    });
  } catch (e) {
    console.warn('profile_history seed failed; will recover on next settings save', e);
  }

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

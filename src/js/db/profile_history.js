import { supabase } from '../supabase.js';
import { isoDate } from '../utils/dates.js';

// All rows for the current user, ordered ascending by valid_from.
export async function listProfileHistory() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profile_history')
    .select('id, daily_target_kcal, daily_max_kcal, valid_from')
    .eq('user_id', session.user.id)
    .order('valid_from', { ascending: true });

  if (error) throw error;
  return data;
}

// Upsert a row at (user_id, valid_from). Used on onboarding (today)
// and Settings save (today).
export async function upsertProfileHistory({ daily_target_kcal, daily_max_kcal, valid_from }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profile_history')
    .upsert({
      user_id: session.user.id,
      daily_target_kcal,
      daily_max_kcal,
      valid_from,
    }, { onConflict: 'user_id,valid_from' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Pure helper: given a list of profile_history rows (ascending),
// return the {target, max} that applied on `dateIso`.
// Returns null if no row qualifies (date is before any history).
export function getTargetForDate(history, dateIso) {
  let result = null;
  for (const row of history) {
    if (row.valid_from <= dateIso) {
      result = { target: row.daily_target_kcal, max: row.daily_max_kcal };
    } else {
      break;
    }
  }
  return result;
}

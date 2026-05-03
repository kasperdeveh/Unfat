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

// Update only the handle for the current user. Throws on duplicate (lowercase) handle.
export async function updateMyHandle(handle) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update({ handle })
    .eq('id', session.user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Update only share_level for the current user.
// level: 'none' | 'total' | 'per_meal' | 'entries'
export async function updateMyShareLevel(level) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('profiles')
    .update({ share_level: level })
    .eq('id', session.user.id);
  if (error) throw error;
}

// Read another user's public profile fields (handle, share_level).
// RLS allows this only when the caller and target are accepted friends
// (or when target is self). Returns null if blocked or missing.
export async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, share_level')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile({ daily_target_kcal, daily_max_kcal }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  // Read current values to detect a real change.
  const { data: current, error: readErr } = await supabase
    .from('profiles')
    .select('daily_target_kcal, daily_max_kcal')
    .eq('id', session.user.id)
    .maybeSingle();
  if (readErr) throw readErr;

  const { data, error } = await supabase
    .from('profiles')
    .update({ daily_target_kcal, daily_max_kcal })
    .eq('id', session.user.id)
    .select()
    .single();

  if (error) throw error;

  // Only write a new history row if at least one value actually changed.
  // Best-effort: profile update already committed, no transactions.
  if (!current ||
      current.daily_target_kcal !== daily_target_kcal ||
      current.daily_max_kcal !== daily_max_kcal) {
    try {
      await upsertProfileHistory({
        daily_target_kcal,
        daily_max_kcal,
        valid_from: todayIso(),
      });
    } catch (e) {
      console.warn('profile_history upsert failed', e);
    }
  }

  return data;
}

// Admin only: list all profiles with a handle. RPC enforces admin role server-side.
export async function listUsersForAdmin() {
  const { data, error } = await supabase.rpc('list_users_for_admin');
  if (error) throw error;
  return data;
}

// Admin only: change a user's role. Cannot target self (RPC blocks it).
export async function setUserRole(targetUserId, newRole) {
  const { error } = await supabase.rpc('set_user_role', {
    target_user_id: targetUserId,
    new_role: newRole,
  });
  if (error) throw error;
}

import { supabase } from '../supabase.js';

// Search users by handle prefix (case-insensitive). Returns up to 20 matches.
// Each row: { user_id, handle, friendship_status: null | 'pending_outgoing' | 'pending_incoming' | 'accepted' }.
export async function searchUsers(query) {
  if (!query || query.length < 1) return [];
  const { data, error } = await supabase.rpc('search_users', { query });
  if (error) throw error;
  return data || [];
}

// Send a friend request. Returns one of:
// 'requested' | 'already_pending' | 'auto_accepted' | 'already_friends'
export async function sendFriendRequest(targetUserId) {
  const { data, error } = await supabase.rpc('send_friend_request', {
    target_user_id: targetUserId,
  });
  if (error) throw error;
  return data;
}

// Accept (true) or reject (false) an incoming request from `otherUserId`.
export async function respondFriendRequest(otherUserId, accept) {
  const { error } = await supabase.rpc('respond_friend_request', {
    other_user_id: otherUserId,
    accept,
  });
  if (error) throw error;
}

// Remove a friendship or withdraw an outgoing request. Idempotent.
export async function unfriend(otherUserId) {
  const { error } = await supabase.rpc('unfriend', {
    other_user_id: otherUserId,
  });
  if (error) throw error;
}

// Read a friend's day data, scaled to their share_level.
// Returns: { share_level, handle, [target, max, total_kcal, per_meal, entries] }
export async function getFriendDay(friendUserId, day) {
  const { data, error } = await supabase.rpc('get_friend_day', {
    friend_user_id: friendUserId,
    day,
  });
  if (error) throw error;
  return data;
}

// Read a friend's period (week/month) data, scaled to their share_level.
// Returns: { share_level, handle, friend_created_at, days[] }
export async function getFriendPeriod(friendId, startIso, endIso) {
  const { data, error } = await supabase.rpc('get_friend_period', {
    friend_user_id: friendId,
    start_date: startIso,
    end_date: endIso,
  });
  if (error) throw error;
  return data;
}

// List all my_friends rows. Returns: [{ friend_id, status, requested_by, created_at, accepted_at }]
// Note: friend_id is the OTHER user's id, regardless of who sent the request.
export async function listMyFriends() {
  const { data, error } = await supabase.from('my_friends').select('*');
  if (error) throw error;
  return data || [];
}

// Convenience: split listMyFriends() by status/direction.
export async function listFriendBuckets() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const myId = session.user.id;

  const rows = await listMyFriends();
  const accepted = [];
  const incoming = [];
  const outgoing = [];
  for (const r of rows) {
    if (r.status === 'accepted') accepted.push(r);
    else if (r.requested_by === myId) outgoing.push(r);
    else incoming.push(r);
  }
  return { accepted, incoming, outgoing };
}

// Read handles for a list of user_ids in one round-trip.
// Returns: Map<user_id, handle>
export async function getHandlesForUsers(userIds) {
  if (!userIds || userIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle')
    .in('id', userIds);
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) map.set(row.id, row.handle);
  return map;
}

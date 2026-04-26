import { supabase } from './supabase.js';

// Sign up a new user with email + password.
// Requires "Confirm email" to be disabled in the Supabase project for the
// user to be able to log in immediately without email verification.
export async function signUp(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

// Sign in an existing user with email + password.
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

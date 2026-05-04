// supabase-js is loaded via classic <script> in index.html and attaches its
// namespace to window.supabase. Self-hosted (see vendor/supabase-js.umd.js)
// to avoid runtime dependency on a third-party CDN.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const { createClient } = globalThis.supabase;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

import { defineRoute, startRouter, navigate } from './router.js';
import { supabase } from './supabase.js';
import { renderBottomNav } from './ui.js';

// Register routes — view modules are loaded lazily.
defineRoute('#/login',          () => import('./views/login.js'));
defineRoute('#/onboarding',     () => import('./views/onboarding.js'));
defineRoute('#/',               () => import('./views/dashboard.js'));
defineRoute('#/add',            () => import('./views/add-food.js'));
defineRoute('#/add/portion',    () => import('./views/add-food-portion.js'));
defineRoute('#/add/new',        () => import('./views/add-food-new.js'));
defineRoute('#/settings',       () => import('./views/settings.js'));

const KNOWN_ROUTES = ['#/login', '#/onboarding', '#/', '#/add', '#/add/portion', '#/add/new', '#/settings'];

// Determine where the user should be based on their session and profile state.
// Returns the target hash, or null if the current route is fine.
async function determineSessionRoute() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return '#/login';

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    console.error('Profile lookup failed:', error);
    return '#/login';
  }

  if (!profile) return '#/onboarding';

  // Logged in + profile exists — if on auth views, send home; if on junk hash
  // (e.g. magic-link tokens), also send home.
  const currentPath = location.hash.split('?')[0];
  if (currentPath === '#/login' || currentPath === '#/onboarding') return '#/';
  if (!KNOWN_ROUTES.includes(currentPath)) return '#/';
  return null;
}

async function applySessionRouting() {
  const target = await determineSessionRoute();
  if (target && location.hash !== target) {
    navigate(target);
  }
}

// Magic-link redirects land on this page with a hash containing access tokens.
// Supabase processes those tokens asynchronously; until that completes,
// getSession() returns null and any view that needs auth will fail.
// So: wait for the first INITIAL_SESSION event before letting the router render.
const authReady = new Promise((resolve) => {
  let settled = false;
  const finish = () => { if (!settled) { settled = true; resolve(); } };

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') finish();
    if (event === 'TOKEN_REFRESHED') return;
    applySessionRouting();
  });

  // Safety: never block the UI longer than 2s even if Supabase never fires.
  setTimeout(finish, 2000);
});

(async () => {
  await authReady;
  await applySessionRouting();
  startRouter();
  window.addEventListener('hashchange', renderBottomNav);
  renderBottomNav();
})();

// PWA service worker — only register in production. The cache makes development
// painful (code changes don't take effect until you bump CACHE_NAME or unregister
// the SW manually), so skip it on localhost.
const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if ('serviceWorker' in navigator && !isLocalhost) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

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

// Session-aware routing: redirect based on auth + profile state.
async function routeForSession() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    if (location.hash !== '#/login') navigate('#/login');
    return;
  }

  // Logged in — check if profile exists
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Profile lookup failed:', profileError);
    return;
  }

  if (!profile) {
    if (location.hash !== '#/onboarding') navigate('#/onboarding');
    return;
  }

  // Logged in + has profile — if currently on login/onboarding, redirect home
  if (location.hash === '#/login' || location.hash === '#/onboarding') {
    navigate('#/');
  }
}

// React to auth changes. Skip TOKEN_REFRESHED — would re-query profile every hour
// for no behavioral change. INITIAL_SESSION fires shortly after init; we already
// run routeForSession() at the bottom of this file, so skip it too.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
  routeForSession();
});

startRouter();
routeForSession();

window.addEventListener('hashchange', renderBottomNav);
renderBottomNav();

// PWA service worker — only register when served over HTTPS or localhost.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

import { defineRoute, startRouter, navigate } from './router.js';
import { supabase } from './supabase.js';

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
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profile) {
    if (location.hash !== '#/onboarding') navigate('#/onboarding');
    return;
  }

  // Logged in + has profile — if currently on login/onboarding, redirect home
  if (location.hash === '#/login' || location.hash === '#/onboarding') {
    navigate('#/');
  }
}

// React to auth changes (sign in / sign out / token refresh).
supabase.auth.onAuthStateChange(() => {
  routeForSession();
});

startRouter();
routeForSession();

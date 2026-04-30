import { defineRoute, startRouter, navigate } from './router.js';
import { supabase } from './supabase.js';
import { renderBottomNav } from './ui.js';

// Belt-and-suspenders against iOS double-tap-zoom: viewport meta has
// `user-scalable=no, maximum-scale=1` and CSS has `touch-action: manipulation`,
// but iOS Safari (especially in standalone PWA) sometimes still triggers a
// zoom-tap. If two touchend events fire within 350ms we cancel the second.
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 350) event.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// Register routes — view modules are loaded lazily.
defineRoute('#/login',          () => import('./views/login.js'));
defineRoute('#/onboarding',     () => import('./views/onboarding.js'));
defineRoute('#/',               () => import('./views/day.js'));
defineRoute('#/day',            () => import('./views/day.js'));
defineRoute('#/history',        () => import('./views/history.js'));
defineRoute('#/add',            () => import('./views/add-food.js'));
defineRoute('#/add/portion',    () => import('./views/add-food-portion.js'));
defineRoute('#/add/new',        () => import('./views/add-food-new.js'));
defineRoute('#/friends',        () => import('./views/friends.js'));
defineRoute('#/friend-day',     () => import('./views/friend-day.js'));
defineRoute('#/friend-week',    () => import('./views/friend-week.js'));
defineRoute('#/friend-month',   () => import('./views/friend-month.js'));
defineRoute('#/settings',       () => import('./views/settings.js'));

const KNOWN_ROUTES = ['#/login', '#/onboarding', '#/', '#/day', '#/history', '#/add', '#/add/portion', '#/add/new', '#/friends', '#/friend-day', '#/friend-week', '#/friend-month', '#/settings'];

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

  // Initialize nav badge — best-effort; failure is non-fatal.
  try {
    const { listFriendBuckets } = await import('./db/friendships.js');
    const { setNavBadge } = await import('./ui.js');
    const buckets = await listFriendBuckets();
    setNavBadge('incomingRequests', buckets.incoming.length);
  } catch (e) {
    // ignore — user may not be logged in or table may not exist yet
  }
})();

// PWA service worker — only register in production. The cache makes development
// painful (code changes don't take effect until you bump CACHE_NAME or unregister
// the SW manually), so skip it on localhost.
const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if ('serviceWorker' in navigator && !isLocalhost) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');

      // When the SW finds a new version, an `updatefound` event fires.
      // Once the new worker reaches `installed` AND there is already a
      // controller, that means we just upgraded — show an update prompt.
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdatePrompt();
          }
        });
      });

      // Browsers update SWs on their own schedule (~24h). Speed it up by
      // checking when the user returns to the app.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update();
      });
    } catch (err) {
      console.warn('SW registration failed:', err);
    }
  });
}

function showUpdatePrompt() {
  if (document.getElementById('update-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'update-toast';
  toast.className = 'update-toast';
  toast.innerHTML = `<span>Nieuwe versie beschikbaar</span><button id="update-btn">Vernieuwen</button>`;
  document.body.appendChild(toast);
  toast.querySelector('#update-btn').addEventListener('click', () => {
    window.location.reload();
  });
}

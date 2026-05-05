// Service worker for Unfat. Cache-first for static assets, network-first for Supabase.
// Bump CACHE_NAME on every deploy that ships static asset changes to invalidate caches.

const CACHE_NAME = 'unfat-v41';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/router.js',
  './js/supabase.js',
  './js/vendor/supabase-js.umd.js',
  './js/config.js',
  './js/auth.js',
  './js/ui.js',
  './js/calc.js',
  './js/utils/dates.js',
  './js/utils/html.js',
  './js/db/profiles.js',
  './js/db/products.js',
  './js/db/entries.js',
  './js/db/profile_history.js',
  './js/db/friendships.js',
  './js/views/login.js',
  './js/views/onboarding.js',
  './js/views/day.js',
  './js/views/history.js',
  './js/views/add-food.js',
  './js/views/add-food-portion.js',
  './js/views/add-food-new.js',
  './js/views/friends.js',
  './js/views/settings.js',
  './js/views/components/edit-entry-sheet.js',
  './js/views/components/edit-product-sheet.js',
  './js/views/components/week-view.js',
  './js/views/components/month-view.js',
  './js/views/components/handle-input.js',
  './js/views/components/compare-day.js',
  './js/views/components/compare-month.js',
  './js/views/components/compare-shared.js',
  './js/views/components/compare-week.js',
  './js/views/components/compare-widget.js',
  './js/views/components/copy-date-sheet.js',
  './js/views/components/person-selector.js',
  './js/db/dishes.js',
  './js/db/favorites.js',
  './js/utils/product-search.js',
  './js/views/dish-builder.js',
  './js/views/dish-log.js',
  './js/views/components/dish-component-sheet.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // `cache: 'reload'` bypasses the browser HTTP cache so a new SW always
  // populates its cache with truly fresh assets. Without this, GitHub
  // Pages' max-age=600 on CSS/JS could leave the new cache filled with
  // pre-deploy bytes — the toast appears, the SW activates, but the
  // page still loads the old look.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  // No skipWaiting here. The page posts SKIP_WAITING when the user taps
  // "Vernieuwen" in the update toast, so activation only happens when
  // the user explicitly opts in — no surprise reloads mid-interaction.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for Supabase (data must be fresh).
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

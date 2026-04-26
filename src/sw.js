// Service worker for Unfat. Cache-first for static assets, network-first for Supabase.
// Bump CACHE_NAME on every deploy that ships static asset changes to invalidate caches.

const CACHE_NAME = 'unfat-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/router.js',
  './js/supabase.js',
  './js/config.js',
  './js/auth.js',
  './js/ui.js',
  './js/calc.js',
  './js/db/profiles.js',
  './js/db/products.js',
  './js/db/entries.js',
  './js/views/login.js',
  './js/views/onboarding.js',
  './js/views/dashboard.js',
  './js/views/add-food.js',
  './js/views/add-food-portion.js',
  './js/views/add-food-new.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
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

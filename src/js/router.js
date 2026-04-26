// Hash-based router. Each route maps to a view module that exports `render(container, params)`.
// Routes are matched in order; the first match wins.

const routes = [];

export function defineRoute(pattern, loader) {
  // pattern: e.g. '#/add/portion' — params come from the query string
  routes.push({ pattern, loader });
}

export function navigate(hash) {
  if (location.hash === hash) {
    handleRoute();
  } else {
    location.hash = hash;
  }
}

export function getQueryParams() {
  const idx = location.hash.indexOf('?');
  if (idx === -1) return {};
  const params = new URLSearchParams(location.hash.slice(idx + 1));
  return Object.fromEntries(params);
}

export function getPath() {
  const hash = location.hash || '#/';
  const idx = hash.indexOf('?');
  return idx === -1 ? hash : hash.slice(0, idx);
}

async function handleRoute() {
  const path = getPath();
  const container = document.getElementById('app');
  const params = getQueryParams();

  for (const { pattern, loader } of routes) {
    if (pattern === path) {
      const module = await loader();
      container.innerHTML = '';
      await module.render(container, params);
      return;
    }
  }

  // No route matched — go to default
  if (path !== '#/') navigate('#/');
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

import { navigate, getPath } from './router.js';

// =====================================================================
// Toast — temporary notification at bottom of screen.
// =====================================================================
let toastTimer = null;

export function showToast(message, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// =====================================================================
// Bottom nav — 3 tabs. Hidden on login/onboarding.
// =====================================================================
const NAV_TABS = [
  { hash: '#/',         label: 'Home' },
  { hash: '#/add',      label: 'Voeg toe' },
  { hash: '#/settings', label: 'Settings' },
];

export function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  const path = getPath();
  const showNav = NAV_TABS.some(t => path === t.hash || path.startsWith(t.hash + '/') || (t.hash === '#/' && path === '#/'));

  if (!showNav) {
    nav.hidden = true;
    return;
  }

  nav.hidden = false;
  nav.innerHTML = '';

  for (const tab of NAV_TABS) {
    const isActive =
      (tab.hash === '#/' && path === '#/') ||
      (tab.hash !== '#/' && (path === tab.hash || path.startsWith(tab.hash + '/')));

    const btn = document.createElement('div');
    btn.className = 'nav-item' + (isActive ? ' active' : '');
    btn.innerHTML = `<span class="nav-icon"></span>${tab.label}`;
    btn.addEventListener('click', () => navigate(tab.hash));
    nav.appendChild(btn);
  }
}

// Hide nav explicitly (used on login/onboarding before render)
export function hideBottomNav() {
  document.getElementById('bottom-nav').hidden = true;
}

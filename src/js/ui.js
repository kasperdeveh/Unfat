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
// Bottom nav — 4 tabs. Hidden on login/onboarding.
// =====================================================================
const NAV_TABS = [
  { hash: '#/',         label: 'Home' },
  { hash: '#/add',      label: 'Voeg toe' },
  { hash: '#/history',  label: 'Historie' },
  { hash: '#/settings', label: 'Settings' },
];

export function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  const path = getPath();
  // Show nav on all logged-in views including #/day. Filtering #/ out
  // explicitly is more robust than slice(1) if NAV_TABS is ever reordered.
  const showNav = path === '#/' || path === '#/day' ||
    NAV_TABS.filter(t => t.hash !== '#/').some(t => path === t.hash || path.startsWith(t.hash + '/'));

  if (!showNav) {
    nav.hidden = true;
    return;
  }

  nav.hidden = false;
  nav.innerHTML = '';

  for (const tab of NAV_TABS) {
    let isActive;
    if (tab.hash === '#/') isActive = (path === '#/' || path === '#/day');
    else isActive = (path === tab.hash || path.startsWith(tab.hash + '/'));

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

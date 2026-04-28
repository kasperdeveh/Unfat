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
// Bottom nav — 5 tabs. Hidden on login/onboarding. Badge for incoming friend
// requests is updated via setNavBadge().
// =====================================================================
const NAV_TABS = [
  { hash: '#/',         label: 'Home' },
  { hash: '#/add',      label: 'Voeg toe' },
  { hash: '#/history',  label: 'Historie' },
  { hash: '#/friends',  label: 'Vrienden', badgeKey: 'incomingRequests' },
  { hash: '#/settings', label: 'Settings' },
];

const navBadges = { incomingRequests: 0 };

export function setNavBadge(key, count) {
  navBadges[key] = count;
  renderBottomNav();
}

export function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  const path = getPath();
  // `#/friend` (singular) is the friend day-view — a sub-page of the Vrienden tab.
  const isFriendDay = path === '#/friend';
  const showNav = path === '#/' || path === '#/day' || isFriendDay ||
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
    else if (tab.hash === '#/friends') isActive = (path === '#/friends' || path.startsWith('#/friends/') || isFriendDay);
    else isActive = (path === tab.hash || path.startsWith(tab.hash + '/'));

    const btn = document.createElement('div');
    btn.className = 'nav-item' + (isActive ? ' active' : '');
    const badgeCount = tab.badgeKey ? (navBadges[tab.badgeKey] || 0) : 0;
    const badgeHtml = badgeCount > 0 ? `<span class="nav-badge">${badgeCount}</span>` : '';
    btn.innerHTML = `<span class="nav-icon">${badgeHtml}</span>${tab.label}`;
    btn.addEventListener('click', () => navigate(tab.hash));
    nav.appendChild(btn);
  }
}

// Hide nav explicitly (used on login/onboarding before render)
export function hideBottomNav() {
  document.getElementById('bottom-nav').hidden = true;
}

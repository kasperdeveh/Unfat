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
// Lucide-style outline icons. stroke=currentColor so the icon picks up
// the nav-item color (muted by default, accent when active).
const NAV_ICONS = {
  home:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V10.5z"/></svg>',
  plus:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  history:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  users:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="8" r="3.5"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

const NAV_TABS = [
  { hash: '#/',         label: 'Home',     icon: 'home' },
  { hash: '#/add',      label: 'Voeg toe', icon: 'plus' },
  { hash: '#/history',  label: 'Historie', icon: 'history' },
  { hash: '#/friends',  label: 'Vrienden', icon: 'users',    badgeKey: 'incomingRequests' },
  { hash: '#/settings', label: 'Settings', icon: 'settings' },
];

const navBadges = { incomingRequests: 0 };

export function setNavBadge(key, count) {
  navBadges[key] = count;
  renderBottomNav();
}

export function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  const path = getPath();
  // `#/friend-day|week|month` are friend sub-pages of the Vrienden tab.
  const isFriendDay = path === '#/friend-day' || path === '#/friend-week' || path === '#/friend-month';
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
    btn.innerHTML = `<span class="nav-icon">${NAV_ICONS[tab.icon]}${badgeHtml}</span><span class="nav-label">${tab.label}</span>`;
    btn.addEventListener('click', () => navigate(tab.hash));
    nav.appendChild(btn);
  }
}

// Hide nav explicitly (used on login/onboarding before render)
export function hideBottomNav() {
  document.getElementById('bottom-nav').hidden = true;
}

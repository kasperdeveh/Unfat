import { navigate } from '../../router.js';

/**
 * Mount the shared friend-views header into a container.
 *
 * @param {HTMLElement} container — element to render into
 * @param {object} opts
 * @param {string} opts.friendId — UUID of the friend
 * @param {string} opts.handle — friend's handle (already escaped by caller)
 * @param {'day' | 'week' | 'month'} opts.currentView — which toggle is active
 * @param {string} opts.anchor — ISO date used as anchor when switching views (date for day, anchor for week/month)
 */
export function mount(container, { friendId, handle, currentView, anchor }) {
  const isDay = currentView === 'day';
  const isWeek = currentView === 'week';
  const isMonth = currentView === 'month';

  container.innerHTML = `
    <button class="back-btn" id="friend-header-back">‹ Vrienden</button>
    <h1 class="page-title">${escapeHtml(handle)}</h1>
    <div class="friend-view-toggle">
      <button class="${isDay ? 'active' : ''}" data-view="day">Dag</button>
      <button class="${isWeek ? 'active' : ''}" data-view="week">Week</button>
      <button class="${isMonth ? 'active' : ''}" data-view="month">Maand</button>
    </div>
  `;

  container.querySelector('#friend-header-back')
    .addEventListener('click', () => navigate('#/friends'));

  container.querySelectorAll('.friend-view-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === currentView) return;
      const id = encodeURIComponent(friendId);
      const a = encodeURIComponent(anchor);
      if (view === 'day') {
        navigate(`#/friend-day?id=${id}&date=${a}`);
      } else if (view === 'week') {
        navigate(`#/friend-week?id=${id}&anchor=${a}`);
      } else if (view === 'month') {
        navigate(`#/friend-month?id=${id}&anchor=${a}`);
      }
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

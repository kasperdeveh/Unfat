import { getFriendPeriod } from '../db/friendships.js';
import { heroState, todayIso } from '../calc.js';
import {
  parseIso, isoDate, monthStart, monthEnd, addMonthsKeepDay, formatMonthNl,
} from '../utils/dates.js';
import { navigate } from '../router.js';
import { mount as mountFriendHeader } from './components/friend-header.js';
import { escapeHtml } from '../utils/html.js';

export async function render(container, params) {
  const friendId = params?.id;
  if (!friendId) { navigate('#/friends'); return; }

  const today = parseIso(todayIso());
  const anchor = params?.anchor ? parseIso(params.anchor) : today;
  const start = monthStart(anchor);
  const end = monthEnd(anchor);
  const startIso = isoDate(start);
  const endIso = isoDate(end);

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let period;
  try {
    period = await getFriendPeriod(friendId, startIso, endIso);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon vriend niet laden: ${err.message}</p>`;
    return;
  }

  const handle = period.handle || 'Vriend';
  const friendCreatedIso = period.friend_created_at;

  container.innerHTML = `
    <div id="friend-header-slot"></div>
    <div id="friend-month-content"></div>
  `;

  mountFriendHeader(
    container.querySelector('#friend-header-slot'),
    { friendId, handle, currentView: 'month', anchor: isoDate(anchor) }
  );

  const content = container.querySelector('#friend-month-content');

  if (period.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:32px;text-align:center;">${escapeHtml(handle)} deelt geen voortgang.</p>`;
    return;
  }

  const days = period.days || [];
  const maxBarValue = Math.max(
    1,
    ...days.map(d => Math.max(d.total_kcal || 0, d.max || 0, d.target || 0))
  );

  const prevAnchor = addMonthsKeepDay(anchor, -1);
  const nextAnchor = addMonthsKeepDay(anchor, 1);
  const prevMonthStart = monthStart(prevAnchor);
  const nextMonthStart = monthStart(nextAnchor);
  const prevDisabled = friendCreatedIso && isoDate(monthEnd(prevAnchor)) < friendCreatedIso;
  const nextDisabled = isoDate(nextMonthStart) > todayIso();

  const barsHtml = days.map(d => {
    const totalKcal = d.total_kcal || 0;
    const target = d.target;
    const max = d.max;
    let stateClass = 'bar-grey';
    if (target != null && max != null) {
      const s = heroState(totalKcal, target, max);
      stateClass = `bar-${s}`;
    }
    const heightPct = Math.round((totalKcal / maxBarValue) * 100);
    const beforeFriend = friendCreatedIso && d.date < friendCreatedIso;
    const dayNumber = d.date.slice(8); // "DD"
    return `
      <button class="period-bar period-bar-month ${stateClass} ${beforeFriend ? 'period-bar-disabled' : ''}"
              data-date="${d.date}"
              ${beforeFriend ? 'disabled' : ''}>
        <span class="period-bar-fill" style="height: ${heightPct}%"></span>
        <span class="period-bar-label">${dayNumber}</span>
      </button>
    `;
  }).join('');

  content.innerHTML = `
    <div class="period-nav">
      <button class="period-nav-btn" id="prev-month" ${prevDisabled ? 'disabled' : ''}>‹</button>
      <p class="page-subtitle" style="margin:0 1rem;">${formatMonthNl(start)}</p>
      <button class="period-nav-btn" id="next-month" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div class="period-bars period-bars-month">${barsHtml}</div>
  `;

  const prevBtn = content.querySelector('#prev-month');
  const nextBtn = content.querySelector('#next-month');
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => {
      navigate(`#/friend-month?id=${encodeURIComponent(friendId)}&anchor=${isoDate(prevAnchor)}`);
    });
  }
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/friend-month?id=${encodeURIComponent(friendId)}&anchor=${isoDate(nextAnchor)}`);
    });
  }
  content.querySelectorAll('.period-bar').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const d = btn.dataset.date;
      navigate(`#/friend-day?id=${encodeURIComponent(friendId)}&date=${d}`);
    });
  });
}
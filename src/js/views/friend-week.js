import { getFriendPeriod } from '../db/friendships.js';
import { heroState, todayIso } from '../calc.js';
import {
  parseIso, isoDate, weekStart, addDays, formatWeekRangeNl,
} from '../utils/dates.js';
import { navigate } from '../router.js';
import { mount as mountFriendHeader } from './components/friend-header.js';
import { escapeHtml } from '../utils/html.js';

const DAY_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export async function render(container, params) {
  const friendId = params?.id;
  if (!friendId) { navigate('#/friends'); return; }

  const today = parseIso(todayIso());
  const anchor = params?.anchor ? parseIso(params.anchor) : today;
  const start = weekStart(anchor);
  const end = addDays(start, 6);
  const startIso = isoDate(start);
  const endIso = isoDate(end);

  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let period;
  try {
    period = await getFriendPeriod(friendId, startIso, endIso);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon vriend niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  const handle = period.handle || 'Vriend';
  const friendCreatedIso = period.friend_created_at;

  container.innerHTML = `
    <div id="friend-header-slot"></div>
    <div id="friend-week-content"></div>
  `;

  mountFriendHeader(
    container.querySelector('#friend-header-slot'),
    { friendId, handle, currentView: 'week', anchor: isoDate(anchor) }
  );

  const content = container.querySelector('#friend-week-content');

  if (period.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:32px;text-align:center;">${escapeHtml(handle)} deelt geen voortgang.</p>`;
    return;
  }

  const days = period.days || [];
  const maxBarValue = Math.max(
    1,
    ...days.map(d => Math.max(d.total_kcal || 0, d.max || 0, d.target || 0))
  );

  const prevAnchor = addDays(anchor, -7);
  const nextAnchor = addDays(anchor, 7);
  const prevWeekStart = weekStart(prevAnchor);
  const nextWeekStart = weekStart(nextAnchor);
  const prevDisabled = friendCreatedIso && isoDate(prevWeekStart) < friendCreatedIso
    ? isoDate(addDays(prevWeekStart, 6)) < friendCreatedIso  // whole prev week before friend's first day
    : false;
  const nextDisabled = isoDate(nextWeekStart) > todayIso();

  const barsHtml = days.map((d, i) => {
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
    return `
      <button class="period-bar ${stateClass} ${beforeFriend ? 'period-bar-disabled' : ''}"
              data-date="${d.date}"
              ${beforeFriend ? 'disabled' : ''}>
        <span class="period-bar-fill" style="height: ${heightPct}%"></span>
        <span class="period-bar-label">${DAY_LABELS[i]}</span>
      </button>
    `;
  }).join('');

  content.innerHTML = `
    <div class="period-nav">
      <button class="period-nav-btn" id="prev-week" ${prevDisabled ? 'disabled' : ''}>‹</button>
      <p class="page-subtitle" style="margin:0 1rem;">${formatWeekRangeNl(start)}</p>
      <button class="period-nav-btn" id="next-week" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>
    <div class="period-bars">${barsHtml}</div>
  `;

  const prevBtn = content.querySelector('#prev-week');
  const nextBtn = content.querySelector('#next-week');
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => {
      navigate(`#/friend-week?id=${encodeURIComponent(friendId)}&anchor=${isoDate(prevAnchor)}`);
    });
  }
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      navigate(`#/friend-week?id=${encodeURIComponent(friendId)}&anchor=${isoDate(nextAnchor)}`);
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
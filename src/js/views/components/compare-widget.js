import { getFriendDay } from '../../db/friendships.js';
import { heroState } from '../../calc.js';
import { navigate } from '../../router.js';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_SHORT = { breakfast: 'Ontbijt', lunch: 'Lunch', dinner: 'Diner', snack: 'Snack' };

// Mount a horizontal swipe-carousel showing one card per friend.
//
// container: HTMLElement
// friends: array of { friend_id, handle } (caller resolves handles)
// dateIso: 'YYYY-MM-DD' (usually today)
//
// Lazy-fetches getFriendDay() for each friend in parallel, then renders cards.
export async function mountCompareWidget(container, friends, dateIso) {
  if (friends.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `<p class="text-muted" style="padding: 8px 0;">Vrienden laden...</p>`;

  let days;
  try {
    days = await Promise.all(friends.map(async (f) => {
      try {
        const d = await getFriendDay(f.friend_id, dateIso);
        return { friendId: f.friend_id, fallbackHandle: f.handle, ...d };
      } catch (err) {
        return { friendId: f.friend_id, fallbackHandle: f.handle, error: err.message };
      }
    }));
  } catch (err) {
    container.innerHTML = `<p class="error">Kon vrienden niet laden: ${err.message}</p>`;
    return;
  }

  container.innerHTML = `
    <div class="compare-widget">
      <div class="compare-track">
        ${days.map(renderCard).join('')}
      </div>
      ${days.length > 1 ? `
        <div class="compare-dots">
          ${days.map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}"></span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;

  const track = container.querySelector('.compare-track');
  const dots = container.querySelectorAll('.compare-dots .dot');

  // Update active dot on scroll
  if (dots.length > 0) {
    track.addEventListener('scroll', () => {
      const cardW = track.clientWidth;
      const idx = Math.round(track.scrollLeft / cardW);
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    });
  }

  // Tap card → friend dag-view
  container.querySelectorAll('.compare-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.friendId;
      navigate(`#/friend?id=${id}&date=${dateIso}`);
    });
  });
}

function renderCard(d) {
  const handle = d.handle || d.fallbackHandle || 'Vriend';
  if (d.error) {
    return `<div class="compare-card" data-friend-id="${d.friendId}">
      <div class="compare-handle">${escapeHtml(handle)}</div>
      <p class="text-muted">Kon niet laden</p>
    </div>`;
  }
  if (d.share_level === 'none') {
    return `<div class="compare-card compare-card-muted" data-friend-id="${d.friendId}">
      <div class="compare-handle">${escapeHtml(handle)}</div>
      <p class="text-muted">deelt geen voortgang</p>
    </div>`;
  }

  const target = d.target;
  const max = d.max;
  const total = d.total_kcal || 0;
  const state = (target != null && max != null) ? heroState(total, target, max) : 'green';
  const barPct = (target && target > 0) ? Math.min(100, Math.round(total / target * 100)) : 0;

  let perMealRow = '';
  if ((d.share_level === 'per_meal' || d.share_level === 'entries') && d.per_meal) {
    perMealRow = `
      <div class="compare-meals">
        ${MEAL_ORDER.map(m => `<span><b>${d.per_meal[m] || 0}</b> ${MEAL_SHORT[m]}</span>`).join('')}
      </div>
    `;
  }

  return `
    <div class="compare-card compare-state-${state}" data-friend-id="${d.friendId}">
      <div class="compare-handle">${escapeHtml(handle)}</div>
      <div class="compare-num">${total}<small> / ${target ?? '?'}</small></div>
      <div class="compare-bar"><div class="compare-bar-fill" style="width: ${barPct}%"></div></div>
      ${perMealRow}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

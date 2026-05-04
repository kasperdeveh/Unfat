import { getMyProfile } from '../db/profiles.js';
import { listProfileHistory, getTargetForDate } from '../db/profile_history.js';
import { listEntriesForDate, deleteEntry, createEntry } from '../db/entries.js';
import { listFriendBuckets, getHandlesForUsers } from '../db/friendships.js';
import { openEditSheet } from './components/edit-entry-sheet.js';
import { mountCompareWidget } from './components/compare-widget.js';
import { heroState, todayIso } from '../calc.js';
import { isoDate, parseIso, formatDayLongNl, isSameDay, addDays } from '../utils/dates.js';
import { navigate } from '../router.js';
import { supabase } from '../supabase.js';
import { escapeHtml } from '../utils/html.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export async function render(container, params, opts = {}) {
  const { skipSkeleton = false } = opts;
  const dateIso = params?.date || todayIso();
  const date = parseIso(dateIso);
  const isToday = isSameDay(date, new Date());

  if (!skipSkeleton) {
    container.innerHTML = `
      <div class="day-skeleton" aria-hidden="true">
        <div class="skeleton-block skeleton-day-nav"></div>
        <div class="skeleton-block skeleton-hero"></div>
        <div class="skeleton-block skeleton-meal-title"></div>
        <div class="skeleton-block skeleton-meal-row"></div>
        <div class="skeleton-block skeleton-meal-title"></div>
        <div class="skeleton-block skeleton-meal-row"></div>
        <div class="skeleton-block skeleton-meal-title"></div>
        <div class="skeleton-block skeleton-meal-row"></div>
        <div class="skeleton-block skeleton-meal-title"></div>
        <div class="skeleton-block skeleton-meal-row"></div>
      </div>`;
  }

  let profile, entries, history;
  try {
    [profile, entries, history] = await Promise.all([
      getMyProfile(),
      listEntriesForDate(dateIso),
      listProfileHistory(),
    ]);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon dag-view niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (!profile) {
    navigate('#/onboarding');
    return;
  }

  // Pick target/max: today uses profiles (fast path), past uses profile_history lookup.
  let target, max;
  if (isToday) {
    target = profile.daily_target_kcal;
    max = profile.daily_max_kcal;
  } else {
    const t = getTargetForDate(history, dateIso);
    target = t?.target ?? profile.daily_target_kcal;
    max = t?.max ?? profile.daily_max_kcal;
  }

  // Determine arrow availability.
  // `›` disabled after today; `‹` disabled at/before account creation date.
  const { data: { session } } = await supabase.auth.getSession();
  const accountCreated = parseIso(session.user.created_at.slice(0, 10));
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const prevDisabled = prev < accountCreated;
  const nextDisabled = next > new Date();

  const totalKcal = entries.reduce((sum, e) => sum + e.kcal, 0);
  const remaining = target - totalKcal;
  const overTarget = totalKcal - target;
  const overMax = totalKcal - max;
  const state = heroState(totalKcal, target, max);

  // Group by meal
  const byMeal = {};
  for (const meal of MEAL_ORDER) byMeal[meal] = [];
  for (const e of entries) byMeal[e.meal_type].push(e);

  // Hero text varies for today vs past
  let heroLabel, heroNum, heroBadge = '';
  if (isToday) {
    if (state === 'green') {
      heroLabel = 'Nog beschikbaar';
      heroNum = `${remaining}<small> / ${target} kcal</small>`;
    } else if (state === 'orange') {
      heroLabel = 'Boven streefdoel';
      heroNum = `+${overTarget}<small> kcal</small>`;
      heroBadge = `<div class="hero-badge">⚠ Let op je max</div>`;
    } else {
      heroLabel = 'Max overschreden';
      heroNum = `+${overMax}<small> kcal boven max</small>`;
      heroBadge = `<div class="hero-badge">🚫 Max overschreden</div>`;
    }
  } else {
    if (state === 'green') {
      heroLabel = entries.length === 0 ? 'Geen invoer' : 'Doel gehaald';
      heroNum = entries.length === 0 ? '—' : `${totalKcal}<small> kcal</small>`;
    } else if (state === 'orange') {
      heroLabel = 'Boven streefdoel';
      heroNum = `+${overTarget}<small> kcal</small>`;
    } else {
      heroLabel = 'Boven max';
      heroNum = `+${overMax}<small> kcal boven max</small>`;
    }
  }

  const barPct = target > 0 ? Math.min(100, Math.round(totalKcal / target * 100)) : 0;

  container.innerHTML = `
    <div class="day-nav">
      <button class="day-nav-btn" id="prev-day" ${prevDisabled ? 'disabled' : ''}>‹</button>
      <div class="day-nav-title">
        <h1 class="page-title">${isToday ? 'Vandaag' : formatDayLongNl(date)}</h1>
        ${isToday ? `<p class="page-subtitle">${formatDayLongNl(date)}</p>` : ''}
      </div>
      <button class="day-nav-btn" id="next-day" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>

    <div class="hero hero-${state}">
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-num">${heroNum}</div>
      <div class="hero-bar"><div class="hero-bar-fill" style="width: ${barPct}%"></div></div>
      <div class="hero-meta">
        <span>${totalKcal} gehad</span>
        <span>max ${max}</span>
      </div>
      ${heroBadge}
    </div>

    <div id="meal-list">
      ${MEAL_ORDER.map(meal => {
        const items = byMeal[meal];
        const sum = items.reduce((s, e) => s + e.kcal, 0);
        return `
          <section class="meal-section" data-meal="${meal}">
            <header class="meal-header">
              <span class="meal-title">${MEAL_LABELS[meal]}</span>
              <span class="meal-sum">${items.length === 0 ? '' : sum}</span>
            </header>
            ${items.map(e => `
              <div class="entry-row-wrap">
                <div class="entry-row-bg"><span>🗑 Verwijderen</span></div>
                <div class="entry-row" data-entry-id="${e.id}">
                  <div class="entry-info">
                    <div class="entry-name">${escapeHtml(e.products?.name || 'Onbekend')}</div>
                    <div class="entry-meta">${formatEntryMeta(e)}</div>
                  </div>
                  <span class="entry-chevron">›</span>
                </div>
              </div>
            `).join('')}
            <button class="entry-add-btn" data-add-meal="${meal}">+ toevoegen</button>
          </section>
        `;
      }).join('')}
    </div>
  `;

  // Re-render after a mutation while preserving the user's scroll position.
  // skipSkeleton keeps the old DOM in place until the fetch + new innerHTML
  // is ready, avoiding a flash. requestAnimationFrame ensures the new DOM is
  // painted before we restore scrollY.
  async function reloadKeepScroll() {
    const y = window.scrollY;
    await render(container, params, { skipSkeleton: true });
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }

  // Render compare-widget for friends (only on today's view, only if friends exist).
  if (isToday) {
    const widgetMount = document.createElement('div');
    widgetMount.id = 'compare-widget-mount';
    container.appendChild(widgetMount);

    try {
      const buckets = await listFriendBuckets();
      if (buckets.accepted.length > 0) {
        const ids = buckets.accepted.map(r => r.friend_id);
        const handleMap = await getHandlesForUsers(ids);
        const friends = buckets.accepted.map(r => ({
          friend_id: r.friend_id,
          handle: handleMap.get(r.friend_id) || '?',
        }));
        await mountCompareWidget(widgetMount, friends, dateIso);
      } else {
        widgetMount.remove();
      }
    } catch (err) {
      console.warn('Compare widget failed:', err);
      widgetMount.remove();
    }
  }

  // + toevoegen per maaltijd
  container.querySelectorAll('.entry-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const meal = btn.getAttribute('data-add-meal');
      navigate(`#/add?meal=${meal}&date=${dateIso}`);
    });
  });

  const prevBtn = container.querySelector('#prev-day');
  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => {
      navigate(`#/day?date=${isoDate(prev)}`);
    });
  }
  const nextBtn = container.querySelector('#next-day');
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => {
      const nextRoute = isSameDay(next, new Date()) ? '#/' : `#/day?date=${isoDate(next)}`;
      navigate(nextRoute);
    });
  }

  // Tap = edit-sheet, swipe-left = delete with undo.
  // Both handlers share `swiped` so the synthesized click on iOS Safari
  // after a swipe-delete does not also trigger openEditSheet.
  container.querySelectorAll('.entry-row').forEach(row => {
    let startX = null;
    let dx = 0;
    let swiped = false;

    row.addEventListener('click', () => {
      if (swiped) return; // suppress synthetic click after swipe
      const id = row.getAttribute('data-entry-id');
      const entry = entries.find(e => e.id === id);
      if (!entry) return;
      openEditSheet(id, entry, reloadKeepScroll);
    });

    row.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      dx = 0;
      row.style.transition = 'none';
    }, { passive: true });

    row.addEventListener('touchmove', (e) => {
      if (startX == null) return;
      dx = e.touches[0].clientX - startX;
      if (dx < 0) {
        row.style.transform = `translateX(${dx}px)`;
      }
    }, { passive: true });

    row.addEventListener('touchend', async () => {
      if (startX == null) return;
      row.style.transition = 'transform 0.2s';
      if (dx < -100) {
        swiped = true;
        const id = row.getAttribute('data-entry-id');
        const entry = entries.find(e => e.id === id);
        if (entry) {
          row.style.transform = 'translateX(-100%)';
          await deleteEntry(id);
          showUndoToast(entry, reloadKeepScroll);
          await reloadKeepScroll();
        }
      } else {
        row.style.transform = '';
      }
      startX = null;
      dx = 0;
    });
  });
}

function formatEntryMeta(entry) {
  const grams = Math.round(entry.amount_grams);
  const unitGrams = entry.products?.unit_grams;
  if (unitGrams) {
    const units = +(grams / unitGrams).toFixed(1);
    return `${units} ${units === 1 ? 'stuk' : 'stuks'} · ${entry.kcal} kcal`;
  }
  return `${grams}g · ${entry.kcal} kcal`;
}

function showUndoToast(deletedEntry, onUndo) {
  // Remove any existing undo-toast first
  const existing = document.getElementById('undo-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'undo-toast';
  toast.className = 'undo-toast';
  toast.innerHTML = `<span>Verwijderd</span><button id="undo-btn">↶ Undo</button>`;
  document.body.appendChild(toast);

  let undone = false;
  const timer = setTimeout(() => {
    if (!undone) toast.remove();
  }, 4000);

  toast.querySelector('#undo-btn').addEventListener('click', async () => {
    undone = true;
    clearTimeout(timer);
    toast.remove();
    try {
      await createEntry({
        product_id: deletedEntry.products?.id || deletedEntry.product_id,
        amount_grams: deletedEntry.amount_grams,
        kcal: deletedEntry.kcal,
        meal_type: deletedEntry.meal_type,
        date: deletedEntry.date,
      });
      await onUndo();
    } catch (err) {
      console.warn('Undo failed:', err);
    }
  });
}

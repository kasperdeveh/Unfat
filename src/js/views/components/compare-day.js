import { listEntriesForDate, deleteEntry, createEntry } from '../../db/entries.js';
import { listProfileHistory, getTargetForDate } from '../../db/profile_history.js';
import { getFriendDay } from '../../db/friendships.js';
import { heroState, todayIso } from '../../calc.js';
import { isoDate, parseIso, formatDayLongNl } from '../../utils/dates.js';
import { showToast } from '../../ui.js';
import { escapeHtml } from '../../utils/html.js';
import { openEditSheet } from './edit-entry-sheet.js';
import { open as openCopySheet } from './copy-date-sheet.js';
import { frBarClass } from './compare-shared.js';

const MEAL_LABELS = {
  breakfast: '🌅 Ontbijt',
  lunch:     '🥗 Lunch',
  dinner:    '🍽 Diner',
  snack:     '🍪 Snack',
};
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

function formatEntryMeta(e) {
  return `${Math.round(e.amount_grams)}g · ${e.kcal} kcal`;
}

/**
 * Compare day-view: hero met 2 progress-bars + per-maaltijd jouw blok + vriend-blok.
 *
 * @param {HTMLElement} content
 * @param {object} opts
 * @param {string} opts.friendId
 * @param {string} opts.friendHandle
 * @param {string} opts.dateIso
 * @param {object} opts.myProfile — own profile (from history orchestrator, no refetch)
 * @param {() => void} [opts.reloadFn] — called after mutations to re-render the parent view
 */
export async function render(content, { friendId, friendHandle, dateIso, myProfile, reloadFn }) {
  const date = parseIso(dateIso);

  let myEntries, myHistory, friendData;
  try {
    [myEntries, myHistory, friendData] = await Promise.all([
      listEntriesForDate(dateIso),
      listProfileHistory(),
      getFriendDay(friendId, dateIso),
    ]);
  } catch (err) {
    content.innerHTML = `<p class="error">Kon vergelijking niet laden: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (friendData.share_level === 'none') {
    content.innerHTML = `<p class="text-muted" style="margin-top:24px;text-align:center;">${escapeHtml(friendHandle)} deelt geen voortgang.</p>`;
    return;
  }

  // My target/max via history (with profile fallback)
  const myT = getTargetForDate(myHistory, dateIso) || { target: myProfile.daily_target_kcal, max: myProfile.daily_max_kcal };
  const myTotal = myEntries.reduce((s, e) => s + e.kcal, 0);
  const myState = myTotal === 0 ? null : heroState(myTotal, myT.target, myT.max);
  const myPct = myT.target > 0 ? Math.min(100, Math.round(myTotal / myT.target * 100)) : 0;

  const frTotal = friendData.total_kcal || 0;
  const frTarget = friendData.target || null;
  const frMax = friendData.max || null;
  const frState = frTotal === 0
    ? null
    : (frTarget != null && frMax != null) ? heroState(frTotal, frTarget, frMax) : 'green';
  const frPct = frTarget > 0 ? Math.min(100, Math.round(frTotal / frTarget * 100)) : 0;

  // Group my entries
  const myByMeal = {};
  for (const m of MEAL_ORDER) myByMeal[m] = [];
  for (const e of myEntries) myByMeal[e.meal_type]?.push(e);

  // Friend per_meal/entries
  const friendPerMeal = friendData.per_meal || null;
  const friendEntries = friendData.entries || [];
  const friendByMeal = {};
  for (const m of MEAL_ORDER) friendByMeal[m] = [];
  for (const e of friendEntries) friendByMeal[e.meal_type]?.push(e);

  const myFillCls = myState ? `state-${myState}` : '';
  const frFillCls = frBarClass(frState);

  // Hero
  const heroHtml = `
    <div class="compare-hero">
      <div class="compare-hero-cols">
        <div>
          <div class="compare-hero-col-label">Ik</div>
          <div class="compare-hero-col-num">${myTotal}<small> / ${myT.target ?? '?'} kcal</small></div>
        </div>
        <div>
          <div class="compare-hero-col-label">${escapeHtml(friendHandle)}</div>
          <div class="compare-hero-col-num">${frTotal}<small> / ${frTarget ?? '?'} kcal</small></div>
        </div>
      </div>
      <div class="compare-hero-bars">
        <div class="compare-hero-bar"><div class="compare-hero-bar-fill ${myFillCls}" style="width:${myPct}%"></div></div>
        <div class="compare-hero-bar"><div class="compare-hero-bar-fill ${frFillCls}" style="width:${frPct}%"></div></div>
      </div>
    </div>
  `;

  // Per-meal blocks. share_level=total: only mine; per_meal: mine + friend totals; entries: mine + friend with copy.
  const showFrMealDetail = friendData.share_level === 'per_meal' || friendData.share_level === 'entries';
  const showFrEntries = friendData.share_level === 'entries';

  const mealsHtml = MEAL_ORDER.map(meal => {
    const myItems = myByMeal[meal] || [];
    const mySum = myItems.reduce((s, e) => s + e.kcal, 0);

    const frItems = friendByMeal[meal] || [];
    const frSum = friendPerMeal ? (friendPerMeal[meal] || 0) : 0;

    const myCanCollapse = myItems.length > 0;
    const myBlock = `
      <div class="compare-meal-block" data-collapsed="1">
        <button type="button" class="compare-meal-block-header"${myCanCollapse ? ' data-toggle-collapse' : ''}>
          <div class="compare-meal-block-who">
            <span class="person-swatch person-swatch-solid"></span>Ik
          </div>
          <div class="compare-meal-block-sum">${mySum === 0 ? '—' : mySum + ' kcal'}</div>
          <span class="meal-block-chevron${myCanCollapse ? '' : ' meal-block-chevron-hidden'}" aria-hidden="true">▾</span>
        </button>
        <div class="compare-meal-block-entries">
          ${myItems.map(e => `
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
        </div>
      </div>
    `;

    const frCanCollapse = (showFrEntries && frItems.length > 0);
    const frBlock = showFrMealDetail ? `
      <div class="compare-meal-block" data-collapsed="1">
        <button type="button" class="compare-meal-block-header"${frCanCollapse ? ' data-toggle-collapse' : ''}>
          <div class="compare-meal-block-who">
            <span class="person-swatch person-swatch-striped"></span>${escapeHtml(friendHandle)}
          </div>
          <div class="compare-meal-block-sum">${frSum === 0 ? '—' : frSum + ' kcal'}</div>
          <span class="meal-block-chevron${frCanCollapse ? '' : ' meal-block-chevron-hidden'}" aria-hidden="true">▾</span>
        </button>
        <div class="compare-meal-block-entries">
          ${showFrEntries ? frItems.map(e => `
            <div class="entry-row entry-row-readonly" data-friend-entry-idx="${friendEntries.indexOf(e)}">
              <div class="entry-info">
                <div class="entry-name">${escapeHtml(e.product_name)}</div>
                <div class="entry-meta">${Math.round(e.amount_grams)}g · ${e.kcal} kcal</div>
              </div>
              <button class="entry-copy-btn" data-friend-entry-idx="${friendEntries.indexOf(e)}">Kopieer</button>
            </div>
          `).join('') : ''}
          ${showFrEntries && frItems.length > 0 ? `<button class="meal-copy-btn" data-meal="${meal}">Kopieer hele ${MEAL_LABELS[meal].split(' ')[1].toLowerCase()}</button>` : ''}
        </div>
      </div>
    ` : '';

    return `
      <section class="compare-meal" data-meal="${meal}">
        <header class="compare-meal-header">${MEAL_LABELS[meal]}</header>
        ${myBlock}
        ${frBlock}
      </section>
    `;
  }).join('');

  content.innerHTML = `
    <p class="page-subtitle" style="text-align:center;margin:0 0 12px;">${formatDayLongNl(date)}</p>
    ${heroHtml}
    ${mealsHtml}
  `;

  // Wire jouw kant: edit + tap + swipe-delete + add — exact mirroring day.js
  content.querySelectorAll('.entry-row[data-entry-id]').forEach(row => {
    let startX = null;
    let dx = 0;
    let swiped = false;

    row.addEventListener('click', () => {
      if (swiped) return;
      const id = row.getAttribute('data-entry-id');
      const entry = myEntries.find(e => e.id === id);
      if (!entry) return;
      openEditSheet(id, entry, reloadFn);
    });

    row.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      dx = 0;
      row.style.transition = 'none';
    }, { passive: true });

    row.addEventListener('touchmove', (e) => {
      if (startX == null) return;
      dx = e.touches[0].clientX - startX;
      if (dx < 0) row.style.transform = `translateX(${dx}px)`;
    }, { passive: true });

    row.addEventListener('touchend', async () => {
      if (startX == null) return;
      row.style.transition = 'transform 0.2s';
      if (dx < -100) {
        swiped = true;
        const id = row.getAttribute('data-entry-id');
        const entry = myEntries.find(e => e.id === id);
        if (entry) {
          row.style.transform = 'translateX(-100%)';
          await deleteEntry(id);
          showUndoToast(entry, reloadFn);
          if (reloadFn) await reloadFn();
        }
      } else {
        row.style.transform = '';
      }
      startX = null;
      dx = 0;
    });
  });

  // Collapse-toggle on meal-block headers (only blocks with entries get the attr)
  content.querySelectorAll('[data-toggle-collapse]').forEach(header => {
    header.addEventListener('click', () => {
      const block = header.closest('.compare-meal-block');
      if (block.dataset.collapsed === '1') {
        block.removeAttribute('data-collapsed');
      } else {
        block.setAttribute('data-collapsed', '1');
      }
    });
  });

  // Wire vriend-kant: kopieer per entry + per meal
  if (showFrEntries) {
    content.querySelectorAll('.entry-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-friend-entry-idx'), 10);
        const entry = friendEntries[idx];
        if (!entry) return;
        await runCopy(friendHandle, [entry], MEAL_LABELS[entry.meal_type] + ' entry');
      });
    });
    content.querySelectorAll('.meal-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const meal = btn.getAttribute('data-meal');
        const items = friendByMeal[meal] || [];
        if (items.length === 0) return;
        await runCopy(friendHandle, items, MEAL_LABELS[meal]);
      });
    });
  }
}

async function runCopy(handle, items, label) {
  const target = await openCopySheet({
    title: `Kopieer ${label} naar...`,
    defaultDate: todayIso(),
  });
  if (!target) return;
  try {
    for (const e of items) {
      await createEntry({
        product_id: e.product_id,
        amount_grams: e.amount_grams,
        kcal: e.kcal,
        meal_type: e.meal_type,
        date: target,
      });
    }
    const n = items.length;
    showToast(`${n} ${n === 1 ? 'entry' : 'entries'} gekopieerd naar ${target}`);
  } catch (err) {
    showToast(`Kopieer-fout: ${err.message}`);
  }
}

// Identical to day.js — undo-toast for swipe-delete (4 sec).
function showUndoToast(deletedEntry, onUndo) {
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
      if (onUndo) await onUndo();
    } catch (err) {
      console.warn('Undo failed:', err);
    }
  });
}

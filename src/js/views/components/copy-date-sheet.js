import { todayIso } from '../../calc.js';
import { supabase } from '../../supabase.js';
import { escapeHtml } from '../../utils/html.js';

let openSheet = null;

/**
 * Open a bottom-sheet with a date-picker. Resolves with chosen ISO date string,
 * or null if cancelled.
 *
 * @param {object} opts
 * @param {string} opts.title — heading text (e.g. "Kopieer Lunch naar...")
 * @param {string} [opts.defaultDate] — ISO string, defaults to today
 * @returns {Promise<string|null>}
 */
export async function open({ title, defaultDate }) {
  if (openSheet) closeSheet(null);

  // Resolve sane min: own user's profile created_at (cannot copy to before own account existed).
  const { data: { user } } = await supabase.auth.getUser();
  const minIso = user?.created_at ? user.created_at.slice(0, 10) : '2000-01-01';
  const maxIso = todayIso();
  const initial = defaultDate || maxIso;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'copy-sheet-overlay';
    overlay.innerHTML = `
      <div class="copy-sheet" role="dialog" aria-modal="true">
        <div class="copy-sheet-handle"></div>
        <h2 class="copy-sheet-title">${escapeHtml(title)}</h2>
        <input type="date" class="copy-sheet-date" value="${initial}" min="${minIso}" max="${maxIso}">
        <div class="copy-sheet-actions">
          <button class="copy-sheet-cancel" type="button">Annuleer</button>
          <button class="copy-sheet-confirm" type="button">Kopieer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const dateInput = overlay.querySelector('.copy-sheet-date');
    const confirmBtn = overlay.querySelector('.copy-sheet-confirm');
    const cancelBtn = overlay.querySelector('.copy-sheet-cancel');

    function done(result) {
      closeSheet(result);
    }
    function closeSheet(result) {
      overlay.remove();
      openSheet = null;
      resolve(result);
    }

    confirmBtn.addEventListener('click', () => {
      const value = dateInput.value;
      if (!value) return;
      done(value);
    });
    cancelBtn.addEventListener('click', () => done(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(null);
    });

    openSheet = { closeSheet };
  });
}
import { escapeHtml } from '../../utils/html.js';

const SHARE_LEVELS_OK = new Set(['total', 'per_meal', 'entries']);

/**
 * Mount the person selector pill row.
 *
 * @param {HTMLElement} container — element to render into
 * @param {object} opts
 * @param {Array<{id:string, handle:string, share_level:string}>} opts.friends — accepted friends with handle + share_level
 * @param {string|null} opts.currentFriendId — friend currently in compare mode, or null for solo
 * @param {(friendId:string|null) => void} opts.onSelect — called when user toggles a friend; null = back to solo
 * @param {(friend:{id:string, handle:string}) => void} [opts.onShareNoneTap] — optional callback when user taps a 'none'-share friend
 */
export function mount(container, { friends, currentFriendId, onSelect, onShareNoneTap }) {
  const ikSwatch = '<span class="person-swatch person-swatch-solid"></span>';
  const friendActive = (id) => id === currentFriendId;
  const friendSwatch = '<span class="person-swatch person-swatch-striped"></span>';

  container.className = 'person-selector';
  container.innerHTML = `
    <button type="button" class="person-pill person-pill-active person-pill-locked" data-locked="1" aria-label="Ik (altijd in beeld)">
      <span class="person-pill-av">Ik</span>Ik${ikSwatch}
    </button>
    ${friends.map(f => `
      <button type="button"
              class="person-pill ${friendActive(f.id) ? 'person-pill-active' : ''}"
              data-friend-id="${escapeHtml(f.id)}"
              data-share-level="${escapeHtml(f.share_level || 'none')}"
              aria-label="${escapeHtml(f.handle)} ${friendActive(f.id) ? '(actief)' : ''}">
        <span class="person-pill-av">${escapeHtml(f.handle.slice(0, 1).toUpperCase())}</span>${escapeHtml(f.handle)}${friendActive(f.id) ? friendSwatch : ''}
      </button>
    `).join('')}
  `;

  // Locked Ik-pill: no-op
  container.querySelector('[data-locked]').addEventListener('click', (e) => {
    e.preventDefault();
  });

  container.querySelectorAll('[data-friend-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-friend-id');
      const share = btn.getAttribute('data-share-level');

      if (share === 'none' || !SHARE_LEVELS_OK.has(share)) {
        if (onShareNoneTap) {
          const f = friends.find(x => x.id === id);
          if (f) onShareNoneTap(f);
        }
        return;
      }

      // Toggle: if same friend already active -> back to solo (null)
      onSelect(currentFriendId === id ? null : id);
    });
  });
}

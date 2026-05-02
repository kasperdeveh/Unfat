import { searchUsers, sendFriendRequest, listFriendBuckets, getHandlesForUsers, respondFriendRequest, unfriend } from '../db/friendships.js';
import { getMyProfile, updateMyHandle } from '../db/profiles.js';
import { mountHandleInput } from './components/handle-input.js';
import { showToast, setNavBadge } from '../ui.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../utils/html.js';

export async function render(container) {
  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Laden...</p>`;

  let profile;
  try {
    profile = await getMyProfile();
  } catch (err) {
    container.innerHTML = `<p class="error">Kon niet laden: ${err.message}</p>`;
    return;
  }
  if (!profile) {
    navigate('#/onboarding');
    return;
  }

  if (!profile.handle) {
    renderHandlePromptModal(container, async () => render(container));
    return;
  }

  await renderTab(container);
}

async function renderTab(container) {
  container.innerHTML = `
    <h1 class="page-title">Vrienden</h1>

    <div class="field">
      <input class="input" id="friend-search" type="text"
        placeholder="Zoek op username..." autocomplete="off" autocapitalize="off">
    </div>

    <div id="search-results"></div>
    <div id="incoming-section"></div>
    <div id="outgoing-section"></div>
    <div id="friends-section"></div>
  `;

  const searchInput = container.querySelector('#friend-search');
  const resultsDiv = container.querySelector('#search-results');
  let debounceTimer = null;

  searchInput.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const q = searchInput.value.trim();
    if (q.length < 1) { resultsDiv.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      try {
        const results = await searchUsers(q);
        renderSearchResults(resultsDiv, results, () => render(container));
      } catch (err) {
        resultsDiv.innerHTML = `<p class="error">${err.message}</p>`;
      }
    }, 300);
  });

  await renderSections(container);
}

function renderSearchResults(div, results, refresh) {
  if (results.length === 0) {
    div.innerHTML = `<p class="text-muted" style="padding: 8px 0;">Geen resultaten.</p>`;
    return;
  }
  div.innerHTML = `
    <h3 style="font-size:14px;margin-top:16px;">Zoekresultaten</h3>
    <ul class="friend-list">
      ${results.map(r => `
        <li class="friend-row" data-user-id="${r.user_id}">
          <span class="friend-handle">${escapeHtml(r.handle)}</span>
          ${renderActionForStatus(r.friendship_status)}
        </li>
      `).join('')}
    </ul>
  `;
  div.querySelectorAll('.friend-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.closest('.friend-row').dataset.userId;
      btn.disabled = true;
      btn.textContent = 'Bezig...';
      try {
        const result = await sendFriendRequest(userId);
        if (result === 'requested') showToast('Verzoek verstuurd');
        else if (result === 'auto_accepted') showToast('Jullie zijn nu vrienden');
        else if (result === 'already_pending') showToast('Verzoek staat al uit');
        else if (result === 'already_friends') showToast('Jullie zijn al vrienden');
        await refresh();
      } catch (err) {
        showToast('Fout: ' + err.message);
      }
    });
  });
}

function renderActionForStatus(status) {
  if (status === 'accepted') return `<span class="text-muted">Vrienden</span>`;
  if (status === 'pending_outgoing') return `<span class="text-muted">Verzoek verstuurd</span>`;
  if (status === 'pending_incoming') return `<span class="text-muted">Heeft jou een verzoek gestuurd</span>`;
  return `<button class="btn-secondary friend-add-btn">Toevoegen</button>`;
}

async function renderSections(container) {
  let buckets, handleMap;
  try {
    buckets = await listFriendBuckets();
    const allIds = [
      ...buckets.accepted.map(r => r.friend_id),
      ...buckets.incoming.map(r => r.friend_id),
      ...buckets.outgoing.map(r => r.friend_id),
    ];
    handleMap = await getHandlesForUsers(allIds);
  } catch (err) {
    return;
  }

  // Update nav badge
  setNavBadge('incomingRequests', buckets.incoming.length);

  renderIncoming(container.querySelector('#incoming-section'), buckets.incoming, handleMap, () => render(container));
  renderOutgoing(container.querySelector('#outgoing-section'), buckets.outgoing, handleMap, () => render(container));
  renderFriends(container.querySelector('#friends-section'), buckets.accepted, handleMap, () => render(container));
}

function renderIncoming(div, rows, handleMap, refresh) {
  if (rows.length === 0) { div.innerHTML = ''; return; }
  div.innerHTML = `
    <h3 style="font-size:14px;margin-top:24px;">Inkomende verzoeken (${rows.length})</h3>
    <ul class="friend-list">
      ${rows.map(r => `
        <li class="friend-row" data-user-id="${r.friend_id}">
          <span class="friend-handle">${escapeHtml(handleMap.get(r.friend_id) || '?')}</span>
          <span class="friend-actions">
            <button class="btn-icon accept-btn" title="Accepteren">✓</button>
            <button class="btn-icon reject-btn" title="Weigeren">✗</button>
          </span>
        </li>
      `).join('')}
    </ul>
  `;
  div.querySelectorAll('.accept-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.closest('.friend-row').dataset.userId;
      try {
        await respondFriendRequest(userId, true);
        showToast('Verzoek geaccepteerd');
        await refresh();
      } catch (err) { showToast('Fout: ' + err.message); }
    });
  });
  div.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.closest('.friend-row').dataset.userId;
      try {
        await respondFriendRequest(userId, false);
        showToast('Verzoek geweigerd');
        await refresh();
      } catch (err) { showToast('Fout: ' + err.message); }
    });
  });
}

function renderOutgoing(div, rows, handleMap, refresh) {
  if (rows.length === 0) { div.innerHTML = ''; return; }
  div.innerHTML = `
    <h3 style="font-size:14px;margin-top:24px;">Verstuurde verzoeken (${rows.length})</h3>
    <ul class="friend-list">
      ${rows.map(r => `
        <li class="friend-row" data-user-id="${r.friend_id}">
          <span class="friend-handle">${escapeHtml(handleMap.get(r.friend_id) || '?')}</span>
          <button class="btn-secondary withdraw-btn">Intrekken</button>
        </li>
      `).join('')}
    </ul>
  `;
  div.querySelectorAll('.withdraw-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.closest('.friend-row').dataset.userId;
      try {
        await unfriend(userId);
        showToast('Ingetrokken');
        await refresh();
      } catch (err) { showToast('Fout: ' + err.message); }
    });
  });
}

function renderFriends(div, rows, handleMap, refresh) {
  if (rows.length === 0) {
    div.innerHTML = `
      <h3 style="font-size:14px;margin-top:24px;">Vrienden (0)</h3>
      <p class="text-muted">Vind je vrienden via hun username om elkaars voortgang te zien.</p>
    `;
    return;
  }
  div.innerHTML = `
    <h3 style="font-size:14px;margin-top:24px;">Vrienden (${rows.length})</h3>
    <ul class="friend-list">
      ${rows.map(r => `
        <li class="friend-row friend-clickable" data-user-id="${r.friend_id}">
          <span class="friend-handle">${escapeHtml(handleMap.get(r.friend_id) || '?')}</span>
          <button class="btn-icon remove-btn" title="Verwijderen">⋯</button>
        </li>
      `).join('')}
    </ul>
  `;
  div.querySelectorAll('.friend-clickable').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn')) return;
      const userId = row.dataset.userId;
      navigate(`#/friend-day?id=${userId}`);
    });
  });
  div.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const userId = btn.closest('.friend-row').dataset.userId;
      const handle = handleMap.get(userId) || '?';
      if (!confirm(`${handle} verwijderen als vriend?`)) return;
      try {
        await unfriend(userId);
        showToast('Verwijderd');
        await refresh();
      } catch (err) { showToast('Fout: ' + err.message); }
    });
  });
}

function renderHandlePromptModal(container, onDone) {
  container.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Kies eerst een username</h2>
        <p class="text-muted">Vrienden kunnen je vinden via deze naam.</p>
        <div id="handle-mount"></div>
        <button class="btn" id="modal-save-btn" disabled>Opslaan</button>
        <p class="error" id="modal-error" hidden></p>
      </div>
    </div>
  `;
  const saveBtn = container.querySelector('#modal-save-btn');
  let handleValue = null;
  mountHandleInput(container.querySelector('#handle-mount'), {
    initial: '',
    onValidityChange: (ok, val) => {
      saveBtn.disabled = !ok;
      handleValue = ok ? val : null;
    },
  });
  saveBtn.addEventListener('click', async () => {
    if (!handleValue) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';
    try {
      await updateMyHandle(handleValue);
      onDone();
    } catch (err) {
      const error = container.querySelector('#modal-error');
      error.textContent = 'Fout: ' + err.message;
      error.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Opslaan';
    }
  });
}
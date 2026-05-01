import { getMyProfile, updateMyProfile, updateMyHandle, updateMyShareLevel } from '../db/profiles.js';
import { signOut } from '../auth.js';
import { supabase } from '../supabase.js';
import { showToast } from '../ui.js';
import { navigate } from '../router.js';
import { mountHandleInput } from './components/handle-input.js';

const SHARE_LABELS = {
  none:     'Niets',
  total:    'Totaal',
  per_meal: 'Per maaltijd',
  entries:  'Alles',
};

export async function render(container) {
  let profile, session;
  try {
    [profile, { data: { session } }] = await Promise.all([
      getMyProfile(),
      supabase.auth.getSession(),
    ]);
  } catch (err) {
    container.innerHTML = `<p class="error">Kon instellingen niet laden: ${err.message}</p>`;
    return;
  }

  if (!profile) { navigate('#/onboarding'); return; }

  const created = new Date(session.user.created_at).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  container.innerHTML = `
    <h1 class="page-title">Instellingen</h1>

    <form id="settings-form">
      <div class="field">
        <label class="field-label" for="target">Dagelijks streefdoel (kcal)</label>
        <input class="input" id="target" type="number" min="800" max="6000" required value="${profile.daily_target_kcal}" inputmode="numeric">
      </div>

      <div class="field">
        <label class="field-label" for="max">Absoluut max (kcal)</label>
        <input class="input" id="max" type="number" min="800" max="8000" required value="${profile.daily_max_kcal}" inputmode="numeric">
      </div>

      <button class="btn" type="submit" id="save-btn">Opslaan</button>
      <p class="error" id="set-error" hidden></p>
    </form>

    <hr style="margin:32px 0;border:0;border-top:1px solid #333;">

    <h2 style="font-size:16px;margin:0 0 12px;">Username</h2>
    <p class="text-muted" style="font-size:12px;margin-bottom:12px;">
      Vrienden kunnen je vinden via deze naam.
    </p>
    <div id="handle-mount"></div>
    <button class="btn-secondary btn" id="handle-save-btn" disabled>Username opslaan</button>

    <hr style="margin:32px 0;border:0;border-top:1px solid #333;">

    <h2 style="font-size:16px;margin:0 0 12px;">Wat deel je met vrienden</h2>
    <div class="segmented" id="share-level-seg">
      ${Object.keys(SHARE_LABELS).map(level => `
        <button type="button" data-level="${level}"
          class="seg-btn${profile.share_level === level ? ' active' : ''}">
          ${SHARE_LABELS[level]}
        </button>
      `).join('')}
    </div>

    <hr style="margin:32px 0;border:0;border-top:1px solid #333;">

    <button class="btn-secondary btn" id="signout-btn">Uitloggen</button>

    <p class="text-muted" style="font-size:11px;text-align:center;margin-top:32px;">
      ${escapeHtml(session.user.email)}<br>
      Geregistreerd op ${created}
    </p>

    <p class="text-muted" style="font-size:11px;text-align:center;margin-top:16px;opacity:0.7;">
      Productdata mede gebaseerd op<br>
      <a href="https://www.rivm.nl/nederlands-voedingsstoffenbestand" target="_blank" rel="noopener" style="color:inherit;">NEVO-online versie 2025/9.0, RIVM, Bilthoven</a>.
    </p>

    <p id="app-version-line" class="text-muted" style="font-size:10px;text-align:center;margin-top:24px;opacity:0.4;" hidden></p>
  `;

  // Show app version (read from active SW cache; absent on localhost where SW is disabled).
  if ('caches' in window) {
    caches.keys().then((keys) => {
      const cache = keys.find((k) => k.startsWith('unfat-v'));
      const el = document.getElementById('app-version-line');
      if (cache && el) {
        el.textContent = cache.replace('unfat-', '');
        el.hidden = false;
      }
    }).catch(() => { /* ignore */ });
  }

  // Goal save
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = document.getElementById('set-error');
    error.hidden = true;
    const target = parseInt(document.getElementById('target').value, 10);
    const max = parseInt(document.getElementById('max').value, 10);
    if (max < target) {
      error.textContent = 'Max moet hoger zijn dan streefdoel.';
      error.hidden = false;
      return;
    }
    const btn = document.getElementById('save-btn');
    btn.disabled = true; btn.textContent = 'Bezig...';
    try {
      await updateMyProfile({ daily_target_kcal: target, daily_max_kcal: max });
      showToast('Opgeslagen');
      btn.disabled = false; btn.textContent = 'Opslaan';
    } catch (err) {
      error.textContent = 'Kon niet opslaan: ' + err.message;
      error.hidden = false;
      btn.disabled = false; btn.textContent = 'Opslaan';
    }
  });

  // Handle change
  let handleValue = null;
  const handleSaveBtn = document.getElementById('handle-save-btn');
  mountHandleInput(document.getElementById('handle-mount'), {
    initial: profile.handle || '',
    onValidityChange: (ok, val) => {
      // Don't enable Save when value equals current (no-op)
      const changed = val && val !== profile.handle;
      handleSaveBtn.disabled = !(ok && changed);
      handleValue = (ok && changed) ? val : null;
    },
  });
  handleSaveBtn.addEventListener('click', async () => {
    if (!handleValue) return;
    handleSaveBtn.disabled = true;
    handleSaveBtn.textContent = 'Bezig...';
    try {
      await updateMyHandle(handleValue);
      showToast('Username bijgewerkt');
      profile.handle = handleValue;
      handleSaveBtn.textContent = 'Username opslaan';
    } catch (err) {
      showToast('Fout: ' + err.message);
      handleSaveBtn.disabled = false;
      handleSaveBtn.textContent = 'Username opslaan';
    }
  });

  // Share level segmented
  document.querySelectorAll('#share-level-seg .seg-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const level = btn.dataset.level;
      try {
        await updateMyShareLevel(level);
        document.querySelectorAll('#share-level-seg .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showToast('Bijgewerkt');
      } catch (err) {
        showToast('Fout: ' + err.message);
      }
    });
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    if (!confirm('Weet je zeker dat je wil uitloggen?')) return;
    try { await signOut(); navigate('#/login'); }
    catch (err) { showToast('Uitloggen mislukt'); }
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

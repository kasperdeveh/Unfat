import { getMyProfile, updateMyProfile } from '../db/profiles.js';
import { signOut } from '../auth.js';
import { supabase } from '../supabase.js';
import { showToast } from '../ui.js';
import { navigate } from '../router.js';

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

  // Guard: address-bar bypass — user reaches #/settings before onboarding ran
  if (!profile) {
    navigate('#/onboarding');
    return;
  }

  const created = new Date(session.user.created_at).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  container.innerHTML = `
    <h1 class="page-title">Instellingen</h1>

    <form id="settings-form">
      <div class="field">
        <label class="field-label" for="target">Dagelijks streefdoel (kcal)</label>
        <input class="input" id="target" type="number" min="800" max="6000" step="50" required value="${profile.daily_target_kcal}" inputmode="numeric">
      </div>

      <div class="field">
        <label class="field-label" for="max">Absoluut max (kcal)</label>
        <input class="input" id="max" type="number" min="800" max="8000" step="50" required value="${profile.daily_max_kcal}" inputmode="numeric">
      </div>

      <button class="btn" type="submit" id="save-btn">Opslaan</button>
      <p class="error" id="set-error" hidden></p>
    </form>

    <div style="height:32px;"></div>

    <button class="btn-secondary btn" id="signout-btn">Uitloggen</button>

    <p class="text-muted" style="font-size:11px;text-align:center;margin-top:32px;">
      ${escapeHtml(session.user.email)}<br>
      Geregistreerd op ${created}
    </p>
  `;

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
    btn.disabled = true;
    btn.textContent = 'Bezig...';

    try {
      await updateMyProfile({ daily_target_kcal: target, daily_max_kcal: max });
      showToast('Opgeslagen');
      btn.disabled = false;
      btn.textContent = 'Opslaan';
    } catch (err) {
      error.textContent = 'Kon niet opslaan: ' + err.message;
      error.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Opslaan';
    }
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    try {
      await signOut();
      navigate('#/login');
    } catch (err) {
      showToast('Uitloggen mislukt');
    }
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

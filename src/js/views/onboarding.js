import { createMyProfile } from '../db/profiles.js';
import { hideBottomNav } from '../ui.js';
import { navigate } from '../router.js';

export async function render(container) {
  hideBottomNav();

  container.innerHTML = `
    <h1 class="page-title">Welkom bij Unfat 👋</h1>
    <p class="page-subtitle">Stel je dagdoel en max in om te starten.</p>

    <form id="onboarding-form">
      <div class="field">
        <label class="field-label" for="target">Dagelijks streefdoel (kcal)</label>
        <input class="input" id="target" type="number" min="800" max="6000" step="50" required value="2000" inputmode="numeric">
      </div>

      <div class="field">
        <label class="field-label" for="max">Absoluut max (kcal)</label>
        <input class="input" id="max" type="number" min="800" max="8000" step="50" required value="2300" inputmode="numeric">
        <p class="text-muted" style="font-size:11px;margin-top:4px;">Mag overschreden worden — je krijgt dan een rode waarschuwing.</p>
      </div>

      <button class="btn" type="submit" id="save-btn">Aan de slag</button>
      <p class="error" id="onb-error" hidden></p>
    </form>
  `;

  const form = document.getElementById('onboarding-form');
  const error = document.getElementById('onb-error');
  const saveBtn = document.getElementById('save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const target = parseInt(document.getElementById('target').value, 10);
    const max = parseInt(document.getElementById('max').value, 10);

    if (max < target) {
      error.textContent = 'Max moet hoger zijn dan streefdoel.';
      error.hidden = false;
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Bezig...';

    try {
      await createMyProfile({ daily_target_kcal: target, daily_max_kcal: max });
      navigate('#/');
    } catch (err) {
      error.textContent = 'Kon profiel niet opslaan: ' + err.message;
      error.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Aan de slag';
    }
  });
}

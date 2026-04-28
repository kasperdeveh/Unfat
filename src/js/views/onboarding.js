import { createMyProfile, updateMyHandle } from '../db/profiles.js';
import { mountHandleInput } from './components/handle-input.js';
import { hideBottomNav } from '../ui.js';
import { navigate } from '../router.js';

export async function render(container) {
  hideBottomNav();
  let target = 2000;
  let max = 2300;
  let handleValue = null;

  function renderStep1() {
    container.innerHTML = `
      <h1 class="page-title">Welkom bij Unfat 👋</h1>
      <p class="page-subtitle">Stel je dagdoel en max in.</p>
      <form id="onboarding-form-1">
        <div class="field">
          <label class="field-label" for="target">Dagelijks streefdoel (kcal)</label>
          <input class="input" id="target" type="number" min="800" max="6000" step="50" required value="${target}" inputmode="numeric">
        </div>
        <div class="field">
          <label class="field-label" for="max">Absoluut max (kcal)</label>
          <input class="input" id="max" type="number" min="800" max="8000" step="50" required value="${max}" inputmode="numeric">
          <p class="text-muted" style="font-size:11px;margin-top:4px;">Mag overschreden worden — je krijgt dan een rode waarschuwing.</p>
        </div>
        <button class="btn" type="submit">Volgende</button>
        <p class="error" id="onb-error" hidden></p>
      </form>
    `;
    document.getElementById('onboarding-form-1').addEventListener('submit', (e) => {
      e.preventDefault();
      const error = document.getElementById('onb-error');
      error.hidden = true;
      target = parseInt(document.getElementById('target').value, 10);
      max = parseInt(document.getElementById('max').value, 10);
      if (max < target) {
        error.textContent = 'Max moet hoger zijn dan streefdoel.';
        error.hidden = false;
        return;
      }
      renderStep2();
    });
  }

  function renderStep2() {
    container.innerHTML = `
      <h1 class="page-title">Kies een username</h1>
      <p class="page-subtitle">Hiermee kunnen vrienden je vinden.</p>
      <form id="onboarding-form-2">
        <div class="field">
          <label class="field-label">Username</label>
          <div id="handle-mount"></div>
        </div>
        <button class="btn" type="submit" id="finish-btn" disabled>Aan de slag</button>
        <p class="error" id="onb-error" hidden></p>
      </form>
    `;
    const finishBtn = document.getElementById('finish-btn');
    mountHandleInput(document.getElementById('handle-mount'), {
      initial: '',
      onValidityChange: (ok, val) => {
        finishBtn.disabled = !ok;
        handleValue = ok ? val : null;
      },
    });
    document.getElementById('onboarding-form-2').addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = document.getElementById('onb-error');
      error.hidden = true;
      if (!handleValue) return;
      finishBtn.disabled = true;
      finishBtn.textContent = 'Bezig...';
      try {
        await createMyProfile({ daily_target_kcal: target, daily_max_kcal: max });
        await updateMyHandle(handleValue);
        navigate('#/');
      } catch (err) {
        error.textContent = 'Kon profiel niet opslaan: ' + err.message;
        error.hidden = false;
        finishBtn.disabled = false;
        finishBtn.textContent = 'Aan de slag';
      }
    });
  }

  renderStep1();
}

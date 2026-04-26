import { sendMagicLink } from '../auth.js';
import { hideBottomNav } from '../ui.js';

export async function render(container) {
  hideBottomNav();

  container.innerHTML = `
    <h1 class="page-title">Unfat</h1>
    <p class="page-subtitle">Log calorieën, blijf binnen je doel.</p>

    <form id="login-form">
      <div class="field">
        <label class="field-label" for="email">E-mailadres</label>
        <input class="input" id="email" type="email" required autocomplete="email" inputmode="email" placeholder="jij@voorbeeld.nl">
      </div>
      <button class="btn" type="submit" id="submit-btn">Stuur login-link</button>
      <p class="error" id="login-error" hidden></p>
    </form>

    <div id="login-success" hidden>
      <div class="card" style="text-align:center;">
        <p>📬 Check je mail.</p>
        <p class="text-muted" style="font-size:12px;">We hebben je een login-link gestuurd. Klik die en je bent ingelogd.</p>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const success = document.getElementById('login-success');
  const submitBtn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Bezig...';

    const email = document.getElementById('email').value.trim();
    try {
      await sendMagicLink(email);
      form.hidden = true;
      success.hidden = false;
    } catch (err) {
      error.textContent = 'Kon login-link niet versturen: ' + err.message;
      error.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Stuur login-link';
    }
  });
}

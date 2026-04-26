import { signIn, signUp } from '../auth.js';
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

      <div class="field">
        <label class="field-label" for="password">Wachtwoord</label>
        <input class="input" id="password" type="password" required autocomplete="current-password" minlength="6" placeholder="Minstens 6 tekens">
      </div>

      <button class="btn" type="submit" id="signin-btn">Inloggen</button>
      <button class="btn-secondary btn" type="button" id="signup-btn" style="margin-top:8px;">Account aanmaken</button>
      <p class="error" id="login-error" hidden></p>
    </form>
  `;

  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const signinBtn = document.getElementById('signin-btn');
  const signupBtn = document.getElementById('signup-btn');

  function readCredentials() {
    return {
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };
  }

  function setBusy(busy, mode) {
    signinBtn.disabled = busy;
    signupBtn.disabled = busy;
    signinBtn.textContent = busy && mode === 'signin' ? 'Bezig...' : 'Inloggen';
    signupBtn.textContent = busy && mode === 'signup' ? 'Bezig...' : 'Account aanmaken';
  }

  async function handle(action, mode) {
    error.hidden = true;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const { email, password } = readCredentials();
    setBusy(true, mode);
    try {
      await action(email, password);
      // app.js routes via onAuthStateChange after success
    } catch (err) {
      error.textContent = translateAuthError(err.message);
      error.hidden = false;
      setBusy(false);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handle(signIn, 'signin');
  });

  signupBtn.addEventListener('click', () => handle(signUp, 'signup'));
}

function translateAuthError(msg) {
  if (!msg) return 'Onbekende fout.';
  if (msg.includes('Invalid login credentials')) return 'Verkeerde combinatie van email en wachtwoord.';
  if (msg.includes('User already registered')) return 'Dit account bestaat al — gebruik "Inloggen".';
  if (msg.includes('Password should be at least')) return 'Wachtwoord moet minstens 6 tekens zijn.';
  if (msg.includes('rate limit')) return 'Te veel pogingen. Wacht een minuut en probeer opnieuw.';
  return msg;
}

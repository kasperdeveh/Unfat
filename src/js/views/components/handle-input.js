import { supabase } from '../../supabase.js';

// Renders a handle-input field with live validation.
//
// container: HTMLElement to mount into
// options.initial: starting value (string, may be '')
// options.onValidityChange: (isValid: boolean, value: string|null) => void
//
// Behaviour:
// - 300ms debounce after typing
// - Validates format client-side (3-20 chars, [A-Za-z0-9_-])
// - Checks server availability via check_handle_available RPC
//   (RPC bypasses RLS so non-friend collisions are detected too)
// - Shows inline state: idle / checking / available / taken / invalid
// - Treats user's CURRENT handle as available (no false "taken")
export function mountHandleInput(container, { initial = '', onValidityChange }) {
  container.innerHTML = `
    <input class="input handle-input" type="text" maxlength="20"
      autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="bv. Kasper" value="${escapeAttr(initial)}">
    <p class="handle-status" data-state="idle"></p>
  `;

  const input = container.querySelector('.handle-input');
  const status = container.querySelector('.handle-status');
  const FORMAT_RE = /^[A-Za-z0-9_-]{3,20}$/;

  let debounceTimer = null;
  let lastChecked = null;

  const setState = (state, msg) => {
    status.dataset.state = state;
    status.textContent = msg || '';
  };

  const validate = async () => {
    const value = input.value.trim();
    if (value === '') {
      setState('idle', '');
      onValidityChange(false, null);
      return;
    }
    if (!FORMAT_RE.test(value)) {
      setState('invalid', '3-20 tekens, alleen letters, cijfers, _ en -');
      onValidityChange(false, null);
      return;
    }
    if (value.toLowerCase() === (initial || '').toLowerCase()) {
      // Same as starting handle — count as valid (no DB hit needed)
      setState('available', 'Dit is je huidige username');
      onValidityChange(true, value);
      return;
    }
    setState('checking', 'Beschikbaarheid controleren...');
    lastChecked = value;
    try {
      const { data, error } = await supabase.rpc('check_handle_available', { candidate: value });
      if (lastChecked !== value) return; // stale response
      if (error) {
        setState('invalid', 'Kon niet controleren: ' + error.message);
        onValidityChange(false, null);
        return;
      }
      if (data === false) {
        setState('taken', 'Deze username is al in gebruik');
        onValidityChange(false, null);
      } else {
        setState('available', 'Beschikbaar');
        onValidityChange(true, value);
      }
    } catch (e) {
      if (lastChecked !== value) return;
      setState('invalid', 'Fout: ' + e.message);
      onValidityChange(false, null);
    }
  };

  input.addEventListener('input', () => {
    setState('checking', '');
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(validate, 300);
  });

  // Initial validation on mount (if there's a starting value).
  if (initial) validate();
  else onValidityChange(false, null);
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

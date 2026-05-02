// Escape characters that have meaning in HTML so user-supplied strings can be
// safely interpolated into innerHTML. Centralised here so a missed import is
// a build-time error instead of a silent XSS hole on a forgotten copy-paste.
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

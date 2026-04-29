export async function render(container, params) {
  container.innerHTML = `<p class="text-muted" style="padding:1rem 0;">Friend week-view komt eraan. id=${params?.id ?? '-'}, anchor=${params?.anchor ?? '-'}</p>`;
}

import './styles.css';
import markup from './ticket.html?raw';
import { initGoldenTicket } from './ticket.js';

const root = document.querySelector('#root');
const loading = new AbortController();
let destroy;
root.setAttribute('aria-busy', 'true');

async function mount() {
  const response = await fetch('./assets/golden-ticket.svg', { signal: loading.signal });
  if (!response.ok) throw new Error(`Unable to load ticket artwork (${response.status}).`);
  const vector = await response.text();
  if (loading.signal.aborted) return;
  root.innerHTML = markup.replace('<!-- VECTOR_ARTWORK -->', vector.replace('<svg ', '<svg class="artwork" '));
  root.removeAttribute('aria-busy');
  destroy = initGoldenTicket(document);
}

mount().catch(error => {
  if (error.name === 'AbortError') return;
  root.removeAttribute('aria-busy');
  root.innerHTML = '<p class="load-error">The ticket could not load. Please refresh to try again.</p>';
  console.error(error);
});

if (import.meta.hot) import.meta.hot.dispose(() => {
  loading.abort();
  destroy?.();
});

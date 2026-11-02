/** Busqueda sobre el indice que el repositorio construye en idle. */
import { el, delegate, clear } from '../core/dom.js';
import { createView } from './_view.js';
import { write } from '../core/scheduler.js';
import { navigate } from '../core/router.js';
import { debounce } from '../utils/timing.js';
import { bootstrap, search, getTitleById } from '../data/repository.js';
import { renderCard, recycleCard } from '../components/media/TitleCard.js';

export default async function searchView({ outlet, query: qs }) {
  await bootstrap();

  let montadas = [];
  const grid = el('div', { class: 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4' });
  const estado = el('p', { class: 'text-sm text-ink-2' }, 'Escribe al menos dos letras.');

  const input = el('input', {
    type: 'search',
    value: qs.q ?? '',
    placeholder: 'Nombre, año o genero...',
    class:
      'w-full max-w-xl rounded-pill border border-surface-3 bg-surface-1 px-5 py-3 text-ink-0 placeholder:text-ink-2 focus:border-[var(--fest-text)] focus:outline-none',
    'aria-label': 'Buscar en el catalogo',
  });

  function pintar(term) {
    const resultados = search(term ?? '');
    write(() => {
      for (const n of montadas) recycleCard(n);
      montadas = [];
      clear(grid);
      if (!term || term.trim().length < 2) {
        estado.textContent = 'Escribe al menos dos letras.';
        return;
      }
      estado.textContent = resultados.length
        ? `${resultados.length} resultado(s) para "${term}"`
        : `Sin resultados para "${term}"`;
      const frag = document.createDocumentFragment();
      for (const t of resultados) {
        const n = renderCard(t);
        montadas.push(n);
        frag.appendChild(n);
      }
      grid.appendChild(frag);
    });
  }

  const alEscribir = debounce((event) => {
    const term = event.target.value;
    history.replaceState(null, '', term ? `/buscar?q=${encodeURIComponent(term)}` : '/buscar');
    pintar(term);
  }, 180);
  input.addEventListener('input', alEscribir);

  const node = el('div', { class: 'px-4 py-8 md:px-8' }, [
    el('header', { class: 'mb-6 space-y-4' }, [
      el('h1', { class: 'font-display text-4xl tracking-wide md:text-5xl' }, 'Buscar'),
      input,
      estado,
    ]),
    grid,
  ]);

  const quitar = delegate(grid, '[data-id]', 'click', (event, target) => {
    event.preventDefault();
    const t = getTitleById(target.dataset.id);
    if (t) navigate(`/titulo/${t.slug}`);
  });

  if (qs.q) pintar(qs.q);
  write(() => input.focus());

  return createView(node, outlet, () => {
    alEscribir.cancel();
    input.removeEventListener('input', alEscribir);
    quitar();
    for (const n of montadas) recycleCard(n);
    montadas = [];
  });
}

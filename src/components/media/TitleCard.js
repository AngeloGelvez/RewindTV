/**
 * TitleCard: el componente mas instanciado de la app.
 *
 * Tres decisiones de rendimiento:
 *  1. Un unico <template> se parsea al cargar el modulo y luego se CLONA.
 *  2. Los nodos vienen de un object pool: al salir del viewport se reciclan.
 *  3. Cero listeners por tarjeta; el contenedor delega por `data-id`.
 *
 * Decision de diseno: el texto va DEBAJO del poster, no encima.
 * Superponerlo obliga a un degradado que oscurece la parte baja de la imagen y
 * aun asi falla con posters claros o con mucho detalle abajo. Fuera siempre se
 * lee, y el poster se ve entero.
 */
import { template } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage, initials } from '../ui/LazyImage.js';

const cloneCard = template(`
  <article class="card-surface group cursor-pointer select-none">
    <div class="relative overflow-hidden rounded-card bg-surface-2 shadow-[var(--shadow-card)] transition duration-300 ease-[var(--ease-out-quint)] group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-pop)]">
      <div class="aspect-[2/3] w-full">
        <span class="absolute inset-0 grid place-items-center font-display text-4xl text-ink-2/50" data-fallback></span>
        <img class="relative size-full object-cover opacity-0 transition-opacity duration-300"
             loading="lazy" decoding="async" alt="" />
      </div>

      <span class="absolute inset-0 bg-gradient-to-t from-surface-0/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>

      <span class="absolute left-2 top-2 hidden items-center gap-1 rounded-pill bg-surface-0/85 px-2 py-0.5 text-[11px] font-semibold text-ink-0 backdrop-blur" data-score>
        <svg viewBox="0 0 24 24" class="size-3" fill="currentColor" style="color: var(--fest)"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>
        <span data-score-value></span>
      </span>

      <span class="absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center gap-1.5 p-3 text-xs font-semibold text-ink-0 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <svg viewBox="0 0 24 24" class="size-4" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        Ver ahora
      </span>
    </div>

    <div class="px-0.5 pt-2.5">
      <h3 class="truncate text-sm font-medium leading-tight text-ink-0" data-card-name></h3>
      <p class="truncate pt-0.5 text-xs text-ink-2" data-card-meta></p>
    </div>
  </article>
`);

export const cardPool = createPool({
  create() {
    const node = cloneCard();
    node.__refs = {
      img: node.querySelector('img'),
      fallback: node.querySelector('[data-fallback]'),
      name: node.querySelector('[data-card-name]'),
      meta: node.querySelector('[data-card-meta]'),
      score: node.querySelector('[data-score]'),
      scoreValue: node.querySelector('[data-score-value]'),
    };
    return node;
  },
  reset(node) {
    const { img, fallback, name, meta, score } = node.__refs;
    resetImage(img);
    fallback.textContent = '';
    name.textContent = '';
    meta.textContent = '';
    score.classList.add('hidden');
    score.classList.remove('flex');
    node.removeAttribute('data-id');
    node.style.transform = '';
  },
  prime: 24,
  max: 120,
});

/** Rellena un nodo (nuevo o reciclado) con los datos de un titulo. */
export function fillCard(node, title) {
  const { img, fallback, name, meta, score, scoreValue } = node.__refs;
  node.dataset.id = title.id;

  // Las iniciales se pintan siempre debajo: si el poster carga, lo tapa; si
  // falla, ya hay algo legible en su sitio.
  fallback.textContent = initials(title.name);

  img.alt = title.name;
  img.dataset.src = title.poster;
  name.textContent = title.name;
  meta.textContent = [title.year, title.genres[0]?.label].filter(Boolean).join(' · ');

  if (title.score) {
    scoreValue.textContent = title.score.toFixed(1).replace('.0', '');
    score.classList.remove('hidden');
    score.classList.add('flex');
  }

  hydrateImage(img);
  return node;
}

export const renderCard = (title) => fillCard(cardPool.acquire(), title);
export const recycleCard = (node) => cardPool.release(node);

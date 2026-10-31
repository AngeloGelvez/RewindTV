/**
 * TitleCard: el componente mas instanciado de la app.
 *
 * Tres decisiones de rendimiento:
 *  1. Un unico <template> se parsea al cargar el modulo y luego se CLONA.
 *  2. Los nodos vienen de un object pool: al salir del viewport se reciclan.
 *  3. Cero listeners por tarjeta; el contenedor delega por `data-id`.
 */
import { template } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage } from '../ui/LazyImage.js';

const cloneCard = template(`
  <article class="card-surface group relative block overflow-hidden rounded-card bg-surface-1">
    <a class="block" data-card-link>
      <img
        class="aspect-[2/3] w-full object-cover opacity-0 transition-opacity duration-300"
        loading="lazy" decoding="async" width="300" height="450" alt="" />
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-0 to-transparent p-3">
        <h3 class="truncate text-sm font-medium" data-card-name></h3>
        <p class="text-xs text-ink-1" data-card-meta></p>
      </div>
    </a>
  </article>
`);

export const cardPool = createPool({
  create() {
    const node = cloneCard();
    node.__refs = {
      link: node.querySelector('[data-card-link]'),
      img: node.querySelector('img'),
      name: node.querySelector('[data-card-name]'),
      meta: node.querySelector('[data-card-meta]'),
    };
    return node;
  },
  reset(node) {
    resetImage(node.__refs.img);
    node.__refs.name.textContent = '';
    node.__refs.meta.textContent = '';
    node.removeAttribute('data-id');
    node.style.transform = '';
  },
  prime: 24,
  max: 120,
});

/** Rellena un nodo (nuevo o reciclado) con los datos de un titulo. */
export function fillCard(node, title) {
  const { link, img, name, meta } = node.__refs;
  node.dataset.id = title.id;
  link.href = `/titulo/${title.slug}`;
  img.alt = title.name;
  img.dataset.src = title.poster;
  name.textContent = title.name;
  meta.textContent = `${title.year} - ${title.genres[0]?.label ?? ''}`;
  hydrateImage(img);
  return node;
}

export function renderCard(title) {
  return fillCard(cardPool.acquire(), title);
}

export function recycleCard(node) {
  cardPool.release(node);
}

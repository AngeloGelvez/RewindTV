/**
 * Tarjeta de canal en vivo. Formato apaisado: el logo manda, no hay poster.
 * Pool propio, igual que TitleCard: estas se reciclan al salir del carrusel.
 */
import { template } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage } from '../ui/LazyImage.js';

const clonar = template(`
  <article class="card-surface group relative overflow-hidden rounded-card bg-surface-1 ring-fest/0 transition duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
    <div class="relative grid aspect-video place-items-center bg-surface-2 p-5">
      <img class="max-h-full max-w-full object-contain opacity-0 transition-opacity duration-300" loading="lazy" decoding="async" alt="" />
      <span class="absolute left-2 top-2 flex items-center gap-1 rounded-pill bg-live px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
        <span class="size-1.5 rounded-full bg-white"></span>En vivo
      </span>
      <span class="absolute right-2 top-2 rounded-pill bg-surface-0/80 px-2 py-0.5 text-[10px] font-medium text-ink-1" data-q></span>
    </div>
    <div class="flex items-center gap-2 p-3">
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-sm font-medium" data-name></h3>
        <p class="truncate text-xs text-ink-2" data-meta></p>
      </div>
    </div>
  </article>
`);

export const channelPool = createPool({
  create() {
    const node = clonar();
    node.__refs = {
      img: node.querySelector('img'),
      name: node.querySelector('[data-name]'),
      meta: node.querySelector('[data-meta]'),
      q: node.querySelector('[data-q]'),
    };
    return node;
  },
  reset(node) {
    resetImage(node.__refs.img);
    node.__refs.name.textContent = '';
    node.__refs.meta.textContent = '';
    node.__refs.q.textContent = '';
    node.removeAttribute('data-id');
    node.style.left = '';
  },
  prime: 12,
  max: 60,
});

export function renderChannel(channel) {
  const node = channelPool.acquire();
  const { img, name, meta, q } = node.__refs;
  node.dataset.id = channel.id;
  img.alt = channel.name;
  img.dataset.src = channel.logo;
  name.textContent = channel.name;
  meta.textContent = [channel.country?.toUpperCase(), channel.genres[0]?.label, channel.always ? null : 'Por franjas']
    .filter(Boolean)
    .join(' · ');
  q.textContent = channel.quality ?? '';
  hydrateImage(img);
  return node;
}

export const recycleChannel = (node) => channelPool.release(node);

/**
 * Tarjeta de canal en vivo.
 *
 * El problema real: los logos vienen de terceros y no comparten criterio. Unos
 * son PNG transparentes pensados para fondo claro, otros JPG con su propio
 * fondo blanco. Sobre una superficie oscura, los primeros desaparecen y los
 * segundos aparecen como recuadros blancos sueltos.
 *
 * Solucion: TODOS van sobre una placa clara. Asi el logo transparente se lee,
 * el que ya trae fondo blanco se funde con la placa, y el conjunto parece
 * deliberado en vez de accidental.
 */
import { template } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage, initials } from '../ui/LazyImage.js';

const cloneCard = template(`
  <article class="card-surface group cursor-pointer select-none overflow-hidden rounded-card bg-surface-1 ring-1 ring-surface-2 transition duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-1 hover:ring-[color-mix(in_oklab,var(--fest)_55%,transparent)]">
    <div class="relative aspect-video overflow-hidden" style="background: linear-gradient(145deg, #fbfbfd, #e9e9f0)">
      <span class="absolute inset-0 grid place-items-center text-2xl font-bold text-slate-400" data-fallback></span>
      <img class="relative size-full object-contain p-[14%] opacity-0 transition-opacity duration-300"
           loading="lazy" decoding="async" alt="" />

      <span class="absolute left-2 top-2 flex items-center gap-1.5 rounded-pill bg-live px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
        <span class="size-1.5 animate-pulse rounded-full bg-white"></span>En vivo
      </span>
      <span class="absolute right-2 top-2 hidden rounded-pill bg-slate-900/75 px-2 py-0.5 text-[10px] font-semibold text-white" data-q></span>

      <span class="absolute inset-0 grid place-items-center bg-slate-900/45 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <span class="grid size-11 place-items-center rounded-full bg-white/95 text-slate-900 shadow-lg">
          <svg viewBox="0 0 24 24" class="size-5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
      </span>
    </div>

    <div class="p-3">
      <h3 class="truncate text-sm font-medium leading-tight" data-name></h3>
      <p class="truncate pt-0.5 text-xs text-ink-2" data-meta></p>
    </div>
  </article>
`);

export const channelPool = createPool({
  create() {
    const node = cloneCard();
    node.__refs = {
      img: node.querySelector('img'),
      fallback: node.querySelector('[data-fallback]'),
      name: node.querySelector('[data-name]'),
      meta: node.querySelector('[data-meta]'),
      q: node.querySelector('[data-q]'),
    };
    return node;
  },
  reset(node) {
    const { img, fallback, name, meta, q } = node.__refs;
    resetImage(img);
    fallback.textContent = '';
    name.textContent = '';
    meta.textContent = '';
    q.textContent = '';
    q.classList.add('hidden');
    node.removeAttribute('data-id');
    node.style.left = '';
  },
  prime: 12,
  max: 60,
});

export function renderChannel(channel) {
  const node = channelPool.acquire();
  const { img, fallback, name, meta, q } = node.__refs;

  node.dataset.id = channel.id;
  fallback.textContent = initials(channel.name);

  img.alt = channel.name;
  img.dataset.src = channel.logo;
  name.textContent = channel.name;
  meta.textContent = [
    channel.country?.toUpperCase(),
    channel.genres[0]?.label,
    channel.always ? null : 'Por franjas',
  ]
    .filter(Boolean)
    .join(' · ');

  if (channel.quality) {
    q.textContent = channel.quality;
    q.classList.remove('hidden');
  }

  hydrateImage(img);
  return node;
}

export const recycleChannel = (node) => channelPool.release(node);

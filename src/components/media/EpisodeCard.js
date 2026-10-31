/**
 * Tarjeta de episodio: formato apaisado con el numero, el nombre y la duracion.
 * Pool propio; la lista de capitulos de una serie larga recicla igual que todo
 * lo demas.
 */
import { template } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage } from '../ui/LazyImage.js';
import { runtime } from '../../utils/format.js';

const clonar = template(`
  <article class="card-surface group overflow-hidden rounded-card bg-surface-1 transition hover:bg-surface-2">
    <div class="relative aspect-video bg-surface-2">
      <img class="size-full object-cover opacity-0 transition-opacity duration-300" loading="lazy" decoding="async" alt="" />
      <span class="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
        <span class="grid size-11 place-items-center rounded-full bg-ink-0/90 text-surface-0">
          <svg viewBox="0 0 24 24" class="size-5"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
        </span>
      </span>
      <span class="absolute bottom-2 right-2 rounded bg-surface-0/85 px-1.5 py-0.5 text-[11px] font-medium text-ink-1" data-dur></span>
    </div>
    <div class="space-y-1 p-3">
      <p class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--fest)" data-num></p>
      <h3 class="line-clamp-2 text-sm font-medium leading-snug" data-name></h3>
    </div>
  </article>
`);

export const episodePool = createPool({
  create() {
    const node = clonar();
    node.__refs = {
      img: node.querySelector('img'),
      name: node.querySelector('[data-name]'),
      num: node.querySelector('[data-num]'),
      dur: node.querySelector('[data-dur]'),
    };
    return node;
  },
  reset(node) {
    resetImage(node.__refs.img);
    node.__refs.name.textContent = '';
    node.__refs.num.textContent = '';
    node.__refs.dur.textContent = '';
    node.removeAttribute('data-id');
    node.classList.remove('ring-fest');
    node.style.left = '';
  },
  prime: 10,
  max: 60,
});

export function renderEpisode(episode, { still, activo } = {}) {
  const node = episodePool.acquire();
  const { img, name, num, dur } = node.__refs;
  node.dataset.id = episode.id;
  img.alt = episode.name;
  img.dataset.src = still ?? '/placeholder.svg';
  num.textContent = `T${episode.season} · E${episode.number}`;
  name.textContent = episode.name;
  dur.textContent = runtime(episode.runtime);
  node.classList.toggle('ring-fest', Boolean(activo));
  hydrateImage(img);
  return node;
}

export const recycleEpisode = (node) => episodePool.release(node);

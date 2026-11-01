/**
 * Tarjeta de episodio. Formato apaisado, con el still arriba y el texto debajo
 * (mismo criterio que TitleCard: el texto nunca pisa la imagen).
 *
 * La barra de progreso de abajo refleja lo ya visto. Se pinta con scaleX, que
 * el navegador resuelve en el compositor: actualizarla durante la reproduccion
 * no provoca layout.
 */
import { template } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage, initials } from '../ui/LazyImage.js';
import { runtime } from '../../utils/format.js';

const cloneCard = template(`
  <article class="card-surface group cursor-pointer select-none overflow-hidden rounded-card bg-surface-1 ring-1 ring-surface-2 transition duration-300 ease-[var(--ease-out-quint)] hover:bg-surface-2 hover:ring-[color-mix(in_oklab,var(--fest)_55%,transparent)]">
    <div class="relative aspect-video overflow-hidden bg-surface-2">
      <span class="absolute inset-0 grid place-items-center font-display text-3xl text-ink-2/40" data-fallback></span>
      <img class="relative size-full object-cover opacity-0 transition-opacity duration-500 group-hover:scale-105"
           loading="lazy" decoding="async" alt="" />

      <span class="absolute inset-0 grid place-items-center bg-surface-0/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <span class="grid size-11 place-items-center rounded-full bg-ink-0 text-surface-0 shadow-lg">
          <svg viewBox="0 0 24 24" class="size-5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
      </span>

      <span class="absolute bottom-2 right-2 rounded bg-surface-0/85 px-1.5 py-0.5 text-[11px] font-medium text-ink-0 backdrop-blur" data-dur></span>

      <span class="absolute inset-x-0 bottom-0 h-[3px] bg-surface-0/60">
        <span class="block h-full origin-left scale-x-0 bg-[var(--fest)] transition-transform duration-300" data-progress></span>
      </span>
    </div>

    <div class="space-y-1 p-3">
      <p class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--fest)" data-num></p>
      <h3 class="line-clamp-2 text-sm font-medium leading-snug" data-name></h3>
    </div>
  </article>
`);

export const episodePool = createPool({
  create() {
    const node = cloneCard();
    node.__refs = {
      img: node.querySelector('img'),
      fallback: node.querySelector('[data-fallback]'),
      name: node.querySelector('[data-name]'),
      num: node.querySelector('[data-num]'),
      dur: node.querySelector('[data-dur]'),
      progress: node.querySelector('[data-progress]'),
    };
    return node;
  },
  reset(node) {
    const { img, fallback, name, num, dur, progress } = node.__refs;
    resetImage(img);
    fallback.textContent = '';
    name.textContent = '';
    num.textContent = '';
    dur.textContent = '';
    progress.style.transform = 'scaleX(0)';
    node.removeAttribute('data-id');
    node.classList.remove('ring-fest');
    node.style.left = '';
  },
  prime: 10,
  max: 60,
});

export function renderEpisode(episode, { still, activo, progreso = 0 } = {}) {
  const node = episodePool.acquire();
  const { img, fallback, name, num, dur, progress } = node.__refs;

  node.dataset.id = episode.id;
  fallback.textContent = initials(episode.name);

  img.alt = episode.name;
  if (still) img.dataset.src = still;
  num.textContent = `T${episode.season} · E${episode.number}`;
  name.textContent = episode.name;
  dur.textContent = runtime(episode.runtime);
  if (progreso > 0) progress.style.transform = `scaleX(${Math.min(1, progreso)})`;
  node.classList.toggle('ring-fest', Boolean(activo));

  if (still) hydrateImage(img);
  return node;
}

export const recycleEpisode = (node) => episodePool.release(node);

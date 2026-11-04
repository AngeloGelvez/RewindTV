/**
 * Tarjeta de episodio. Formato apaisado, con el still arriba y el texto debajo
 * (mismo criterio que TitleCard: el texto nunca pisa la imagen).
 *
 * Es un <a> real: quien la pinta pasa `href` y el router hace el resto.
 *
 * La barra de progreso de abajo refleja lo ya visto. Se pinta con scaleX, que
 * el navegador resuelve en el compositor: actualizarla durante la reproduccion
 * no provoca layout.
 */
import { withBase } from '../../core/base.js';
import { template, resetLayout } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage, initials } from '../ui/LazyImage.js';
import { runtime } from '../../utils/format.js';

const cloneCard = template(`
  <a class="card-surface group block select-none overflow-hidden rounded-card bg-surface-1 ring-1 ring-surface-2 transition duration-300 ease-[var(--ease-out-quint)] hover:bg-surface-2 hover:ring-[var(--fest-ring)] focus-visible:bg-surface-2">
    <div class="relative aspect-video overflow-hidden bg-surface-2">
      <span class="absolute inset-0 grid place-items-center font-display text-3xl text-ink-2/40" aria-hidden="true" data-fallback></span>
      <img class="relative size-full object-cover opacity-0 transition-opacity duration-500 group-hover:scale-105 group-focus-visible:scale-105"
           loading="lazy" decoding="async" alt="" />

      <span class="absolute inset-0 grid place-items-center bg-surface-0/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
        <span class="grid size-11 place-items-center rounded-full bg-ink-0 text-surface-0 shadow-lg">
          <svg viewBox="0 0 24 24" class="size-5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
      </span>

      <span class="absolute bottom-2 right-2 rounded bg-surface-0/85 px-1.5 py-0.5 text-[11px] font-medium text-ink-0 backdrop-blur" data-dur></span>

      <span class="absolute inset-x-0 bottom-0 h-[3px] bg-surface-0/60" aria-hidden="true">
        <span class="block h-full origin-left scale-x-0 bg-[var(--fest)] transition-transform duration-300" data-progress></span>
      </span>
    </div>

    <div class="space-y-1 p-3">
      <p class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--fest-text)" data-num></p>
      <h3 class="line-clamp-2 text-sm font-medium leading-snug" data-name></h3>
      <p class="hidden truncate text-xs text-ink-2" data-serie></p>
    </div>
  </a>
`);

export const episodePool = createPool({
  create() {
    const node = cloneCard();
    node.__refs = {
      img: node.querySelector('img'),
      fallback: node.querySelector('[data-fallback]'),
      name: node.querySelector('[data-name]'),
      num: node.querySelector('[data-num]'),
      serie: node.querySelector('[data-serie]'),
      dur: node.querySelector('[data-dur]'),
      progress: node.querySelector('[data-progress]'),
    };
    return node;
  },
  reset(node) {
    const { img, fallback, name, num, dur, progress, serie } = node.__refs;
    serie.textContent = '';
    serie.classList.add('hidden');
    resetImage(img);
    fallback.textContent = '';
    name.textContent = '';
    num.textContent = '';
    dur.textContent = '';
    progress.style.transform = 'scaleX(0)';
    node.removeAttribute('data-id');
    node.removeAttribute('href');
    node.removeAttribute('aria-current');
    node.classList.remove('ring-fest');
    resetLayout(node);
  },
  prime: 10,
  max: 60,
});

/**
 * @param {object} [opts]
 * @param {string} [opts.serie] nombre de la serie. En la ficha sobra —ya estas
 *   dentro de ella— pero en una fila tematica los capitulos vienen de series
 *   distintas y sin esto no se sabe de que son.
 */
export function renderEpisode(episode, { still, activo, progreso = 0, href, serie: nombreSerie } = {}) {
  const node = episodePool.acquire();
  const { img, fallback, name, num, dur, progress, serie } = node.__refs;

  node.dataset.id = episode.id;
  if (href) node.href = withBase(href);
  fallback.textContent = initials(episode.name);

  img.alt = '';
  if (still) img.dataset.src = still;
  num.textContent = `T${episode.season} · E${episode.number}`;
  name.textContent = episode.name;
  dur.textContent = runtime(episode.runtime);
  if (nombreSerie) {
    serie.textContent = nombreSerie;
    serie.classList.remove('hidden');
  }
  if (progreso > 0) progress.style.transform = `scaleX(${Math.min(1, progreso)})`;
  node.classList.toggle('ring-fest', Boolean(activo));
  if (activo) node.setAttribute('aria-current', 'true');

  if (still) hydrateImage(img);
  return node;
}

export const recycleEpisode = (node) => episodePool.release(node);

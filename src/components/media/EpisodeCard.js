/**
 * Tarjeta de episodio. Formato apaisado, con el still arriba y el texto debajo
 * (mismo criterio que TitleCard: el texto nunca pisa la imagen).
 *
 * Es un <a> real: quien la pinta pasa `href` y el router hace el resto.
 *
 * La barra de progreso de abajo refleja lo ya visto. Se pinta con scaleX, que
 * el navegador resuelve en el compositor: actualizarla durante la reproduccion
 * no provoca layout.
 *
 * CUANDO NO HAY FOTOGRAMA
 * -----------------------
 * Solo 7.692 de los 28.200 capitulos del catalogo tienen fotograma propio: el
 * resto no aparece en TMDB con el nombre con el que esta aqui. Antes esos
 * capitulos repetian el fondo de la serie tal cual, asi que una temporada de
 * 26 era la misma foto 26 veces y la rejilla parecia una sola imagen en mosaico
 * —peor que un hueco, porque el ojo no distinguia una tarjeta de otra—.
 *
 * Ahora el respaldo es una MINIATURA PROPIA: el arte de la serie teñido con el
 * color de la cadena y el numero del capitulo grande encima. El tono del tinte
 * y el angulo del degradado salen del propio numero, asi que dos capitulos
 * seguidos nunca se pintan igual y la rejilla vuelve a leerse como una lista.
 * Se nota que es un respaldo y no un fotograma real, que es justo lo que debe
 * pasar: no se finge material que no se tiene.
 */
import { withBase } from '../../core/base.js';
import { template, resetLayout } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage, initials } from '../ui/LazyImage.js';
import { inkFor, shade } from '../../core/theme.js';
import { runtime } from '../../utils/format.js';
import { atSize } from '../../data/models/images.js';

const cloneCard = template(`
  <a class="card-surface group block select-none overflow-hidden rounded-card bg-surface-1 ring-1 ring-surface-2 transition duration-300 ease-[var(--ease-out-quint)] hover:bg-surface-2 hover:ring-[var(--fest-ring)] focus-visible:bg-surface-2">
    <div class="relative aspect-video overflow-hidden bg-surface-2">
      <span class="absolute inset-0" aria-hidden="true" data-canvas></span>
      <span class="absolute inset-0 grid place-items-center font-display text-3xl text-ink-2/40" aria-hidden="true" data-fallback></span>
      <img class="relative size-full object-cover opacity-0 transition-opacity duration-500 group-hover:scale-105 group-focus-visible:scale-105"
           loading="lazy" decoding="async" alt="" />

      <span class="absolute inset-0 hidden place-items-center" aria-hidden="true" data-plate>
        <span class="font-display text-[2.75rem] leading-none tracking-tight opacity-90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]" data-plate-num></span>
      </span>

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
      canvas: node.querySelector('[data-canvas]'),
      plate: node.querySelector('[data-plate]'),
      plateNum: node.querySelector('[data-plate-num]'),
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
    const { img, canvas, plate, plateNum, fallback, name, num, dur, progress, serie } = node.__refs;
    serie.textContent = '';
    serie.classList.add('hidden');
    resetImage(img);
    img.style.filter = '';
    canvas.style.background = '';
    plate.classList.add('hidden');
    plate.classList.remove('grid');
    plate.style.background = '';
    plateNum.textContent = '';
    plateNum.style.color = '';
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

const GRIS = '#4b4b63';

/**
 * Viste la miniatura de respaldo de un capitulo sin fotograma propio.
 *
 * Todo sale del numero del capitulo, nada es aleatorio: la misma tarjeta se
 * pinta igual en cada visita (y al reciclarse el nodo del pool), pero dos
 * capitulos seguidos caen en tonos y angulos distintos.
 *
 * Las cuatro variantes son suficientes: lo que hay que romper es la sensacion
 * de mosaico entre vecinas, y para eso basta que la de al lado no coincida.
 */
function vestirRespaldo({ canvas, plate, plateNum, img }, episode, title) {
  const color = title?.network?.color ?? GRIS;
  const variante = (Number(episode.season ?? 1) * 3 + Number(episode.number ?? 1)) % 4;

  // El lienzo de abajo se ve cuando la serie no tiene ni fondo ni portada.
  canvas.style.background = `linear-gradient(145deg, ${color}, ${shade(color, 0.7)})`;

  // Sobre el arte de la serie, un velo del color de la cadena: apaga la foto
  // para que el numero se lea y, de paso, cada variante tiñe distinto.
  const angulo = 115 + variante * 25;
  const claro = shade(color, 0.16 + variante * 0.13);
  const oscuro = shade(color, 0.58 + variante * 0.09);
  plate.style.background = `linear-gradient(${angulo}deg, ${claro}73, ${oscuro}d9)`;
  plate.classList.remove('hidden');
  plate.classList.add('grid');

  plateNum.textContent = String(episode.number ?? '');
  plateNum.style.color = inkFor(oscuro);

  // Nada de desaturar del todo: el arte sigue aportando el ambiente de la
  // serie, que es lo unico que esta miniatura puede decir del capitulo.
  img.style.filter = 'saturate(0.7)';
}

/**
 * @param {object} [opts]
 * @param {string} [opts.serie] nombre de la serie. En la ficha sobra —ya estas
 *   dentro de ella— pero en una fila tematica los capitulos vienen de series
 *   distintas y sin esto no se sabe de que son.
 */
export function renderEpisode(episode, { title, activo, progreso = 0, href, serie: nombreSerie } = {}) {
  const node = episodePool.acquire();
  const { img, canvas, plate, plateNum, fallback, name, num, dur, progress, serie } = node.__refs;

  node.dataset.id = episode.id;
  if (href) node.href = withBase(href);
  fallback.textContent = initials(title?.name ?? episode.name);
  fallback.style.backgroundColor = title?.network?.color ?? '';

  img.alt = '';
  const cover = atSize(title?.backdrop ?? title?.poster, 'card');
  const still = episode.still ?? cover;
  if (still) img.dataset.src = still;
  if (!episode.still) vestirRespaldo({ canvas, plate, plateNum, img }, episode, title);
  num.textContent = `T${episode.season} · E${episode.number}`;
  name.textContent = episode.name;
  dur.textContent = runtime(episode.runtime);
  dur.hidden = !episode.runtime;
  if (nombreSerie) {
    serie.textContent = nombreSerie;
    serie.classList.remove('hidden');
  }
  if (progreso > 0) progress.style.transform = `scaleX(${Math.min(1, progreso)})`;
  node.classList.toggle('ring-fest', Boolean(activo));
  if (activo) node.setAttribute('aria-current', 'true');

  if (still) hydrateImage(img, { onError: () => {
    if (cover && img.getAttribute('src') !== cover) {
      // El fotograma que decia el dato ya no esta: se cae al arte de la serie,
      // y entonces esto es un respaldo como cualquier otro y se viste igual.
      img.src = cover;
      vestirRespaldo({ canvas, plate, plateNum, img }, episode, title);
    }
  } });
  return node;
}

export const recycleEpisode = (node) => episodePool.release(node);

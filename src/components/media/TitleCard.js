/**
 * TitleCard: el componente mas instanciado de la app.
 *
 * Tres decisiones de rendimiento:
 *  1. Un unico <template> se parsea al cargar el modulo y luego se CLONA.
 *  2. Los nodos vienen de un object pool: al salir del viewport se reciclan.
 *  3. Cero listeners por tarjeta; el contenedor delega por `data-id`.
 *
 * Es un <a> real, no un <article> con click: asi se alcanza con Tab y con
 * el mando de la tele, Enter funciona solo y el lector de pantalla lo anuncia
 * como enlace. Lo decorativo va con aria-hidden para que se lea limpio:
 * "2 Perros Tontos, 1993, 12 capitulos, Cartoon Network".
 *
 * Formato APAISADO (16:9) y no poster vertical: es el formato en el que viene
 * el material de television, llena mejor una fila en pantallas anchas y, con
 * el catalogo aun sin arte, un rectangulo con el color de la cadena se lee
 * mucho mejor que un poster vertical vacio.
 *
 * El texto va DEBAJO de la imagen, no encima: superponerlo obliga a un
 * degradado que oscurece la foto y aun asi falla con imagenes claras. Solo los
 * dos chips de estado van dentro, que es donde se esperan.
 */
import { template, resetLayout } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage, initials } from '../ui/LazyImage.js';
import { inkFor, shade } from '../../core/theme.js';
import { atSize } from '../../data/models/images.js';

const cloneCard = template(`
  <a class="card-surface group block select-none">
    <div class="relative aspect-video overflow-hidden rounded-card bg-surface-2 shadow-[var(--shadow-card)] transition duration-300 ease-[var(--ease-out-quint)] group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-pop)] group-focus-visible:-translate-y-1">
      <span class="absolute inset-0" aria-hidden="true" data-art></span>
      <span class="absolute inset-0 grid place-items-center font-display text-3xl font-bold text-white/70" aria-hidden="true" data-fallback></span>
      <img class="relative size-full object-cover opacity-0 transition-opacity duration-300"
           loading="lazy" decoding="async" alt="" />

      <span class="absolute inset-x-0 bottom-0 h-1/2 scrim opacity-80" aria-hidden="true"></span>

      <span class="absolute inset-x-2 bottom-2 flex items-center gap-1.5 overflow-hidden" aria-hidden="true">
        <span class="truncate rounded-pill px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider" data-net></span>
        <span class="shrink-0 whitespace-nowrap rounded-pill chip-glass px-2 py-[3px] text-[10px] font-semibold" data-count></span>
      </span>

      <span class="absolute right-2 top-2 hidden items-center gap-1 rounded-pill chip-glass px-2 py-[3px] text-[10px] font-bold" data-score>
        <svg viewBox="0 0 24 24" class="size-3" fill="currentColor" style="color: #fbbf24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>
        <span class="sr-only">Puntuacion </span><span data-score-value></span>
      </span>

      <span class="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
        <span class="grid size-12 place-items-center rounded-full bg-white/95 text-[#111115] shadow-lg">
          <svg viewBox="0 0 24 24" class="size-5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
      </span>
    </div>

    <h3 class="clamp-2 pt-2.5 text-sm font-semibold leading-snug text-ink-0" data-card-name></h3>

    <span class="flex items-center gap-2 pt-1.5" aria-hidden="true">
      <span class="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold" data-avatar></span>
      <span class="truncate text-xs text-ink-2" data-card-meta></span>
    </span>
  </a>
`);

export const cardPool = createPool({
  create() {
    const node = cloneCard();
    node.__refs = {
      img: node.querySelector('img'),
      art: node.querySelector('[data-art]'),
      fallback: node.querySelector('[data-fallback]'),
      name: node.querySelector('[data-card-name]'),
      meta: node.querySelector('[data-card-meta]'),
      avatar: node.querySelector('[data-avatar]'),
      net: node.querySelector('[data-net]'),
      count: node.querySelector('[data-count]'),
      score: node.querySelector('[data-score]'),
      scoreValue: node.querySelector('[data-score-value]'),
    };
    return node;
  },
  reset(node) {
    const { img, fallback, name, meta, score, net, count, avatar } = node.__refs;
    resetImage(img);
    fallback.textContent = '';
    name.textContent = '';
    meta.textContent = '';
    net.textContent = '';
    count.textContent = '';
    avatar.textContent = '';
    score.classList.add('hidden');
    score.classList.remove('flex');
    node.removeAttribute('data-id');
    node.removeAttribute('href');
    node.removeAttribute('aria-label');
    // Incluye la separacion que anade la grilla y la posicion absoluta que
    // ponen carrusel y grilla: sin eso la tarjeta se lleva la colocacion de
    // una vista a la siguiente.
    resetLayout(node);
  },
  prime: 18,
  max: 90,
});

/** Rellena un nodo (nuevo o reciclado) con los datos de un titulo. */
export function fillCard(node, title) {
  const { img, art, fallback, name, meta, avatar, net, count, score, scoreValue } = node.__refs;
  node.dataset.id = title.id;
  node.href = `/titulo/${title.slug}`;

  const color = title.network?.color ?? '#6e6e80';
  const tinta = inkFor(color);

  // Mientras no haya arte real, el lienzo es el color de la cadena con las
  // iniciales encima: distingue una tarjeta de otra de un vistazo.
  art.style.background = `linear-gradient(145deg, ${color}, ${shade(color, 0.65)})`;
  fallback.textContent = initials(title.name);

  // La tarjeta es apaisada: manda el fondo horizontal, y la portada vertical
  // solo entra si no hay fondo (recortada, pero mejor que nada). Sin ninguna
  // de las dos NO se carga nada: queda el color de la cadena con las
  // iniciales, que es lo que distingue una tarjeta de otra.
  img.alt = '';
  // La tarjeta mide ~280 px: pedir el fondo de 1280 del hero seria bajar seis
  // veces mas pixeles de los que caben en ella.
  const arteReal = atSize(title.backdrop ?? title.poster, 'card');
  if (arteReal) {
    img.dataset.src = arteReal;
    hydrateImage(img);
  }
  name.textContent = title.name;

  net.textContent = title.network?.name ?? 'Otros';
  net.style.background = color;
  net.style.color = tinta;

  count.textContent =
    title.kind === 'serie' ? `${title.seasonCount ?? 1} T · ${title.episodeCount ?? 0} cap` : 'Pelicula';

  avatar.textContent = initials(title.network?.name ?? title.name);
  avatar.style.background = color;
  avatar.style.color = tinta;
  meta.textContent = [title.year, title.network?.name].filter(Boolean).join(' · ');

  // El lector de pantalla recibe una frase, no los trozos sueltos de la ficha.
  node.setAttribute(
    'aria-label',
    `${title.name}, ${title.year}${title.score ? `, puntuacion ${title.score}` : ''}${title.network ? `, ${title.network.name}` : ''}`,
  );

  if (title.score) {
    scoreValue.textContent = title.score.toFixed(1).replace('.0', '');
    score.classList.remove('hidden');
    score.classList.add('flex');
  }

  return node;
}

export const renderCard = (title) => fillCard(cardPool.acquire(), title);
export const recycleCard = (node) => cardPool.release(node);

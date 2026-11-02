/**
 * Tarjeta de cadena (Cartoon Network, Nickelodeon, Fox Kids...).
 *
 * Es la unica tarjeta del catalogo con fondo de color propio: la cadena ES un
 * color —cada una tiene el suyo en `taxonomy.js`— y usarlo aqui convierte una
 * fila de ocho nombres en algo que se reconoce sin leer.
 *
 * El degradado se calcula en JS (`shade`) y no con color-mix(), que no existe
 * en los navegadores de television anteriores a Chromium 111.
 *
 * No usa object pool: son ocho, no miles. Se cachean por slug para que
 * entrar y salir del carril no reconstruya el nodo.
 */
import { el } from '../../core/dom.js';
import { icon } from '../ui/icons.js';
import { initials } from '../ui/LazyImage.js';
import { contrast, shade } from '../../core/theme.js';

/**
 * Todas las tarjetas llevan el texto EN BLANCO, sin excepciones: con unas
 * cadenas en blanco y otras en negro —segun saliera su color— la fila se leia
 * como ocho tarjetas de sitios distintos.
 *
 * Para que eso se sostenga, el fondo se oscurece lo justo: se busca la mezcla
 * mas suave del color de la cadena que ya da 4.5:1 contra el blanco. El azul
 * claro de Cartoon Network necesita bajar bastante; el azul de Warner, casi
 * nada. Asi el color sigue siendo reconocible y el texto se lee siempre.
 */
function fondoLegible(color) {
  for (let t = 0; t <= 0.72; t += 0.04) {
    const c = shade(color, t);
    if (contrast(c, '#ffffff') >= 4.5) return c;
  }
  return shade(color, 0.72);
}

const cache = new Map();

/**
 * Placa del logo.
 *
 * Los logos de cadena vienen pensados para fondo claro —unos son blancos con
 * transparencia, otros negros— asi que ninguno se puede poner directamente
 * sobre el degradado de color de la tarjeta: la mitad desapareceria. Van todos
 * sobre la misma placa clara, como ya se hace con los logos de los canales.
 *
 * Debajo quedan SIEMPRE las iniciales. Son logos alojados fuera; si uno no
 * carga, la tarjeta sigue diciendo de quien es en vez de ensenar un hueco.
 */
export function placa(network, color, { caja: clase = 'h-14 w-full px-3', logo: alto = 'max-h-9', texto = 'text-base' } = {}) {
  const iniciales = el(
    'span',
    { class: `absolute font-extrabold ${texto}`, style: `color: ${shade(color, 0.35)}` },
    initials(network.name),
  );

  const caja = el(
    'span',
    {
      class: `relative grid place-items-center overflow-hidden rounded-chip bg-white/92 ring-1 ring-black/5 ${clase}`,
      'aria-hidden': 'true',
    },
    [iniciales],
  );

  if (network.logo) {
    const img = el('img', {
      class: `relative w-auto max-w-full object-contain opacity-0 transition-opacity duration-300 ${alto}`,
      src: network.logo,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
      onLoad: () => {
        img.style.opacity = '1';
        iniciales.style.display = 'none';
      },
    });
    caja.appendChild(img);
  }

  return caja;
}

export function renderNetwork(entry) {
  const hit = cache.get(entry.slug);
  if (hit) return hit;

  const color = entry.network.color;
  const base = fondoLegible(color);
  const titulos = entry.titles.length;
  const anios = entry.titles.map((t) => t.year).filter(Boolean);
  const decada = anios.length ? `${Math.floor(Math.min(...anios) / 10) * 10}s` : null;

  const chip = (texto) =>
    el(
      'span',
      {
        class: 'shrink-0 whitespace-nowrap rounded-pill px-2 py-[3px] text-[10px] font-semibold',
        style: 'background: rgb(255 255 255 / .18)',
      },
      texto,
    );

  const node = el(
    'a',
    {
      href: `/explorar?cadena=${encodeURIComponent(entry.slug)}`,
      'data-id': entry.slug,
      'aria-label': `${entry.network.name}, ${titulos} titulos`,
      class:
        'card-surface group flex h-full select-none flex-col items-center gap-2 overflow-hidden rounded-card p-4 text-center ' +
        'shadow-[var(--shadow-card)] transition duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-1 focus-visible:-translate-y-1',
      style: `background: linear-gradient(160deg, ${base}, ${shade(color, 0.82)}); color: #fff`,
    },
    [
      placa(entry.network, color),
      // Alto reservado para dos lineas: con nombres de una y de dos palabras
      // mezclados, sin esto los botones de cada tarjeta quedan a distinta
      // altura y la fila se ve descuadrada.
      el('span', { class: 'clamp-2 min-h-[2.5em] text-sm font-bold leading-tight' }, entry.network.name),
      el('span', { class: 'flex flex-nowrap justify-center gap-1' }, [
        chip(`${titulos} titulos`),
        decada ? chip(`desde ${decada}`) : null,
      ]),
      el(
        'span',
        {
          class:
            'mt-auto inline-flex items-center gap-1.5 rounded-pill border border-white/35 px-3 py-1.5 text-[11px] font-semibold transition group-hover:border-white/70',
          'aria-hidden': 'true',
        },
        [icon('plus', 'size-3.5'), 'Ver catalogo'],
      ),
    ],
  );

  cache.set(entry.slug, node);
  return node;
}

/** El carril saca el nodo del DOM; la cache lo conserva para la vuelta. */
export const recycleNetwork = () => {};

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
import { inkFor, shade } from '../../core/theme.js';

const cache = new Map();

export function renderNetwork(entry) {
  const hit = cache.get(entry.slug);
  if (hit) return hit;

  const color = entry.network.color;
  const tinta = inkFor(color);
  const titulos = entry.titles.length;
  const anios = entry.titles.map((t) => t.year).filter(Boolean);
  const decada = anios.length ? `${Math.floor(Math.min(...anios) / 10) * 10}s` : null;

  const chip = (texto) =>
    el(
      'span',
      {
        class: 'shrink-0 whitespace-nowrap rounded-pill px-2 py-[3px] text-[10px] font-semibold',
        style: `background: rgb(255 255 255 / .16); color: ${tinta}`,
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
        'card-surface group flex select-none flex-col items-center gap-2 overflow-hidden rounded-card p-4 text-center ' +
        'shadow-[var(--shadow-card)] transition duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-1 focus-visible:-translate-y-1',
      style: `background: linear-gradient(160deg, ${color}, ${shade(color, 0.72)}); color: ${tinta}`,
    },
    [
      el(
        'span',
        {
          class: 'grid size-14 place-items-center rounded-full text-lg font-extrabold ring-2 ring-white/40',
          style: `background: ${shade(color, 0.45)}; color: #fff`,
          'aria-hidden': 'true',
        },
        initials(entry.network.name),
      ),
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

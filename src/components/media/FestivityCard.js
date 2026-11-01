/**
 * Tarjeta de festividad para la franja de "proximas".
 *
 * La cuenta atras es real: sale de la regla de cada festividad resuelta al año
 * en curso (`repository.festivityCalendar`), no de una fecha escrita a mano.
 * Por eso la franja nunca caduca — el 2 de noviembre, Navidad pasa sola de
 * "faltan 29 dias" a lo que toque.
 *
 * Las que no tienen contenido se marcan en vez de esconderse: que una fiesta
 * exista y aun no tenga capitulos es informacion util para quien llena el
 * catalogo, y para quien mira es honesto.
 */
import { el } from '../../core/dom.js';
import { icon } from '../ui/icons.js';
import { inkFor, shade } from '../../core/theme.js';

const cache = new Map();

const cuenta = (days) => {
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Manana';
  if (days < 30) return `En ${days} dias`;
  const meses = Math.round(days / 30);
  return `En ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
};

export function renderFestivity(entry) {
  const { festivity: f, days, picks } = entry;
  const hit = cache.get(f.slug);
  if (hit) return hit;

  const color = f.color;
  const tinta = inkFor(color);
  const hoy = days === 0;

  const node = el(
    'a',
    {
      href: picks ? `/explorar?fest=${encodeURIComponent(f.slug)}` : '/explorar',
      'data-id': f.slug,
      'aria-label': `${f.label}, ${cuenta(days).toLowerCase()}, ${picks} capitulos`,
      class:
        'card-surface group flex select-none flex-col gap-2 overflow-hidden rounded-card p-4 ' +
        'shadow-[var(--shadow-card)] transition duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-1 focus-visible:-translate-y-1',
      style: `background: linear-gradient(155deg, ${shade(color, hoy ? 0.15 : 0.45)}, ${shade(color, 0.8)}); color: ${hoy ? tinta : '#fff'}`,
    },
    [
      el('span', { class: 'flex items-center justify-between gap-2' }, [
        el(
          'span',
          {
            class: 'inline-flex items-center gap-1.5 rounded-pill px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider',
            style: 'background: rgb(255 255 255 / .2)',
          },
          [icon('calendar', 'size-3'), cuenta(days)],
        ),
        el('span', { class: 'text-xl leading-none', 'aria-hidden': 'true' }, f.emoji),
      ]),
      el('span', { class: 'pt-1 text-sm font-bold leading-tight' }, f.label),
      el('span', { class: 'clamp-2 text-[11px] leading-snug opacity-80' }, f.tagline),
      el(
        'span',
        {
          class:
            'mt-auto inline-flex items-center gap-1.5 rounded-pill border border-white/30 px-3 py-1.5 text-[11px] font-semibold transition group-hover:border-white/70',
          'aria-hidden': 'true',
        },
        [icon('sparkle', 'size-3.5'), picks ? `${picks} capitulos` : 'Sin contenido aun'],
      ),
    ],
  );

  cache.set(f.slug, node);
  return node;
}

export const recycleFestivity = () => {};

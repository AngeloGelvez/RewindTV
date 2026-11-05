/**
 * Guia: la programacion de hoy, hora por hora.
 *
 * El catalogo es bajo demanda, asi que esto no es una emision en directo: es una
 * sugerencia de que ver a cada hora. Sale de la fecha y no de un sorteo, para
 * que todos vean la misma durante el dia y cambie sola al siguiente. Solo entran
 * series sin ventanas de anuncios.
 */
import { el } from '../core/dom.js';
import { createView } from './_view.js';
import { bootstrap, query } from '../data/repository.js';
import { clock } from '../utils/format.js';
import { sorteoDelDia } from '../utils/dia.js';

const HORAS = 12;

export default async function guideView({ outlet }) {
  await bootstrap();

  const ahora = new Date();
  const series = sorteoDelDia(query({ sort: 'score' }).filter((t) => t.adFree && t.score >= 7));

  const inicioHora = new Date(ahora);
  inicioHora.setMinutes(0, 0, 0);

  const filas = Array.from({ length: Math.min(HORAS, series.length) }, (_, i) => {
    const hora = inicioHora.getTime() + i * 3_600_000;
    // La posicion depende de la hora real: la misma hora siempre da la misma serie.
    const t = series[new Date(hora).getHours() % series.length];
    const esAhora = i === 0;
    return el('li', {}, [
      el(
        'a',
        {
          href: `/ver/${t.slug}`,
          class:
            'flex items-center gap-4 rounded-card border p-4 transition hairline hover:border-[var(--fest-text)] ' +
            (esAhora ? 'bg-surface-2' : 'bg-surface-1'),
          'aria-label': `${esAhora ? 'Ahora' : clock(hora)}: ${t.name}`,
        },
        [
          el('span', { class: 'w-16 shrink-0 font-mono text-sm', style: 'color: var(--fest-text)' }, clock(hora)),
          el('span', { class: 'min-w-0 flex-1' }, [
            el('span', { class: 'block truncate text-sm font-semibold text-ink-0' }, t.name),
            el('span', { class: 'block truncate text-xs text-ink-2' }, [t.network?.name, t.year].filter(Boolean).join(' · ')),
          ]),
          esAhora
            ? el('span', { class: 'shrink-0 rounded-pill bg-live px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white' }, 'Ahora')
            : null,
        ],
      ),
    ]);
  });

  const node = el('div', { class: 'px-4 py-7 md:px-6 md:py-9 lg:px-8' }, [
    el('header', { class: 'mb-6 space-y-2' }, [
      el('h1', { class: 'font-display text-3xl font-extrabold tracking-tight md:text-4xl' }, 'Guia de hoy'),
      el('p', { class: 'text-sm text-ink-1' }, 'Una serie para cada hora. Elige una y empieza desde el primer capitulo.'),
    ]),
    el('ul', { class: 'max-w-3xl space-y-2' }, filas),
  ]);

  return createView(node, outlet);
}

/**
 * Guia de programacion (EPG) del catalogo propio.
 * Pendiente: grilla virtualizada en dos ejes (canales x tiempo). De momento
 * lista la programacion del dia a partir de schedule.json.
 */
import { withBase } from '../core/base.js';
import { el } from '../core/dom.js';
import { createView } from './_view.js';
import { clock } from '../utils/format.js';

export default async function guideView({ outlet }) {
  const programas = await fetch(withBase('/data/schedule.json')).then((r) => r.json()).catch(() => []);

  const filas = programas
    .map((p) => ({ ...p, inicio: Date.parse(p.startsAt) }))
    .sort((a, b) => a.inicio - b.inicio)
    .map((p) =>
      el('li', { class: 'flex items-center gap-4 rounded-card bg-surface-1 p-4' }, [
        el('span', { class: 'w-16 shrink-0 font-mono text-sm', style: 'color: var(--fest-text)' }, clock(p.inicio)),
        el('div', { class: 'min-w-0' }, [
          el('p', { class: 'truncate text-sm font-medium' }, p.name),
          el('p', { class: 'text-xs text-ink-2' }, `${p.durationMin} min`),
        ]),
      ]),
    );

  const node = el('div', { class: 'px-4 py-8 md:px-8' }, [
    el('header', { class: 'mb-6 space-y-2' }, [
      el('h1', { class: 'font-display text-4xl tracking-wide md:text-5xl' }, 'Guia'),
      el('p', { class: 'text-sm text-ink-1' }, 'Programacion del canal propio. La grilla completa llega en la siguiente fase.'),
    ]),
    filas.length
      ? el('ul', { class: 'max-w-2xl space-y-2' }, filas)
      : el('p', { class: 'text-sm text-ink-2' }, 'Sin programacion cargada.'),
  ]);

  return createView(node, outlet);
}

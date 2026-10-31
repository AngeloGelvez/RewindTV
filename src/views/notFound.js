import { el } from '../core/dom.js';
import { createView } from './_view.js';

export default async function notFoundView({ outlet }) {
  const node = el('div', { class: 'grid min-h-[60dvh] place-content-center gap-4 px-6 text-center' }, [
    el('p', { class: 'font-display text-7xl', style: 'color: var(--fest)' }, '404'),
    el('h1', { class: 'text-xl font-semibold' }, 'Esta senal no existe'),
    el('p', { class: 'text-sm text-ink-1' }, 'La pagina que buscas no esta en la parrilla.'),
    el(
      'a',
      {
        href: '/',
        class: 'mx-auto rounded-pill bg-ink-0 px-5 py-2.5 text-sm font-semibold text-surface-0 transition hover:opacity-90',
      },
      'Volver al inicio',
    ),
  ]);
  return createView(node, outlet);
}

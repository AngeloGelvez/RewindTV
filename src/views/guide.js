/** Vista: guide. Esqueleto de la fase 1; el contenido llega en la fase 2. */
import { el } from '../core/dom.js';
import { createView } from './_view.js';

export default async function guideView({ outlet, params }) {
  const node = el('section', { class: 'mx-auto max-w-screen-2xl px-4 py-8' }, [
    el('h1', { class: 'font-display text-4xl' }, 'guide'),
    el('p', { class: 'mt-2 text-ink-1' }, 'Vista pendiente de implementar (fase 2).'),
  ]);
  return createView(node, outlet);
}

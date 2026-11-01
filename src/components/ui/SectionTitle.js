/**
 * Cabecera de seccion. Una barra de acento antes del rotulo marca el inicio
 * sin recurrir a separadores ni a subir el tamano de letra, y hereda el color
 * de la festividad por `--fest`.
 */
import { el } from '../../core/dom.js';

export function sectionTitle(texto, extra) {
  return el('div', { class: 'flex items-center gap-3' }, [
    el('span', { class: 'h-5 w-1 shrink-0 rounded-full', style: 'background: var(--fest)' }),
    el('h2', { class: 'text-[17px] font-semibold tracking-tight' }, texto),
    extra ? el('span', { class: 'ml-auto' }, extra) : null,
  ]);
}

/** Titulo de pagina (h1) con su bajada opcional. */
export function pageTitle(texto, bajada) {
  return el('header', { class: 'mb-6 space-y-2' }, [
    el('h1', { class: 'font-display text-4xl tracking-wide md:text-5xl' }, texto),
    bajada ? el('p', { class: 'max-w-2xl text-sm text-ink-1' }, bajada) : null,
  ]);
}

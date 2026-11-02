/**
 * Explorar: filtros + grilla virtualizada. Aqui es donde VirtualGrid gana:
 * con el catalogo completo solo existen en el DOM las filas visibles.
 */
import { el, delegate } from '../core/dom.js';
import { createView } from './_view.js';
import { navigate } from '../core/router.js';
import { bootstrap, query, getTitleById, allFestivities } from '../data/repository.js';
import VirtualGrid from '../components/media/VirtualGrid.js';

const ORDEN = [
  { key: 'year-desc', label: 'Mas nuevo' },
  { key: 'year-asc', label: 'Mas antiguo' },
  { key: 'score', label: 'Mejor valorado' },
  { key: 'name', label: 'A-Z' },
];

const TIPOS = [
  { key: null, label: 'Todo' },
  { key: 'serie', label: 'Series' },
  { key: 'pelicula', label: 'Peliculas' },
];

export default async function exploreView({ outlet }) {
  await bootstrap();

  const filtros = { kind: null, sort: 'year-desc' };

  const grid = VirtualGrid({
    items: query(filtros),
    minColumnWidth: 250,
    onSelect: (id) => {
      const t = getTitleById(id);
      if (t) navigate(`/titulo/${t.slug}`);
    },
  });

  const chip = (texto, grupo, valor, activo) =>
    el(
      'button',
      {
        type: 'button',
        class:
          'rounded-pill border border-surface-3 px-4 py-1.5 text-sm font-medium transition hover:border-[var(--fest-text)] hover:text-ink-0 ' +
          (activo ? 'bg-surface-2 text-ink-0 ring-fest' : 'text-ink-1'),
        dataset: { grupo, valor: valor ?? '' },
        'aria-pressed': String(Boolean(activo)),
      },
      texto,
    );

  const barraTipo = el('div', { class: 'flex flex-wrap gap-2', role: 'group', 'aria-label': 'Tipo' },
    TIPOS.map((t) => chip(t.label, 'kind', t.key, filtros.kind === t.key)));
  const barraOrden = el('div', { class: 'flex flex-wrap gap-2', role: 'group', 'aria-label': 'Ordenar' },
    ORDEN.map((o) => chip(o.label, 'sort', o.key, filtros.sort === o.key)));

  function refrescar() {
    for (const barra of [barraTipo, barraOrden]) {
      for (const boton of barra.children) {
        const activo = (boton.dataset.valor || null) === filtros[boton.dataset.grupo];
        boton.classList.toggle('bg-surface-2', activo);
        boton.classList.toggle('text-ink-0', activo);
        boton.classList.toggle('ring-fest', activo);
        boton.classList.toggle('text-ink-1', !activo);
        boton.setAttribute('aria-pressed', String(activo));
      }
    }
    grid.update({ items: query(filtros) });
  }

  const node = el('div', { class: 'px-4 py-7 md:px-6 md:py-9 lg:px-8' }, [
    el('header', { class: 'mb-5 space-y-4' }, [
      el('h1', { class: 'font-display text-3xl font-extrabold tracking-tight md:text-4xl' }, 'Explorar'),
      el('div', { class: 'flex flex-wrap items-center gap-x-6 gap-y-3' }, [barraTipo, barraOrden]),
    ]),
    el('div', { class: 'panel p-4 md:p-5' }, [grid.node]),
  ]);

  const quitar = delegate(node, '[data-grupo]', 'click', (_e, target) => {
    filtros[target.dataset.grupo] = target.dataset.valor || null;
    refrescar();
  });

  return createView(node, outlet, () => {
    quitar();
    grid.destroy();
  });
}

/**
 * Explorar: filtros + grilla virtualizada. Aqui es donde VirtualGrid gana:
 * con el catalogo completo solo existen en el DOM las filas visibles.
 */
import { el, delegate, clear } from '../core/dom.js';
import { createView } from './_view.js';
import { navigate } from '../core/router.js';
import { esTv } from '../core/tv.js';
import { observeIntersection } from '../patterns/observer.js';
import { sorteoDelDia } from '../utils/dia.js';
import { bootstrap, query, getTitleById, allFestivities } from '../data/repository.js';
import VirtualGrid from '../components/media/VirtualGrid.js';
import Carousel from '../components/media/Carousel.js';
import { renderCard, recycleCard } from '../components/media/TitleCard.js';

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

/**
 * En televisor la rejilla crece con la pagina, sin caja con scroll propio: a
 * 540 px de alto esa caja solo dejaba ver dos filas. Monta pocas tarjetas y pide
 * mas al acercarse el final, igual que En vivo.
 */
function rejillaTv({ items }) {
  const LOTE = 12;
  let lista = items;
  let mostrados = 0;
  let montadas = [];

  const rejilla = el('div', { class: 'grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4' });
  const centinela = el('div', { class: 'h-px w-full', 'aria-hidden': 'true' });
  const node = el('div', {}, [rejilla, centinela]);

  function mostrarMas() {
    const hasta = Math.min(mostrados + LOTE, lista.length);
    for (let i = mostrados; i < hasta; i++) {
      const tarjeta = renderCard(lista[i]);
      montadas.push(tarjeta);
      rejilla.appendChild(tarjeta);
    }
    mostrados = hasta;
    requestAnimationFrame(() => {
      if (mostrados < lista.length && centinela.getBoundingClientRect().top < innerHeight + 200) mostrarMas();
    });
  }

  function vaciar() {
    for (const tarjeta of montadas) recycleCard(tarjeta);
    montadas = [];
    clear(rejilla);
    mostrados = 0;
  }

  const dejarDeObservar = observeIntersection(
    centinela,
    (entry) => {
      if (entry.isIntersecting) mostrarMas();
    },
    { rootMargin: '200px' },
  );

  mostrarMas();

  return {
    node,
    update({ items: nuevos }) {
      lista = nuevos;
      vaciar();
      mostrarMas();
    },
    destroy() {
      dejarDeObservar();
      vaciar();
    },
  };
}

export default async function exploreView({ outlet }) {
  await bootstrap();

  const filtros = { kind: null, sort: 'year-desc' };

  const grid = (esTv() ? rejillaTv : VirtualGrid)({
    items: query(filtros),
    minColumnWidth: 250,
    onSelect: (id) => {
      const t = getTitleById(id);
      if (t) navigate(`/titulo/${t.slug}`);
    },
  });

  const recomendados = esTv()
    ? Carousel({
        title: 'Recomendados de hoy',
        items: sorteoDelDia(query({ sort: 'score' }).filter((t) => t.adFree).slice(0, 60)).slice(0, 12),
        itemWidth: 240,
        itemHeight: (ancho) => Math.round((ancho * 9) / 16) + 88,
        render: renderCard,
        recycle: recycleCard,
        onSelect: (id) => {
          const t = getTitleById(id);
          if (t) navigate(`/titulo/${t.slug}`);
        },
      })
    : null;

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
    recomendados?.node,
    esTv() ? el('h2', { class: 'pb-3 pt-6 text-[1.0625rem] font-bold tracking-tight' }, 'Mas series') : null,
    esTv() ? grid.node : el('div', { class: 'panel p-4 md:p-5' }, [grid.node]),
  ]);

  const quitar = delegate(node, '[data-grupo]', 'click', (_e, target) => {
    filtros[target.dataset.grupo] = target.dataset.valor || null;
    refrescar();
  });

  return createView(node, outlet, () => {
    quitar();
    grid.destroy();
    recomendados?.destroy?.();
  });
}

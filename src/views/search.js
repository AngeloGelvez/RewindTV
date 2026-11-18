/** Búsqueda bajo demanda en las tres colecciones del catálogo. */
import { el } from '../core/dom.js';
import { createView } from './_view.js';
import { esTv } from '../core/tv.js';
import { debounce } from '../utils/timing.js';
import { bootstrap, search, searchEpisodes, searchChannels, loadAllChannels } from '../data/repository.js';
import { renderCard, recycleCard } from '../components/media/TitleCard.js';
import { renderChannel, recycleChannel } from '../components/media/ChannelCard.js';
import { renderEpisode, recycleEpisode } from '../components/media/EpisodeCard.js';

const FILAS_TECLADO = ['1234567890', 'qwertyuiop', 'asdfghjklñ', 'zxcvbnm'];

function crearTeclado(input, alCambiar) {
  const cambiar = (valor) => {
    input.value = valor;
    alCambiar(valor);
  };
  const tecla = (texto, accion, extra = {}) =>
    el(
      'button',
      {
        type: 'button',
        class:
          'min-w-[2.75rem] rounded-lg border bg-surface-1 px-3 py-2 text-sm font-semibold text-ink-0 hairline',
        onClick: accion,
        ...extra,
      },
      texto,
    );

  return el('div', { class: 'space-y-1.5', role: 'group', 'aria-label': 'Teclado' }, [
    ...FILAS_TECLADO.map((fila, f) =>
      el(
        'div',
        { class: 'flex flex-wrap gap-1.5' },
        [...fila].map((letra, i) =>
          tecla(letra, () => cambiar(input.value + letra), f === 1 && i === 0 ? { 'data-autofocus': '' } : {}),
        ),
      ),
    ),
    el('div', { class: 'flex flex-wrap gap-1.5' }, [
      tecla('Espacio', () => cambiar(input.value + ' ')),
      tecla('Borrar', () => cambiar(input.value.slice(0, -1))),
      tecla('Limpiar', () => cambiar('')),
    ]),
  ]);
}

function episodio(ep) {
  return renderEpisode(ep, { title: ep.title, serie: ep.title.name, href: ep.href });
}

function seccion(label, buscar, render, recycle, pageSize) {
  let matches = [];
  let cards = [];
  const heading = el('h2', { class: 'text-lg font-bold' });
  const grid = el('div', { class: 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4' });
  const more = el('button', {
    type: 'button', class: 'rounded-pill border px-4 py-2 text-sm hairline',
    onClick: () => appendPage(true),
  }, 'Mostrar más');
  const node = el('section', { class: 'space-y-3', hidden: true }, [heading, grid, more]);

  function appendPage(focus) {
    const next = matches.slice(cards.length, cards.length + pageSize).map((item) => render(item));
    cards.push(...next);
    grid.append(...next);
    more.hidden = cards.length >= matches.length;
    if (focus) next[0]?.focus();
  }
  function clear() {
    grid.replaceChildren();
    if (recycle) cards.forEach(recycle);
    cards = [];
    matches = [];
    node.hidden = true;
  }
  return {
    node, label, buscar, clear,
    show(items) {
      matches = items;
      heading.textContent = `${label} (${items.length.toLocaleString('es')})`;
      node.hidden = !items.length;
      appendPage(false);
    },
  };
}

export default async function searchView({ outlet, query }) {
  await bootstrap();
  const tv = esTv();
  const pageSize = tv ? 8 : 12;
  const sections = [
    seccion('Series y películas', search, renderCard, recycleCard, pageSize),
    seccion('Episodios', searchEpisodes, episodio, recycleEpisode, pageSize),
    seccion('Canales en vivo', async (term) => {
      await loadAllChannels();
      return searchChannels(term);
    }, renderChannel, recycleChannel, pageSize),
  ];
  const estado = el('p', { class: 'text-sm text-ink-2', role: 'status' });
  const input = el('input', {
    type: 'search', value: query.q ?? '', readonly: tv, tabindex: tv ? '-1' : '0',
    'data-nav-skip': tv, placeholder: 'Serie, episodio, cadena o canal…',
    'aria-label': 'Buscar en el catálogo',
    class: 'w-full max-w-xl rounded-pill border bg-surface-1 px-5 py-3 text-ink-0 hairline focus:border-[var(--fest-text)]',
  });
  let version = 0;
  async function pintar(term, token) {
    if (token !== version) return;
    const url = new URL(location.href);
    if (term) url.searchParams.set('q', term);
    else url.searchParams.delete('q');
    history.replaceState(history.state, '', url);
    sections.forEach((s) => s.clear());
    retry.hidden = true;
    if (term.trim().length < 2) {
      estado.textContent = 'Escribe al menos dos caracteres.';
      return;
    }
    let total = 0;
    const fallos = [];
    estado.textContent = 'Buscando…';
    await Promise.all(sections.map(async (s) => {
      try {
        const rows = await s.buscar(term);
        if (token !== version) return;
        total += rows.length;
        s.show(rows);
      } catch {
        fallos.push(s.label.toLowerCase());
      }
    }));
    if (token !== version) return;
    let mensaje = total ? `${total.toLocaleString('es')} ${total === 1 ? 'resultado' : 'resultados'} para «${term}».` : '';
    if (fallos.length) mensaje += ` No se pudo completar la búsqueda en ${fallos.join(' y ')}.`;
    estado.textContent = mensaje.trim() || `Sin resultados para «${term}».`;
    retry.hidden = !fallos.length;
  }
  const despuesDeEscribir = debounce(pintar, 180);
  const alEscribir = () => despuesDeEscribir(input.value, ++version);
  input.addEventListener('input', alEscribir);
  const retry = el('button', { type: 'button', hidden: true,
    class: 'rounded-pill border px-3 py-1 text-sm hairline', onClick: () => pintar(input.value, ++version) }, 'Reintentar');
  const node = el('div', { class: 'space-y-8 px-4 py-7 md:px-6 lg:px-8' }, [
    el('header', { class: 'space-y-4' }, [
      el('h1', { class: 'font-display text-3xl font-extrabold md:text-4xl' }, 'Buscar'),
      input, tv ? crearTeclado(input, alEscribir) : null, estado, retry,
    ]),
    ...sections.map((s) => s.node),
  ]);
  const view = createView(node, outlet, () => {
    version++;
    despuesDeEscribir.cancel();
    input.removeEventListener('input', alEscribir);
    sections.forEach((s) => s.clear());
  });
  pintar(input.value, ++version);
  return view;
}

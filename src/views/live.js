/**
 * En vivo: chips por categoria + grilla de canales + reproductor.
 * El reproductor no se monta hasta que eliges canal, y aun entonces usa la
 * facade: hls.js solo se descarga al pulsar play.
 */
import { el, delegate, clear } from '../core/dom.js';
import { createView } from './_view.js';
import { write } from '../core/scheduler.js';
import { observeIntersection } from '../patterns/observer.js';
import {
  loadChannels, getChannels, getChannel, getChannelsByCategory, channelCategories,
} from '../data/repository.js';
import { renderChannel, recycleChannel } from '../components/media/ChannelCard.js';
import { Player } from '../components/media/Player.js';
import { createSource } from '../data/models/embed.js';

const LABEL = {
  musica: 'Musica',
  general: 'General',
  entretenimiento: 'Entretenimiento',
  deportes: 'Deportes',
};

export default async function liveView({ outlet, query }) {
  await loadChannels();

  const piezas = [];
  let player = null;

  const escenario = el('div', { class: 'mb-8' });

  /*
   * Rejilla que CRECE con el scroll de la pagina, no una caja con scroll
   * propio.
   *
   * Antes era una rejilla virtualizada con su contenedor de alto fijo y su
   * `overflow`. Rendia bien, pero metia una barra de scroll dentro de otra: la
   * rueda movia unas veces la pagina y otras la caja, y en movil el gesto se
   * peleaba con el del sistema.
   *
   * Ahora entran LOTE canales y los siguientes se añaden cuando el centinela
   * del final se acerca a la ventana. El coste de pintar lo acota la propia
   * tarjeta con `content-visibility` (ver .card-surface): lo que queda fuera de
   * la ventana no se pinta ni se mide, aunque este en el DOM.
   */
  const LOTE = 50;
  let lista = [];
  let mostrados = 0;
  let montadas = [];

  const grid = el('div', {
    class: 'grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4',
  });

  const contador = el('p', { class: 'pt-6 text-center text-sm text-ink-2' });
  // Va DEBAJO de la rejilla y se observa con margen: pide el lote siguiente
  // antes de que se llegue al final, no cuando ya se ve el hueco.
  const centinela = el('div', { class: 'h-px w-full', 'aria-hidden': 'true' });

  function mostrarMas() {
    if (mostrados >= lista.length) return;
    const hasta = Math.min(mostrados + LOTE, lista.length);
    const frag = document.createDocumentFragment();
    for (let i = mostrados; i < hasta; i++) {
      const node = renderChannel(lista[i]);
      node.classList.add('cursor-pointer');
      montadas.push(node);
      frag.appendChild(node);
    }
    mostrados = hasta;
    write(() => {
      grid.appendChild(frag);
      contador.textContent =
        mostrados < lista.length ? `${mostrados} de ${lista.length} canales` : '';
    });
  }

  let categoriaActiva = null;

  const chips = [null, ...channelCategories()].map((cat) =>
    el(
      'button',
      {
        type: 'button',
        class:
          'rounded-pill border border-surface-3 px-4 py-1.5 text-sm font-medium text-ink-1 transition hover:border-[var(--fest-text)] hover:text-ink-0',
        dataset: { cat: cat ?? '' },
      },
      cat ? LABEL[cat] ?? cat : `Todos (${getChannels().length})`,
    ),
  );

  function pintar(cat) {
    categoriaActiva = cat;
    for (const chip of chips) {
      const activo = (chip.dataset.cat || null) === cat;
      chip.classList.toggle('text-ink-0', activo);
      chip.classList.toggle('bg-surface-2', activo);
      chip.classList.toggle('ring-fest', activo);
      chip.setAttribute('aria-pressed', String(activo));
    }

    // Cambiar de categoria empieza de cero: se devuelven las tarjetas al pool
    // y vuelve a entrar el primer lote.
    lista = cat ? getChannelsByCategory(cat) : getChannels();
    mostrados = 0;
    write(() => {
      for (const node of montadas) recycleChannel(node);
      montadas = [];
      clear(grid);
      mostrarMas();
    });
  }

  function reproducir(id) {
    const canal = getChannel(id);
    if (!canal) return;

    player?.destroy();
    player = Player({
      // Por el registro y no a mano: asi la fuente sale con su `kind` ('hls'
      // para un .m3u8) y el Player sabe que tiene que cargar hls.js. Armarla a
      // mano dejaba ese campo vacio y el canal no arrancaba en Chrome.
      source: createSource(['mp4', canal.stream], `canal ${canal.id}`),
      poster: canal.logo,
      label: canal.name,
    });
    piezas.push(player);

    escenario.replaceChildren(
      el('div', { class: 'overflow-hidden rounded-card bg-surface-1' }, [
        player.node,
        el('div', { class: 'flex flex-wrap items-center gap-3 p-4' }, [
          el('img', { src: canal.logo, alt: '', class: 'size-10 rounded object-contain', decoding: 'async' }),
          el('div', { class: 'min-w-0' }, [
            el('h2', { class: 'truncate text-base font-semibold' }, canal.name),
            el(
              'p',
              { class: 'text-xs text-ink-2' },
              [canal.country?.toUpperCase(), canal.quality, canal.always ? 'Emite 24/7' : 'Emite por franjas']
                .filter(Boolean)
                .join(' · '),
            ),
          ]),
        ]),
      ]),
    );
    escenario.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const node = el('div', { class: 'px-4 py-7 md:px-6 md:py-9 lg:px-8' }, [
    el('header', { class: 'mb-6 space-y-2' }, [
      el('h1', { class: 'font-display text-3xl font-extrabold tracking-tight md:text-4xl' }, 'En vivo'),
      el(
        'p',
        { class: 'text-sm text-ink-1' },
        (() => {
          // Se dice cuantos no van ANTES de que nadie pulse uno: el aviso de
          // la tarjeta explica el caso, este explica el conjunto.
          const total = getChannels().length;
          const bloqueados = getChannels().filter((c) => c.webPlayable === false).length;
          const base = `${total} canales verificados. Los marcados "por franjas" no emiten las 24 horas.`;
          return bloqueados
            ? `${base} ${bloqueados} no se pueden reproducir desde el navegador: su servidor no lo autoriza.`
            : base;
        })(),
      ),
    ]),
    escenario,
    el('div', { class: 'mb-6 flex flex-wrap gap-2', role: 'group', 'aria-label': 'Filtrar por categoria' }, chips),
    grid,
    centinela,
    contador,
  ]);

  const quitarChips = delegate(node, '[data-cat]', 'click', (_e, target) => {
    pintar(target.dataset.cat || null);
  });

  const quitarGrid = delegate(grid, '[data-id]', 'click', (event, target) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    reproducir(target.dataset.id);
  });

  // 600 px de colchon: a velocidad de scroll normal el lote siguiente ya esta
  // montado cuando el final de la rejilla llegaria a verse.
  const dejarDeObservar = observeIntersection(
    centinela,
    (entry) => {
      if (entry.isIntersecting) mostrarMas();
    },
    { rootMargin: '600px' },
  );
  pintar(null);
  if (query.c) reproducir(query.c);

  return createView(node, outlet, () => {
    quitarChips();
    quitarGrid();
    dejarDeObservar();
    for (const n of montadas) recycleChannel(n);
    montadas = [];
    for (const p of piezas) p.destroy?.();
  });
}

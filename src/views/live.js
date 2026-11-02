/**
 * En vivo: chips por categoria + rejilla de canales + reproductor.
 * El reproductor no se monta hasta que eliges canal, y aun entonces usa la
 * facade: hls.js solo se descarga al pulsar play.
 *
 * La rejilla CRECE con el scroll de la pagina, sin caja con scroll propio, y
 * los datos tambien llegan por trozos: la lista son ~8.000 canales en ficheros
 * de ~1.000 por categoria, y solo se pide el siguiente cuando la rejilla se
 * queda sin canales que mostrar.
 */
import { el, delegate, clear } from '../core/dom.js';
import { createView } from './_view.js';
import { write } from '../core/scheduler.js';
import { observeIntersection } from '../patterns/observer.js';
import {
  loadChannelIndex, loadChannelChunk, loadChannelCategory, loadAllChannels, getChannel,
} from '../data/repository.js';
import { renderChannel, recycleChannel } from '../components/media/ChannelCard.js';
import { Player } from '../components/media/Player.js';
import { createSource } from '../data/models/embed.js';

const LOTE = 50;

export default async function liveView({ outlet, query }) {
  const catalogo = await loadChannelIndex();

  // Un enlace a un canal concreto necesita ese canal en memoria. Con la
  // categoria (`k`) se pide solo su trozo; sin ella —enlaces antiguos— no hay
  // mas remedio que cargarlo todo.
  if (query.c && !getChannel(query.c)) {
    if (query.k && catalogo.categorias.some((c) => c.slug === query.k)) await loadChannelCategory(query.k);
    else await loadAllChannels();
  }

  const piezas = [];
  let player = null;

  const escenario = el('div', { class: 'mb-8' });

  /*
   * Estado de la vista actual (una categoria o "Todos").
   *   trozos     los ficheros que la componen, en orden
   *   siguiente  indice del proximo trozo por pedir
   *   lista      canales ya cargados
   *   mostrados  cuantos de esos estan montados en la rejilla
   * `ronda` invalida las respuestas que llegan tarde: si se cambia de
   * categoria mientras un trozo viaja, su resultado ya no es de esta vista.
   */
  let trozos = [];
  let siguiente = 0;
  let lista = [];
  let mostrados = 0;
  let montadas = [];
  let ronda = 0;
  let cargando = false;
  let totalVista = 0;

  const grid = el('div', {
    class: 'grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4',
  });

  const contador = el('p', { class: 'pt-6 text-center text-sm text-ink-2' });
  // Va DEBAJO de la rejilla y se observa con margen: pide el lote siguiente
  // antes de que se llegue al final, no cuando ya se ve el hueco.
  const centinela = el('div', { class: 'h-px w-full', 'aria-hidden': 'true' });

  function actualizarContador() {
    contador.textContent =
      mostrados < totalVista ? `${mostrados} de ${totalVista} canales` : '';
  }

  async function mostrarMas() {
    if (cargando) return;
    const estaRonda = ronda;

    // Sin canales cargados que mostrar: toca pedir el trozo siguiente.
    if (mostrados >= lista.length) {
      if (siguiente >= trozos.length) return;
      cargando = true;
      try {
        const t = trozos[siguiente++];
        const canales = await loadChannelChunk(t.categoria, t.file);
        if (estaRonda !== ronda) return;
        lista = lista.concat(canales);
      } catch (err) {
        console.error('[en vivo] trozo', err);
        siguiente--; // se reintentara al volver a entrar el centinela
        return;
      } finally {
        cargando = false;
      }
    }

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
      if (estaRonda !== ronda) return;
      grid.appendChild(frag);
      actualizarContador();
      // El observador solo avisa cuando el centinela ENTRA: si tras añadir el
      // lote sigue dentro del margen —una pantalla alta, un televisor— no
      // volveria a avisar y la rejilla se quedaria corta.
      requestAnimationFrame(() => {
        if (centinela.getBoundingClientRect().top < innerHeight + 600) mostrarMas();
      });
    });
  }

  let categoriaActiva = null;

  const chip = (slug, texto) =>
    el(
      'button',
      {
        type: 'button',
        class:
          'rounded-pill border px-4 py-1.5 text-sm font-medium text-ink-1 transition hairline hover:border-[var(--fest-text)] hover:text-ink-0',
        dataset: { cat: slug ?? '' },
      },
      texto,
    );

  const chips = [
    chip(null, `Todos (${catalogo.total.toLocaleString('es')})`),
    ...catalogo.categorias.map((c) => chip(c.slug, `${c.label} (${c.count.toLocaleString('es')})`)),
  ];

  function pintar(cat) {
    categoriaActiva = cat;
    for (const c of chips) {
      const activo = (c.dataset.cat || null) === cat;
      c.classList.toggle('text-ink-0', activo);
      c.classList.toggle('bg-surface-2', activo);
      c.classList.toggle('ring-fest', activo);
      c.setAttribute('aria-pressed', String(activo));
    }

    // Cambiar de categoria empieza de cero: se invalida lo que viaja, se
    // devuelven las tarjetas al pool y el primer trozo vuelve a entrar.
    ronda++;
    cargando = false;
    const categorias = cat ? catalogo.categorias.filter((c) => c.slug === cat) : catalogo.categorias;
    trozos = categorias.flatMap((c) => c.trozos.map((t) => ({ ...t, categoria: c.slug })));
    totalVista = categorias.reduce((n, c) => n + c.count, 0);
    siguiente = 0;
    lista = [];
    mostrados = 0;

    write(() => {
      for (const node of montadas) recycleChannel(node);
      montadas = [];
      clear(grid);
      contador.textContent = '';
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
          canal.logo
            ? el('img', { src: canal.logo, alt: '', class: 'size-10 rounded object-contain', decoding: 'async' })
            : null,
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
        // Se dice cuantos no van ANTES de que nadie pulse uno: el aviso de la
        // tarjeta explica el caso, este explica el conjunto.
        catalogo.bloqueados
          ? `${catalogo.total.toLocaleString('es')} canales. ${catalogo.bloqueados.toLocaleString('es')} no se pueden reproducir desde el navegador: su servidor no lo autoriza.`
          : `${catalogo.total.toLocaleString('es')} canales.`,
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

  // Un enlace con categoria abre directamente esa pestana.
  pintar(query.k && catalogo.categorias.some((c) => c.slug === query.k) ? query.k : null);
  if (query.c) reproducir(query.c);

  return createView(node, outlet, () => {
    ronda++;
    quitarChips();
    quitarGrid();
    dejarDeObservar();
    for (const n of montadas) recycleChannel(n);
    montadas = [];
    for (const p of piezas) p.destroy?.();
  });
}

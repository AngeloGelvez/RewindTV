/**
 * En vivo: chips por categoria + grilla de canales + reproductor.
 * El reproductor no se monta hasta que eliges canal, y aun entonces usa la
 * facade: hls.js solo se descarga al pulsar play.
 */
import { el, delegate } from '../core/dom.js';
import { createView } from './_view.js';
import {
  loadChannels, getChannels, getChannel, getChannelsByCategory, channelCategories,
} from '../data/repository.js';
import { renderChannel, recycleChannel } from '../components/media/ChannelCard.js';
import VirtualGrid from '../components/media/VirtualGrid.js';
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
   * Rejilla virtualizada, no una grilla CSS con todo dentro.
   *
   * Con 50 canales daba igual; la lista pasa de 1.800 y pintar 1.800 tarjetas
   * de golpe son ~20.000 nodos en el DOM, que es exactamente lo que este
   * proyecto evita en el catalogo. El mismo componente del catalogo sirve
   * aqui: solo cambia la tarjeta y el alto de fila, que en un canal es fijo
   * (logo + dos lineas + chips) y no depende del ancho.
   */
  const grid = VirtualGrid({
    items: [],
    minColumnWidth: 270,
    render: renderChannel,
    recycle: recycleChannel,
    itemHeight: (_ancho, k) => 138 * k,
    onSelect: (id) => reproducir(id),
  });
  piezas.push(grid);

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

    grid.update({ items: cat ? getChannelsByCategory(cat) : getChannels() });
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

  const node = el('div', { class: 'px-4 py-8 md:px-8' }, [
    el('header', { class: 'mb-6 space-y-2' }, [
      el('h1', { class: 'font-display text-4xl tracking-wide md:text-5xl' }, 'En vivo'),
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
    grid.node,
  ]);

  const quitarChips = delegate(node, '[data-cat]', 'click', (_e, target) => {
    pintar(target.dataset.cat || null);
  });
  pintar(null);
  if (query.c) reproducir(query.c);

  return createView(node, outlet, () => {
    quitarChips();
    for (const p of piezas) p.destroy?.();
  });
}

/**
 * En vivo: chips por categoria + grilla de canales + reproductor.
 * El reproductor no se monta hasta que eliges canal, y aun entonces usa la
 * facade: hls.js solo se descarga al pulsar play.
 */
import { el, delegate, clear } from '../core/dom.js';
import { createView } from './_view.js';
import { write } from '../core/scheduler.js';
import {
  loadChannels, getChannels, getChannel, getChannelsByCategory, channelCategories,
} from '../data/repository.js';
import { renderChannel, recycleChannel } from '../components/media/ChannelCard.js';
import { Player } from '../components/media/Player.js';

const LABEL = {
  musica: 'Musica',
  general: 'General',
  entretenimiento: 'Entretenimiento',
  deportes: 'Deportes',
};

export default async function liveView({ outlet, query }) {
  await loadChannels();

  const piezas = [];
  let montadas = [];
  let player = null;

  const escenario = el('div', { class: 'mb-8' });
  const grid = el('div', {
    class: 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4',
  });

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

    const lista = cat ? getChannelsByCategory(cat) : getChannels();
    write(() => {
      for (const node of montadas) recycleChannel(node);
      montadas = [];
      clear(grid);
      const frag = document.createDocumentFragment();
      for (const canal of lista) {
        const node = renderChannel(canal);
        node.classList.add('cursor-pointer');
        montadas.push(node);
        frag.appendChild(node);
      }
      grid.appendChild(frag);
    });
  }

  function reproducir(id) {
    const canal = getChannel(id);
    if (!canal) return;

    player?.destroy();
    player = Player({
      source: { provider: 'mp4', id: canal.stream }, // HLS directo, sin iframe
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
        `${getChannels().length} canales verificados. Los marcados "por franjas" no emiten las 24 horas.`,
      ),
    ]),
    escenario,
    el('div', { class: 'mb-6 flex flex-wrap gap-2', role: 'group', 'aria-label': 'Filtrar por categoria' }, chips),
    grid,
  ]);

  const quitarChips = delegate(node, '[data-cat]', 'click', (_e, target) => {
    pintar(target.dataset.cat || null);
  });
  const quitarGrid = delegate(grid, '[data-id]', 'click', (event, target) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    reproducir(target.dataset.id);
  });

  pintar(null);
  if (query.c) reproducir(query.c);

  return createView(node, outlet, () => {
    quitarChips();
    quitarGrid();
    for (const node of montadas) recycleChannel(node);
    montadas = [];
    for (const p of piezas) p.destroy?.();
  });
}

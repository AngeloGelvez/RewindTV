/**
 * Ficha de serie: hero + tabs de temporada + fila de episodios.
 * Los capitulos NO vienen en el catalogo: se piden aqui con loadEpisodes().
 */
import { el, delegate, clear } from '../core/dom.js';
import { createView } from './_view.js';
import { write } from '../core/scheduler.js';
import { navigate } from '../core/router.js';
import { bootstrap, getTitleBySlug, loadEpisodes } from '../data/repository.js';
import { renderEpisode, recycleEpisode } from '../components/media/EpisodeCard.js';
import { icon } from '../components/ui/icons.js';
import { runtime } from '../utils/format.js';

export default async function detailView({ outlet, params }) {
  await bootstrap();
  const title = getTitleBySlug(params.id);

  if (!title) {
    const node = el('div', { class: 'px-8 py-20 text-center' }, [
      el('h1', { class: 'font-display text-4xl' }, 'No encontrado'),
      el('a', { href: '/', class: 'mt-4 inline-block text-sm text-[var(--fest)]' }, 'Volver al inicio'),
    ]);
    return createView(node, outlet);
  }

  let montados = [];
  const tabs = el('div', { class: 'flex flex-wrap gap-2' });
  const lista = el('div', { class: 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4' });

  const meta = [
    title.year,
    title.kind === 'serie' ? `${title.seasonCount ?? 1} temporada(s)` : runtime(title.runtime),
    title.rating,
    title.network?.name,
  ].filter(Boolean);

  const node = el('div', {}, [
    el('section', { class: 'relative isolate px-4 pb-8 pt-12 md:px-8 md:pt-16' }, [
      el('div', {
        class: 'absolute inset-0 -z-10',
        style:
          'background: radial-gradient(100% 80% at 10% 0%, var(--fest-soft), transparent 65%),' +
          'linear-gradient(to bottom, var(--color-surface-1), var(--color-surface-0))',
      }),
      el('div', { class: 'flex flex-col gap-6 md:flex-row md:items-end' }, [
        el('img', {
          src: title.poster,
          alt: '',
          class: 'w-36 shrink-0 rounded-card shadow-[var(--shadow-card)] md:w-48',
          decoding: 'async',
        }),
        el('div', { class: 'max-w-2xl space-y-3' }, [
          title.network
            ? el(
                'span',
                {
                  class: 'inline-block rounded-pill px-2.5 py-0.5 text-[11px] font-semibold text-white',
                  style: `background: ${title.network.color}`,
                },
                title.network.name,
              )
            : null,
          el('h1', { class: 'font-display text-5xl leading-none tracking-wide md:text-6xl' }, title.name),
          el('p', { class: 'text-xs uppercase tracking-wider text-ink-2' }, meta.join(' · ')),
          el('p', { class: 'text-sm text-ink-1' }, title.synopsis),
          el('div', { class: 'flex flex-wrap gap-2 pt-1' }, [
            ...title.genres.map((g) =>
              el('span', { class: 'rounded-pill bg-surface-2 px-3 py-1 text-xs text-ink-1' }, g.label),
            ),
          ]),
        ]),
      ]),
    ]),
    el('section', { class: 'space-y-5 px-4 pb-16 md:px-8' }, [
      el('div', { class: 'flex items-center gap-3' }, [
        el('h2', { class: 'text-lg font-semibold' }, 'Episodios'),
        el('span', { class: 'h-px flex-1 bg-surface-2' }),
      ]),
      tabs,
      lista,
    ]),
  ]);

  const view = createView(node, outlet, () => {
    quitarTabs();
    quitarLista();
    for (const n of montados) recycleEpisode(n);
    montados = [];
  });

  const temporadas = await loadEpisodes(title);

  function pintarTemporada(numero) {
    for (const tab of tabs.children) {
      const activo = Number(tab.dataset.season) === numero;
      tab.classList.toggle('text-ink-0', activo);
      tab.classList.toggle('bg-surface-2', activo);
      tab.classList.toggle('ring-fest', activo);
    }
    const episodios = temporadas.get(numero) ?? [];
    write(() => {
      for (const n of montados) recycleEpisode(n);
      montados = [];
      clear(lista);
      const frag = document.createDocumentFragment();
      for (const ep of episodios) {
        const n = renderEpisode(ep);
        n.classList.add('cursor-pointer');
        montados.push(n);
        frag.appendChild(n);
      }
      lista.appendChild(frag);
    });
  }

  write(() => {
    clear(tabs);
    for (const numero of [...temporadas.keys()].sort((a, b) => a - b)) {
      tabs.appendChild(
        el(
          'button',
          {
            type: 'button',
            class:
              'rounded-pill border border-surface-3 px-4 py-1.5 text-sm font-medium text-ink-1 transition hover:border-[var(--fest)] hover:text-ink-0',
            dataset: { season: String(numero) },
          },
          `Temporada ${numero}`,
        ),
      );
    }
    const primera = [...temporadas.keys()].sort((a, b) => a - b)[0];
    if (primera != null) pintarTemporada(primera);
  });

  const quitarTabs = delegate(tabs, '[data-season]', 'click', (_e, t) =>
    pintarTemporada(Number(t.dataset.season)),
  );
  const quitarLista = delegate(lista, '[data-id]', 'click', (_e, t) => {
    const [, temporada, numero] = t.dataset.id.split('-');
    navigate(`/ver/${title.slug}/t${temporada}/c${numero}`);
  });

  return view;
}

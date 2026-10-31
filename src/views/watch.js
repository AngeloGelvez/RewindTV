/**
 * Reproduccion de un capitulo: player + navegacion anterior/siguiente + la
 * lista de la temporada al lado, con el capitulo activo marcado.
 *
 * Al cambiar de capitulo NO se recarga la pagina (eso es lo que hace el sitio
 * de referencia): solo se reemplaza el player y se mueve la marca de activo.
 */
import { el, delegate, clear } from '../core/dom.js';
import { createView } from './_view.js';
import { write } from '../core/scheduler.js';
import { navigate } from '../core/router.js';
import { bootstrap, getTitleBySlug, loadEpisodes, getEpisode, nextEpisode } from '../data/repository.js';
import { Player } from '../components/media/Player.js';
import { icon } from '../components/ui/icons.js';

const num = (valor, porDefecto) => {
  const n = Number(String(valor ?? '').replace(/^[a-z]/i, ''));
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
};

export default async function watchView({ outlet, params }) {
  await bootstrap();
  const title = getTitleBySlug(params.id);
  if (!title) return navigate('/');

  const temporadas = await loadEpisodes(title);
  const season = num(params.season, [...temporadas.keys()][0] ?? 1);
  const number = num(params.episode, 1);
  const episode = getEpisode(title, season, number) ?? temporadas.get(season)?.[0];

  const piezas = [];
  const escenario = el('div', { class: 'space-y-4' });
  const listado = el('ul', { class: 'max-h-[520px] space-y-1 overflow-y-auto pr-1' });

  const anterior = () => {
    const actual = temporadas.get(episode.season) ?? [];
    const i = actual.findIndex((e) => e.number === episode.number);
    if (i > 0) return actual[i - 1];
    const previa = temporadas.get(episode.season - 1);
    return previa?.[previa.length - 1] ?? null;
  };

  const botonNav = (ep, texto, invertir) =>
    ep
      ? el(
          'a',
          {
            href: `/ver/${title.slug}/t${ep.season}/c${ep.number}`,
            class:
              'inline-flex items-center gap-2 rounded-pill bg-surface-2 px-4 py-2 text-sm font-medium text-ink-0 transition hover:bg-surface-3',
          },
          invertir ? [icon('chevron', 'size-4 rotate-180'), texto] : [texto, icon('chevron', 'size-4')],
        )
      : null;

  if (episode) {
    const player = Player({
      source: episode.source,
      poster: title.backdrop ?? title.poster,
      label: `${title.name} T${episode.season}E${episode.number}`,
    });
    piezas.push(player);

    escenario.replaceChildren(
      player.node,
      el('div', { class: 'space-y-3' }, [
        el('p', { class: 'text-xs font-semibold uppercase tracking-wider', style: 'color: var(--fest)' },
          `Temporada ${episode.season} · Episodio ${episode.number}`),
        el('h1', { class: 'text-2xl font-semibold leading-tight' }, episode.name),
        episode.synopsis ? el('p', { class: 'text-sm text-ink-1' }, episode.synopsis) : null,
        el('div', { class: 'flex flex-wrap gap-2 pt-1' }, [
          botonNav(anterior(), 'Anterior', true),
          botonNav(nextEpisode(title, episode), 'Siguiente', false),
          el(
            'a',
            {
              href: `/titulo/${title.slug}`,
              class: 'inline-flex items-center gap-2 rounded-pill border border-surface-3 px-4 py-2 text-sm text-ink-1 transition hover:text-ink-0',
            },
            'Ver ficha',
          ),
        ]),
      ]),
    );
  }

  write(() => {
    clear(listado);
    const frag = document.createDocumentFragment();
    for (const [numeroTemporada, episodios] of [...temporadas].sort((a, b) => a[0] - b[0])) {
      frag.appendChild(
        el('li', { class: 'px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-ink-2' },
          `Temporada ${numeroTemporada}`),
      );
      for (const ep of episodios) {
        const activo = episode && ep.id === episode.id;
        frag.appendChild(
          el('li', {}, [
            el(
              'a',
              {
                href: `/ver/${title.slug}/t${ep.season}/c${ep.number}`,
                class:
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-surface-2 ' +
                  (activo ? 'bg-surface-2 text-ink-0 ring-fest' : 'text-ink-1'),
              },
              [
                el('span', { class: 'w-7 shrink-0 text-xs text-ink-2' }, String(ep.number)),
                el('span', { class: 'line-clamp-1' }, ep.name),
              ],
            ),
          ]),
        );
      }
    }
    listado.appendChild(frag);
  });

  const node = el('div', { class: 'grid gap-8 px-4 py-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_320px]' }, [
    escenario,
    el('aside', { class: 'rounded-card bg-surface-1 p-3' }, [
      el('h2', { class: 'px-2 pb-2 text-sm font-semibold' }, title.name),
      listado,
    ]),
  ]);

  return createView(node, outlet, () => {
    for (const p of piezas) p.destroy?.();
  });
}

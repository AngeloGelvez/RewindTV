/**
 * Ficha de serie: hero + tabs de temporada + fila de episodios.
 * Los capitulos NO vienen en el catalogo: se piden aqui con loadEpisodes().
 */
import { el, delegate, clear } from '../core/dom.js';
import { createView } from './_view.js';
import { write } from '../core/scheduler.js';
import { bootstrap, getTitleBySlug, loadEpisodes } from '../data/repository.js';
import { renderEpisode, recycleEpisode } from '../components/media/EpisodeCard.js';
import { sectionTitle } from '../components/ui/SectionTitle.js';
import { runtime } from '../utils/format.js';
import { inkFor, shade } from '../core/theme.js';
import { initials } from '../components/ui/LazyImage.js';
import { withBase } from '../core/base.js';
import { MoviePlayer } from '../components/media/MoviePlayer.js';

export default async function detailView({ outlet, params }) {
  await bootstrap();
  const title = getTitleBySlug(params.id);

  if (!title) {
    const node = el('div', { class: 'px-8 py-20 text-center' }, [
      el('h1', { class: 'font-display text-4xl' }, 'No encontrado'),
      el('a', { href: '/', class: 'mt-4 inline-block text-sm text-[var(--fest-text)]' }, 'Volver al inicio'),
    ]);
    return createView(node, outlet);
  }

  const movie = title.id.startsWith('ps-') ? MoviePlayer({ title }) : null;
  let montados = [];
  const tabs = el('div', { class: 'flex flex-wrap gap-2', role: 'group', 'aria-label': 'Temporadas' });
  const lista = el('div', { class: 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4' });

  const cadena = title.network?.color ?? '#6e6e80';
  const portada = title.poster ?? title.backdrop;

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
        // Sin arte propio, la caratula es el color de la cadena con las
        // iniciales: un marcador generico repetido en 503 fichas no dice nada.
        el('div', {
          class: 'relative grid aspect-[2/3] w-32 shrink-0 self-start place-items-center overflow-hidden rounded-card shadow-[var(--shadow-card)] md:w-44',
          style: `background: linear-gradient(150deg, ${cadena}, ${shade(cadena, 0.7)})`,
          'aria-hidden': 'true',
        }, [
          el('span', { class: 'font-display text-4xl font-extrabold text-white/85' }, initials(title.name)),
          portada ? el('img', {
            src: portada, alt: '', decoding: 'async', class: `absolute inset-0 size-full ${movie ? 'object-contain' : 'object-cover'}`,
            onError: (event) => { event.target.hidden = true; },
          }) : null,
        ]),
        el('div', { class: 'min-w-0 flex-1 space-y-3' }, [
          title.network
            ? el(
                'span',
                {
                  class: 'inline-block rounded-pill px-2.5 py-0.5 text-[11px] font-semibold',
                  style: `background: ${title.network.color}; color: ${inkFor(title.network.color)}`,
                },
                title.network.name,
              )
            : null,
          el('h1', { class: 'font-display text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl' }, title.name),
          el('p', { class: 'text-xs uppercase tracking-wider text-ink-2' }, meta.join(' · ')),
          el('div', { class: 'flex flex-wrap gap-2 pt-1' }, [
            ...title.genres.map((g) =>
              el('span', { class: 'rounded-pill bg-surface-2 px-3 py-1 text-xs text-ink-1' }, g.label),
            ),
          ]),
        ]),
      ]),
    ]),
    el('section', { class: 'w-full space-y-5 px-4 pb-16 md:px-8' }, [
      movie?.node,
      title.synopsis ? el('p', { class: 'w-full text-base leading-relaxed text-ink-1' }, title.synopsis) : null,
      movie ? null : sectionTitle('Episodios'),
      movie ? null : tabs,
      movie ? null : lista,
      el('details', { class: 'text-xs text-ink-2' }, [
        el('summary', { class: 'cursor-pointer' }, 'Créditos de imágenes y metadatos'),
        el('div', { class: 'mt-3 space-y-2' }, [
          el('a', { href: 'https://www.themoviedb.org', target: '_blank', rel: 'noopener' }, [
            el('img', { src: withBase('/img/tmdb.svg'), alt: 'The Movie Database', width: '80', height: '12' }),
          ]),
          el('p', { lang: 'en' }, 'This product uses the TMDB API but is not endorsed or certified by TMDB.'),
          title.tmdbId ? el('a', { href: `https://www.themoviedb.org/tv/${title.tmdbId}`, target: '_blank',
            rel: 'noopener', class: 'block underline' }, 'Ficha en TMDB') : null,
          title.synopsisSource === 'lacartoons' ? el('a', {
            href: `https://www.lacartoons.com/serie/${title.id.slice(1)}`, target: '_blank',
            rel: 'noopener', class: 'block underline',
          }, 'Reseña de LACartoons') : null,
        ]),
      ]),
    ]),
  ]);

  if (movie) return createView(node, outlet, () => movie.destroy());

  const view = createView(node, outlet, () => {
    quitarTabs();
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
      tab.setAttribute('aria-pressed', String(activo));
    }
    const episodios = temporadas.get(numero) ?? [];
    write(() => {
      for (const n of montados) recycleEpisode(n);
      montados = [];
      clear(lista);
      const frag = document.createDocumentFragment();
      for (const ep of episodios) {
        // Enlace real: el router lo intercepta, y Enter o el mando lo activan.
        const n = renderEpisode(ep, {
          title,
          href: ep.href,
        });
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
              'rounded-pill border border-surface-3 px-4 py-1.5 text-sm font-medium text-ink-1 transition hover:border-[var(--fest-text)] hover:text-ink-0',
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

  return view;
}

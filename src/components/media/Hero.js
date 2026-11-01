/**
 * Hero de portada.
 *
 * Se tine con el color de la festividad escribiendo `--fest` en :root: el resto
 * de la UI (acentos, foco, anillos, seleccion) cambia sola sin que ningun otro
 * componente sepa que existen las festividades.
 *
 * Composicion: texto a la izquierda y arte a la derecha. Con el arte dentro del
 * flujo, el hero sigue teniendo cuerpo aunque el titulo no traiga backdrop;
 * apoyarlo todo en una imagen de fondo deja un bloque vacio cuando falta.
 */
import { el } from '../../core/dom.js';
import { defineComponent } from '../base/Component.js';
import { icon } from '../ui/icons.js';
import { hydrateImage, initials } from '../ui/LazyImage.js';
import { runtime } from '../../utils/format.js';

export function applyFestivityTheme(festivity) {
  document.documentElement.style.setProperty('--fest', festivity?.color ?? '#7c5cff');
}

function estrellas(score) {
  const llenas = Math.round(score / 2);
  const fila = el('span', { class: 'flex items-center gap-0.5' });
  for (let i = 0; i < 5; i++) {
    fila.appendChild(
      el('span', { class: i < llenas ? '' : 'opacity-25', style: 'color: var(--fest)' }, [icon('star', 'size-3.5')]),
    );
  }
  fila.appendChild(el('span', { class: 'pl-1 text-xs font-semibold text-ink-1' }, score.toFixed(1)));
  return fila;
}

export const Hero = defineComponent({
  setup({ festivity, title, upcoming }) {
    const fondo = el('div', { class: 'absolute inset-0 -z-10 overflow-hidden' }, [
      el('div', {
        class: 'absolute inset-0',
        style:
          'background:' +
          'radial-gradient(110% 80% at 15% 0%, var(--fest-soft), transparent 62%),' +
          'linear-gradient(to bottom, var(--color-surface-1), var(--color-surface-0))',
      }),
      // Rejilla muy sutil: da textura sin competir con el contenido.
      el('div', {
        class: 'absolute inset-0 opacity-[0.035]',
        style:
          'background-image: linear-gradient(var(--color-ink-0) 1px, transparent 1px),' +
          'linear-gradient(90deg, var(--color-ink-0) 1px, transparent 1px);' +
          'background-size: 56px 56px',
      }),
    ]);

    const etiqueta = festivity
      ? el(
          'span',
          {
            class:
              'inline-flex items-center gap-2 rounded-pill px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white',
            style: 'background: var(--fest)',
          },
          `${festivity.emoji} ${festivity.label}`,
        )
      : el(
          'span',
          { class: 'text-xs font-bold uppercase tracking-[0.12em]', style: 'color: var(--fest)' },
          'Destacado',
        );

    const meta = title
      ? el('div', { class: 'flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-1' }, [
          title.score ? estrellas(title.score) : null,
          el('span', { class: 'text-ink-2' }, String(title.year)),
          el(
            'span',
            { class: 'rounded border border-surface-3 px-1.5 py-0.5 text-[11px] text-ink-1' },
            title.rating,
          ),
          el(
            'span',
            { class: 'text-ink-2' },
            title.kind === 'serie' ? `${title.seasonCount ?? 1} temporada(s)` : runtime(title.runtime),
          ),
          title.network
            ? el(
                'span',
                {
                  class: 'rounded-pill px-2 py-0.5 text-[11px] font-semibold text-white',
                  style: `background: ${title.network.color}`,
                },
                title.network.name,
              )
            : null,
        ])
      : null;

    const acciones = title
      ? el('div', { class: 'flex flex-wrap items-center gap-3 pt-1' }, [
          el(
            'a',
            {
              href: `/ver/${title.slug}/t1/c1`,
              class:
                'inline-flex items-center gap-2 rounded-pill bg-ink-0 px-6 py-3 text-sm font-semibold text-surface-0 transition hover:opacity-90 active:scale-[0.98]',
            },
            [icon('play', 'size-4'), 'Reproducir'],
          ),
          el(
            'a',
            {
              href: `/titulo/${title.slug}`,
              class:
                'inline-flex items-center gap-2 rounded-pill border border-surface-3 bg-surface-1/60 px-6 py-3 text-sm font-medium text-ink-0 backdrop-blur transition hover:border-[var(--fest)]',
            },
            [icon('info', 'size-4'), 'Mas informacion'],
          ),
        ])
      : null;

    // Arte: poster con el backdrop difuminado detras, para dar profundidad.
    let arte = null;
    if (title) {
      const poster = el('img', {
        class: 'relative w-44 rounded-card shadow-[var(--shadow-pop)] md:w-56',
        alt: '',
        'aria-hidden': 'true',
        decoding: 'async',
      });
      poster.dataset.src = title.poster;
      hydrateImage(poster);

      arte = el('div', { class: 'relative hidden shrink-0 place-items-center sm:grid' }, [
        el('span', {
          class: 'absolute size-56 rounded-full blur-3xl md:size-72',
          style: 'background: var(--fest); opacity: .22',
        }),
        el('span', {
          class: 'absolute inset-0 grid place-items-center font-display text-5xl text-ink-2/40',
        }, initials(title.name)),
        poster,
      ]);
    }

    const node = el(
      'section',
      { class: 'relative isolate overflow-hidden px-4 py-12 md:px-8 md:py-16' },
      [
        fondo,
        el('div', { class: 'flex items-center gap-10' }, [
          el('div', { class: 'max-w-2xl space-y-4' }, [
            etiqueta,
            el(
              'h1',
              { class: 'font-display text-5xl leading-[0.95] tracking-wide md:text-7xl' },
              title?.name ?? 'RewindTv',
            ),
            meta,
            el(
              'p',
              { class: 'max-w-xl text-balance text-sm leading-relaxed text-ink-1 md:text-base' },
              festivity?.tagline ?? title?.synopsis ?? 'Lo mejor del catalogo, listo para ver.',
            ),
            acciones,
            !festivity && upcoming
              ? el(
                  'p',
                  { class: 'pt-2 text-xs text-ink-2' },
                  `Proxima temporada tematica: ${upcoming.festivity.emoji} ${upcoming.festivity.label}, en ${upcoming.days} dias`,
                )
              : null,
          ]),
          arte,
        ]),
      ],
    );

    return { node };
  },
});

export default Hero;

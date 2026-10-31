/**
 * Hero de portada. Se tine con el color de la festividad del dia escribiendo
 * la variable `--fest` en :root: el resto de la UI (acentos, foco, seleccion,
 * anillos) cambia sola sin que ningun otro componente sepa de festividades.
 */
import { el } from '../../core/dom.js';
import { defineComponent } from '../base/Component.js';
import { icon } from '../ui/icons.js';
import { hydrateImage } from '../ui/LazyImage.js';

export function applyFestivityTheme(festivity) {
  document.documentElement.style.setProperty('--fest', festivity?.color ?? '#7c5cff');
}

export const Hero = defineComponent({
  setup({ festivity, title, upcoming }) {
    const fondo = el('div', { class: 'absolute inset-0 -z-10 overflow-hidden' }, [
      el('div', {
        class: 'absolute inset-0',
        style:
          'background: radial-gradient(120% 90% at 20% 0%, var(--fest-soft), transparent 60%),' +
          'linear-gradient(to bottom, var(--color-surface-1), var(--color-surface-0))',
      }),
    ]);

    if (title?.backdrop) {
      const img = el('img', {
        class: 'absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-700 fade-bottom',
        alt: '',
        'aria-hidden': 'true',
        loading: 'eager',
        decoding: 'async',
      });
      img.dataset.src = title.backdrop;
      fondo.prepend(img);
      hydrateImage(img);
    }

    const etiqueta = festivity
      ? el(
          'span',
          {
            class:
              'inline-flex items-center gap-2 rounded-pill px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white',
            style: 'background: var(--fest)',
          },
          `${festivity.emoji} ${festivity.label}`,
        )
      : el('span', { class: 'text-xs font-semibold uppercase tracking-wider text-ink-2' }, 'Destacado');

    const encabezado = festivity
      ? festivity.tagline
      : (title?.synopsis ?? 'Lo mejor del catalogo, listo para ver.');

    const acciones = title
      ? el('div', { class: 'flex flex-wrap items-center gap-3 pt-2' }, [
          el(
            'a',
            {
              href: `/ver/${title.slug}/t1/c1`,
              class:
                'inline-flex items-center gap-2 rounded-pill bg-ink-0 px-5 py-2.5 text-sm font-semibold text-surface-0 transition hover:opacity-90',
            },
            [icon('play', 'size-4'), 'Reproducir'],
          ),
          el(
            'a',
            {
              href: `/titulo/${title.slug}`,
              class:
                'inline-flex items-center gap-2 rounded-pill border border-surface-3 bg-surface-1/70 px-5 py-2.5 text-sm font-medium text-ink-0 backdrop-blur transition hover:border-[var(--fest)]',
            },
            [icon('info', 'size-4'), 'Mas informacion'],
          ),
        ])
      : null;

    const proxima =
      !festivity && upcoming
        ? el(
            'p',
            { class: 'pt-3 text-xs text-ink-2' },
            `Proxima temporada tematica: ${upcoming.festivity.emoji} ${upcoming.festivity.label}, en ${upcoming.days} dias`,
          )
        : null;

    const node = el(
      'section',
      { class: 'relative isolate px-4 pb-10 pt-12 md:px-8 md:pb-16 md:pt-20' },
      [
        fondo,
        el('div', { class: 'max-w-2xl space-y-4' }, [
          etiqueta,
          el(
            'h1',
            { class: 'font-display text-5xl leading-none tracking-wide md:text-7xl' },
            title?.name ?? 'RewindTv',
          ),
          el('p', { class: 'text-balance text-sm text-ink-1 md:text-base' }, encabezado),
          acciones,
          proxima,
        ]),
      ],
    );

    return { node };
  },
});

export default Hero;

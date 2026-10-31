/**
 * Navegacion. Dos piezas que NUNCA se re-renderizan al cambiar de ruta:
 *   - rail vertical de iconos (escritorio) / barra inferior (movil)
 *   - topbar con marca y buscador
 * Al navegar solo se mueve la clase `activo`; el DOM se queda igual.
 */
import { el } from '../../core/dom.js';
import { subscribe } from '../../core/store.js';
import { defineComponent } from '../base/Component.js';
import { icon } from '../ui/icons.js';

const LINKS = [
  { href: '/', label: 'Inicio', route: 'home', ico: 'home' },
  { href: '/explorar', label: 'Explorar', route: 'explore', ico: 'grid' },
  { href: '/en-vivo', label: 'En vivo', route: 'live', ico: 'live' },
  { href: '/guia', label: 'Guia', route: 'guide', ico: 'guide' },
  { href: '/buscar', label: 'Buscar', route: 'search', ico: 'search' },
];

export const Rail = defineComponent({
  setup(_props, { onDispose }) {
    const items = LINKS.map((link) =>
      el(
        'a',
        {
          href: link.href,
          class:
            'group relative grid size-11 place-items-center rounded-xl text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-0',
          'aria-label': link.label,
          title: link.label,
        },
        [icon(link.ico)],
      ),
    );

    const node = el(
      'aside',
      {
        class:
          'fixed inset-x-0 bottom-0 z-50 flex h-16 items-center justify-around border-t border-surface-2 bg-surface-0/90 backdrop-blur ' +
          'md:inset-y-0 md:right-auto md:h-auto md:w-16 md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:py-5',
      },
      [
        el(
          'a',
          { href: '/', class: 'mb-4 hidden size-10 place-items-center rounded-xl bg-[var(--fest)] font-display text-xl text-white md:grid' },
          'R',
        ),
        ...items,
      ],
    );

    onDispose(
      subscribe('route', (route) => {
        for (let i = 0; i < items.length; i++) {
          const activo = LINKS[i].route === route.name;
          items[i].classList.toggle('text-ink-0', activo);
          items[i].classList.toggle('bg-surface-2', activo);
          items[i].classList.toggle('ring-fest', activo);
        }
      }),
    );

    return { node };
  },
});

export const Topbar = defineComponent({
  setup({ onSearch }, { onDispose }) {
    const input = el('input', {
      type: 'search',
      placeholder: 'Buscar series, pelis o canales...',
      class:
        'w-full bg-transparent py-2 pl-10 pr-3 text-sm text-ink-0 placeholder:text-ink-2 focus:outline-none',
      'aria-label': 'Buscar',
    });

    const buscador = el(
      'form',
      {
        class:
          'relative flex-1 max-w-md rounded-pill border border-surface-3 bg-surface-1 transition-colors focus-within:border-[var(--fest)]',
        onSubmit: (event) => {
          event.preventDefault();
          onSearch?.(input.value);
        },
      },
      [
        el('span', { class: 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2' }, [
          icon('search', 'size-4'),
        ]),
        input,
      ],
    );

    const marca = el('a', { href: '/', class: 'font-display text-3xl tracking-wide md:hidden' }, [
      el('span', { class: 'text-ink-0' }, 'Rewind'),
      el('span', { style: 'color: var(--fest)' }, 'Tv'),
    ]);

    const node = el(
      'header',
      { class: 'sticky top-0 z-40 border-b border-surface-2/70 glass' },
      [el('div', { class: 'flex h-16 items-center gap-4 px-4 md:px-8' }, [marca, buscador])],
    );

    onDispose(() => input.blur());
    return { node, focus: () => input.focus(), setValue: (v) => { input.value = v; } };
  },
});

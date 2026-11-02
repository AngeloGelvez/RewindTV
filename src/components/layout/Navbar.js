/**
 * Navegacion. Dos piezas que NUNCA se re-renderizan al cambiar de ruta:
 *   - topbar: marca, enlaces, buscador y acciones (escritorio)
 *   - barra inferior de iconos (movil) y rail lateral en modo TV
 * Al navegar solo se mueve la clase `activo` (y aria-current); el DOM se
 * queda igual.
 *
 * Por que el menu esta ARRIBA y no en un rail lateral: los enlaces llevan
 * texto. Un rail de 64 px solo admite iconos, y un icono sin rotulo obliga a
 * adivinar. En movil el texto no cabe, asi que ahi si manda el icono y la
 * barra baja al pulgar.
 */
import { el } from '../../core/dom.js';
import { subscribe } from '../../core/store.js';
import { defineComponent } from '../base/Component.js';
import { icon } from '../ui/icons.js';
import { logo } from '../ui/Logo.js';
import { getMode, toggleMode } from '../../core/theme.js';

const LINKS = [
  { href: '/', label: 'Inicio', route: 'home', ico: 'home' },
  { href: '/explorar', label: 'Explorar', route: 'explore', ico: 'grid' },
  { href: '/en-vivo', label: 'En vivo', route: 'live', ico: 'live' },
  { href: '/guia', label: 'Guia', route: 'guide', ico: 'guide' },
  { href: '/buscar', label: 'Buscar', route: 'search', ico: 'search' },
];

/** Barra inferior en movil; en modo TV se convierte en rail lateral. */
export const Rail = defineComponent({
  setup(_props, { onDispose }) {
    const items = LINKS.map((link) =>
      el(
        'a',
        {
          href: link.href,
          class:
            'group relative flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-2 transition-colors hover:text-ink-0',
          'aria-label': link.label,
        },
        [icon(link.ico, 'size-[22px]'), el('span', { class: 'leading-none' }, link.label)],
      ),
    );

    const node = el(
      'nav',
      {
        'aria-label': 'Principal',
        'data-rail': '',
        class:
          'fixed inset-x-0 bottom-0 z-50 flex h-[4.25rem] items-stretch border-t glass pb-[env(safe-area-inset-bottom)] hairline lg:hidden',
      },
      [
        // Solo se ve en television, donde el rail sustituye a la barra de
        // arriba y hace falta algo que diga de quien es la pantalla. Va con su
        // nombre escrito: el CSS del modo TV lo esconde mientras el rail esta
        // plegado y lo enseña al desplegarse, igual que los rotulos.
        el('span', { 'data-rail-logo': '', class: 'hidden' }, [logo({ size: 'size-10' })]),
        ...items,
      ],
    );

    onDispose(
      subscribe('route', (route) => {
        for (let i = 0; i < items.length; i++) {
          const activo = LINKS[i].route === route.name;
          items[i].classList.toggle('text-ink-0', activo);
          items[i].style.color = activo ? 'var(--fest-text)' : '';
          if (activo) items[i].setAttribute('aria-current', 'page');
          else items[i].removeAttribute('aria-current');
        }
      }),
    );

    return { node };
  },
});

/** Boton claro/oscuro. Los dos iconos viven montados y solo se alterna cual se ve. */
function modeToggle() {
  const sol = icon('sun', 'size-[18px]');
  const luna = icon('moon', 'size-[18px]');

  const pintar = (mode) => {
    const claro = mode === 'light';
    sol.style.display = claro ? 'none' : '';
    luna.style.display = claro ? '' : 'none';
    boton.setAttribute('aria-label', claro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
    boton.setAttribute('title', claro ? 'Tema oscuro' : 'Tema claro');
  };

  const boton = el(
    'button',
    {
      type: 'button',
      class:
        'grid size-10 shrink-0 place-items-center rounded-pill border text-ink-1 transition hairline hover:border-[var(--fest-text)] hover:text-ink-0',
      onClick: () => pintar(toggleMode()),
    },
    [sol, luna],
  );

  pintar(getMode());
  return boton;
}

export const Topbar = defineComponent({
  setup({ onSearch }, { onDispose }) {
    const input = el('input', {
      type: 'search',
      placeholder: 'Buscar series, pelis o canales...',
      class:
        'w-full bg-transparent py-2.5 pl-10 pr-3 text-sm text-ink-0 placeholder:text-ink-2 focus:outline-none',
      'aria-label': 'Buscar series, pelis o canales',
      enterkeyhint: 'search',
    });

    const buscador = el(
      'form',
      {
        role: 'search',
        class:
          'relative w-full max-w-[26rem] rounded-pill border bg-surface-2/70 transition-colors hairline focus-within:border-[var(--fest-text)]',
        onSubmit: (event) => {
          event.preventDefault();
          onSearch?.(input.value);
        },
      },
      [
        el('span', { class: 'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2' }, [
          icon('search', 'size-[18px]'),
        ]),
        input,
      ],
    );

    // Enlaces con rotulo: solo en escritorio, donde hay sitio para leerlos.
    // Con rotulo y desde 1024. Por debajo manda la barra inferior, que en una
    // tablet tactil se alcanza mejor que una fila de enlaces arriba.
    const enlaces = LINKS.slice(0, 4).map((link) =>
      el(
        'a',
        {
          href: link.href,
          class:
            'rounded-pill px-3.5 py-2 text-sm font-medium text-ink-1 transition-colors hover:bg-surface-2 hover:text-ink-0',
        },
        link.label,
      ),
    );

    const node = el(
      'header',
      { class: 'sticky top-0 z-40 border-b glass hairline' },
      [
        el('div', { class: 'mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 md:h-[4.5rem] md:gap-5 md:px-6 lg:px-8' }, [
          logo({ size: 'size-9' }),
          el('nav', { 'aria-label': 'Secciones', class: 'hidden items-center gap-1 lg:flex' }, enlaces),
          // El buscador se come el espacio sobrante y queda centrado.
          el('div', { class: 'ml-auto flex min-w-0 flex-1 justify-end md:justify-center' }, [buscador]),
          el('div', { class: 'flex shrink-0 items-center gap-2' }, [
            modeToggle(),
            el(
              'a',
              {
                href: '/en-vivo',
                class:
                  'hidden items-center gap-2 rounded-pill bg-live px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] sm:inline-flex',
              },
              [
                el('span', { class: 'size-1.5 animate-pulse rounded-full bg-white', 'aria-hidden': 'true' }),
                'En vivo',
              ],
            ),
          ]),
        ]),
      ],
    );

    onDispose(
      subscribe('route', (route) => {
        for (let i = 0; i < enlaces.length; i++) {
          const activo = LINKS[i].route === route.name;
          enlaces[i].classList.toggle('bg-surface-2', activo);
          enlaces[i].classList.toggle('text-ink-0', activo);
          if (activo) enlaces[i].setAttribute('aria-current', 'page');
          else enlaces[i].removeAttribute('aria-current');
        }
      }),
    );

    onDispose(() => input.blur());
    return { node, focus: () => input.focus(), setValue: (v) => { input.value = v; } };
  },
});

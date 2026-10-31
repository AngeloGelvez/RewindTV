import { el } from '../../core/dom.js';
import { subscribe } from '../../core/store.js';
import { defineComponent } from '../base/Component.js';

const LINKS = [
  { href: '/', label: 'Inicio', route: 'home' },
  { href: '/explorar', label: 'Explorar', route: 'explore' },
  { href: '/en-vivo', label: 'En vivo', route: 'live' },
  { href: '/guia', label: 'Guia', route: 'guide' },
  { href: '/buscar', label: 'Buscar', route: 'search' },
];

export const Navbar = defineComponent({
  setup(_props, { onDispose }) {
    const anchors = LINKS.map((link) =>
      el('a', { href: link.href, class: 'px-3 py-2 text-sm text-ink-1 hover:text-ink-0' }, link.label),
    );

    const node = el(
      'header',
      { class: 'sticky top-0 z-40 border-b border-surface-2 bg-surface-0/85 backdrop-blur' },
      [
        el('nav', { class: 'mx-auto flex max-w-screen-2xl items-center gap-2 px-4 h-14' }, [
          el('a', { href: '/', class: 'font-display text-2xl tracking-wide text-accent mr-4' }, 'RewindTv'),
          ...anchors,
        ]),
      ],
    );

    // Solo el estado activo cambia: no se vuelve a construir la navbar.
    onDispose(
      subscribe('route', (route) => {
        for (let i = 0; i < anchors.length; i++) {
          anchors[i].classList.toggle('text-ink-0', LINKS[i].route === route.name);
        }
      }),
    );

    return { node };
  },
});

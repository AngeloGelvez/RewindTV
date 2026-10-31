/**
 * Carrusel horizontal virtualizado.
 *
 * Mismo principio que VirtualGrid pero en un eje: solo existen en el DOM las
 * tarjetas visibles mas un colchon, y las que salen vuelven al pool. Una fila
 * de 200 titulos mantiene ~12 nodos vivos.
 *
 * El scroll es NATIVO (clase .rail con scroll-snap). No animamos transform a
 * mano: el navegador mueve el contenido en el compositor, sin tocar el hilo
 * principal, y en movil el gesto se siente como el del sistema.
 */
import { el, delegate } from '../../core/dom.js';
import { read, write } from '../../core/scheduler.js';
import { observeResize } from '../../patterns/observer.js';
import { defineComponent } from '../base/Component.js';
import { icon } from '../ui/icons.js';

const BUFFER = 3;

export const Carousel = defineComponent({
  setup(
    { title, items = [], itemWidth = 170, itemHeight, gap = 12, render, recycle, onSelect, href },
    { onDispose },
  ) {
    const track = el('div', { class: 'relative' });
    const rail = el('div', { class: 'rail px-4 md:px-8 py-1' }, track);

    let data = items;
    const mounted = new Map();
    const step = itemWidth + gap;
    let alto = itemHeight ?? 0;

    function reflow(force) {
      read(() => {
        const scrollLeft = rail.scrollLeft;
        const width = rail.clientWidth;
        const from = Math.max(0, Math.floor(scrollLeft / step) - BUFFER);
        const to = Math.min(data.length - 1, Math.ceil((scrollLeft + width) / step) + BUFFER);

        write(() => {
          track.style.width = `${data.length * step - gap}px`;
          // El track define el alto de la fila: las tarjetas van en absoluto y
          // no lo empujan. Si no se declara, se mide la primera y se fija.
          if (alto) track.style.height = `${alto}px`;

          for (const [i, node] of mounted) {
            if (i < from || i > to || force) {
              node.remove();
              recycle(node);
              mounted.delete(i);
            }
          }

          const frag = document.createDocumentFragment();
          for (let i = from; i <= to; i++) {
            if (mounted.has(i)) continue;
            const node = render(data[i]);
            node.classList.add('v-item');
            node.style.top = '0';
            node.style.left = `${i * step}px`;
            node.style.width = `${itemWidth}px`;
            mounted.set(i, node);
            frag.appendChild(node);
          }
          if (frag.childNodes.length) track.appendChild(frag);

          // Medida unica: si no nos dieron alto, lo tomamos de la primera
          // tarjeta montada y lo fijamos para siempre.
          if (!alto && mounted.size) {
            const primera = mounted.values().next().value;
            const medido = primera.offsetHeight;
            if (medido) {
              alto = medido;
              track.style.height = `${alto}px`;
            }
          }
        });
      });
    }

    function scrollBy(dir) {
      rail.scrollBy({ left: dir * Math.floor(rail.clientWidth * 0.8), behavior: 'smooth' });
    }

    const flecha = (dir, nombre) =>
      el(
        'button',
        {
          type: 'button',
          class:
            'hidden size-9 place-items-center rounded-full bg-surface-2 text-ink-1 transition hover:bg-surface-3 hover:text-ink-0 md:grid',
          'aria-label': nombre,
          onClick: () => scrollBy(dir),
        },
        [icon('chevron', dir < 0 ? 'size-4 rotate-180' : 'size-4')],
      );

    const cabecera = el('div', { class: 'flex items-center gap-3 px-4 md:px-8' }, [
      href
        ? el('a', { href, class: 'group flex items-center gap-1.5' }, [
            el('h2', { class: 'text-lg font-semibold tracking-tight' }, title),
            el('span', { class: 'text-ink-2 transition group-hover:translate-x-0.5 group-hover:text-[var(--fest)]' }, [
              icon('chevron', 'size-4'),
            ]),
          ])
        : el('h2', { class: 'text-lg font-semibold tracking-tight' }, title),
      el('div', { class: 'ml-auto flex gap-2' }, [flecha(-1, 'Anterior'), flecha(1, 'Siguiente')]),
    ]);

    const node = el('section', { class: 'space-y-3' }, [cabecera, rail]);

    const onScroll = () => reflow(false);
    rail.addEventListener('scroll', onScroll, { passive: true });
    onDispose(() => rail.removeEventListener('scroll', onScroll));
    onDispose(observeResize(rail, () => reflow(false)));
    onDispose(
      delegate(rail, '[data-id]', 'click', (event, target) => {
        if (!onSelect) return;
        event.preventDefault();
        onSelect(target.dataset.id);
      }),
    );
    onDispose(() => {
      for (const n of mounted.values()) recycle(n);
      mounted.clear();
    });

    reflow(true);

    return {
      node,
      update(next) {
        data = next;
        rail.scrollLeft = 0;
        reflow(true);
      },
    };
  },
});

export default Carousel;

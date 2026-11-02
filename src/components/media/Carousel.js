/**
 * Carrusel horizontal virtualizado.
 *
 * Mismo principio que VirtualGrid pero en un eje: solo existen en el DOM las
 * tarjetas visibles mas un colchon, y las que salen vuelven al pool. Una fila
 * de 200 titulos mantiene ~12 nodos vivos.
 *
 * Las medidas (itemWidth, itemHeight, gap) se dan en px a 16 px de fuente
 * base y se escalan con la fuente raiz: en modo TV todo crece en rem y las
 * tarjetas tienen que crecer con su texto, o el texto se sale de la tarjeta.
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
import { remScale } from '../../core/tv.js';

const BUFFER = 3;
let uid = 0;

export const Carousel = defineComponent({
  setup(
    {
      title,
      items = [],
      itemWidth: baseWidth = 170,
      itemHeight: baseHeight,
      gap: baseGap = 12,
      render,
      recycle,
      onSelect,
      href,
      boxed = true,
      action,
    },
    { onDispose },
  ) {
    // Medidas escaladas. Se recalculan en cada lectura y no solo al montar:
    // al arrancar, el CSS de modo TV puede no estar aplicado todavia, y en TV
    // la fuente depende del ancho de la ventana.
    let k = 0;
    let ancho = 0;
    let itemWidth = 0;
    let gap = baseGap;
    let step = baseGap;
    let alto = 0;

    /**
     * `itemWidth` puede ser un numero o una funcion del ancho disponible: asi
     * una fila ensena 1,5 tarjetas en un movil y 6 en un escritorio con el
     * mismo componente, sin media queries repartidas por los estilos.
     *
     * Devuelve true si algo cambio (y hay que recolocar todo).
     */
    function escalar(disponible) {
      const next = remScale();
      const base = typeof baseWidth === 'function' ? baseWidth(disponible) : baseWidth;
      if (next === k && base === ancho) return false;
      k = next;
      ancho = base;
      itemWidth = Math.round(base * k);
      gap = Math.round(baseGap * k);
      step = itemWidth + gap;
      alto = baseHeight
        ? Math.round((typeof baseHeight === 'function' ? baseHeight(base) : baseHeight) * k)
        : 0;
      return true;
    }

    const track = el('div', { class: 'relative' });
    // El carril desborda el relleno del panel a los lados: las tarjetas llegan
    // al borde al deslizar, pero en reposo respetan el margen de la seccion.
    const rail = el('div', { class: 'rail -mx-4 px-4 py-1 md:-mx-5 md:px-5' }, track);

    let data = items;
    const mounted = new Map();

    function reflow(forced) {
      read(() => {
        const width = rail.clientWidth;
        const force = escalar(width) || forced;
        const scrollLeft = rail.scrollLeft;
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

    /**
     * Flechas de paginacion. Son `aria-hidden` y fuera del orden de Tab a
     * proposito: no aportan ningun destino nuevo — el carril ya se recorre con
     * teclado, rueda o gesto — y colarlas entre tarjeta y tarjeta obligaria a
     * pasar por ellas en cada fila.
     */
    const flecha = (dir, nombre) =>
      el(
        'button',
        {
          type: 'button',
          class:
            'hidden size-9 place-items-center rounded-full border text-ink-1 transition hairline ' +
            'hover:border-[var(--fest-text)] hover:text-ink-0 active:scale-95 md:grid',
          'aria-label': nombre,
          tabindex: '-1',
          'aria-hidden': 'true',
          'data-nav-skip': '',
          onClick: () => scrollBy(dir),
        },
        [icon('chevron', dir < 0 ? 'size-4 rotate-180' : 'size-4')],
      );

    const headingId = `rail-${++uid}`;
    const rotulo = el(
      'h2',
      { id: headingId, class: 'truncate text-[1.0625rem] font-bold tracking-tight md:text-[1.15rem]' },
      title,
    );

    const cabecera = el('div', { class: 'flex items-center gap-3 pb-3.5' }, [
      href
        ? el('a', { href, class: 'group flex min-w-0 items-center gap-1' }, [
            rotulo,
            el(
              'span',
              {
                class: 'shrink-0 text-ink-2 transition group-hover:translate-x-0.5 group-hover:text-[var(--fest-text)]',
                'aria-hidden': 'true',
              },
              [icon('chevron', 'size-4')],
            ),
          ])
        : rotulo,
      el('div', { class: 'ml-auto flex shrink-0 items-center gap-2' }, [
        action ?? null,
        flecha(-1, 'Anterior'),
        flecha(1, 'Siguiente'),
      ]),
    ]);

    // `boxed`: la fila vive dentro de un panel redondeado. Es lo que da el
    // ritmo de la portada; sin el, las filas flotan sueltas sobre el fondo.
    const node = el(
      'section',
      {
        class: boxed ? 'panel p-4 md:p-5' : '',
        'aria-labelledby': headingId,
      },
      [cabecera, rail],
    );

    const onScroll = () => reflow(false);
    rail.addEventListener('scroll', onScroll, { passive: true });
    onDispose(() => rail.removeEventListener('scroll', onScroll));
    onDispose(observeResize(rail, () => reflow(false)));
    onDispose(
      delegate(rail, '[data-id]', 'click', (event, target) => {
        if (!onSelect || event.ctrlKey || event.metaKey || event.shiftKey) return;
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

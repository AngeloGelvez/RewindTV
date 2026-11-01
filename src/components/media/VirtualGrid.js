/**
 * VIRTUAL GRID (windowing)
 * ========================
 * Renderiza solo las filas visibles mas un colchon. Con 5.000 titulos el DOM
 * mantiene ~40 nodos, y los que salen vuelven al pool de TitleCard.
 *
 * Cooperaciones:
 *  - scheduler.read/write  -> medir y pintar en fases separadas
 *  - observeResize         -> recalcular columnas sin escuchar window.resize
 *  - delegate              -> un listener de click para toda la grilla
 */
import { el, delegate } from '../../core/dom.js';
import { read, write } from '../../core/scheduler.js';
import { observeResize } from '../../patterns/observer.js';
import { defineComponent } from '../base/Component.js';
import { renderCard, recycleCard, fillCard } from './TitleCard.js';
import { remScale } from '../../core/tv.js';

/**
 * El alto de fila NO es una constante: la tarjeta es apaisada (16:9) y su alto
 * depende del ancho que le toque a cada columna. Se recalcula al medir.
 *   alto = ancho * 9/16 (miniatura) + texto (titulo de dos lineas + autor)
 */
const TEXTO = 92; // px a 16 px de fuente base
const HUECO = 14; // separacion entre tarjetas
const BUFFER_ROWS = 2;

export const VirtualGrid = defineComponent({
  setup({ items = [], minColumnWidth: baseColumn = 180, onSelect }, { onDispose }) {
    // En modo TV la fuente raiz crece y las tarjetas con ella (ver Carousel).
    // Se recalcula en measure(), no solo al montar.
    let k = 0;
    let ROW_HEIGHT = 300;
    let hueco = HUECO;
    let minColumnWidth = baseColumn;
    const sizer = el('div', { class: 'relative w-full' });
    const scroller = el('div', { class: 'v-scroller h-[calc(100dvh-7rem)]' }, sizer);

    let columns = 1;
    let data = items;
    const mounted = new Map(); // index -> node

    function measure() {
      read(() => {
        const escala = remScale();
        const cambio = escala !== k;
        if (cambio) {
          k = escala;
          hueco = Math.round(HUECO * k);
          minColumnWidth = Math.round(baseColumn * k);
        }
        const width = scroller.clientWidth;
        const next = Math.max(1, Math.floor(width / minColumnWidth));
        // El alto sale del ancho real de columna, no de una constante: si no,
        // al estrechar la ventana las tarjetas se solapan con la fila de abajo.
        const alto = Math.round(((width / next - hueco) * 9) / 16 + TEXTO * k + hueco);
        const cambioAlto = alto !== ROW_HEIGHT;
        ROW_HEIGHT = alto;
        if (next !== columns || cambio || cambioAlto) {
          columns = next;
          reflow(true);
        } else {
          reflow(false);
        }
      });
    }

    function reflow(force) {
      const rows = Math.ceil(data.length / columns);
      const scrollTop = scroller.scrollTop;
      const viewport = scroller.clientHeight;

      const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
      const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + BUFFER_ROWS);

      const from = firstRow * columns;
      const to = Math.min(data.length - 1, lastRow * columns + columns - 1);

      write(() => {
        sizer.style.height = `${rows * ROW_HEIGHT}px`;

        // 1. Reciclar lo que quedo fuera de la ventana.
        for (const [index, node] of mounted) {
          if (index < from || index > to || force) {
            node.remove();
            recycleCard(node);
            mounted.delete(index);
          }
        }

        // 2. Montar lo que entro, reusando nodos del pool.
        const frag = document.createDocumentFragment();
        const cellWidth = 100 / columns;
        for (let index = from; index <= to; index++) {
          if (mounted.has(index)) continue;
          const node = renderCard(data[index]);
          node.classList.add('v-item');
          node.style.top = `${Math.floor(index / columns) * ROW_HEIGHT}px`;
          node.style.left = `${(index % columns) * cellWidth}%`;
          node.style.width = `${cellWidth}%`;
          node.style.right = 'auto';
          // La separacion va DENTRO de la celda (box-sizing: border-box), asi
          // las columnas siguen midiendo un porcentaje exacto del ancho.
          node.style.paddingRight = `${hueco}px`;
          mounted.set(index, node);
          frag.appendChild(node);
        }
        if (frag.childNodes.length) sizer.appendChild(frag);
      });
    }

    const onScroll = () => reflow(false);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onDispose(() => scroller.removeEventListener('scroll', onScroll));
    onDispose(observeResize(scroller, measure));
    onDispose(
      delegate(scroller, '[data-id]', 'click', (event, target) => {
        if (!onSelect || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        onSelect(target.dataset.id);
      }),
    );
    onDispose(() => {
      for (const node of mounted.values()) recycleCard(node);
      mounted.clear();
    });

    measure();

    return {
      node: scroller,
      update({ items: nextItems }) {
        if (nextItems === data) return;
        data = nextItems;
        scroller.scrollTop = 0;
        reflow(true);
      },
      /** Actualiza en sitio sin recrear nodos (p. ej. tras marcar favoritos). */
      refresh() {
        for (const [index, node] of mounted) fillCard(node, data[index]);
      },
    };
  },
});

export default VirtualGrid;

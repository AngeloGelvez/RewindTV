/**
 * Marca.
 *
 * El logo anterior era una "R" en una caja: una inicial no dice de que va el
 * sitio y a 32 px se confundia con cualquier otra. Este es un simbolo:
 * el doble triangulo de rebobinar dentro de un disco, que es literalmente el
 * nombre, se reconoce a tamano de favicon y no depende de leer texto.
 *
 * Se dibuja con el acento de la festividad (`--fest`), asi que en Navidad el
 * disco es rojo y en Halloween naranja sin tocar nada aqui.
 */
import { el } from '../../core/dom.js';

const NS = 'http://www.w3.org/2000/svg';

/*
 * Cada isotipo necesita su PROPIO id de gradiente.
 *
 * Con un id fijo y dos logos en la pagina —la cabecera y el rail de
 * television— los dos declaraban `#logo-fade` y todos los `url(#logo-fade)`
 * resolvian al PRIMERO del documento. Ese primero es el del rail, que vive
 * dentro de un contenedor `display: none`, y un paint server que no esta en el
 * arbol de render no pinta: el isotipo de la cabecera se quedaba sin relleno,
 * casi invisible, en movil y en escritorio.
 */
let instancias = 0;

function mark(size) {
  const id = `logo-fade-${++instancias}`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('class', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="var(--fest)"/>
        <stop offset="100%" stop-color="var(--fest-2)"/>
      </linearGradient>
    </defs>
    <rect x="1.5" y="1.5" width="37" height="37" rx="12" fill="url(#${id})"/>
    <rect x="1.5" y="1.5" width="37" height="37" rx="12" fill="none" stroke="rgb(255 255 255 / .22)"/>
    <g fill="var(--fest-ink)">
      <path d="M19.4 13.6v12.8a1 1 0 0 1-1.54.84l-9.3-6.4a1 1 0 0 1 0-1.68l9.3-6.4a1 1 0 0 1 1.54.84Z"/>
      <path d="M31.9 13.6v12.8a1 1 0 0 1-1.54.84l-9.3-6.4a1 1 0 0 1 0-1.68l9.3-6.4a1 1 0 0 1 1.54.84Z"/>
    </g>`;
  return svg;
}

/**
 * @param {object} opts
 * @param {boolean} opts.wordmark  si se acompaña del nombre escrito
 * @param {string}  opts.size      clases de tamano para el simbolo
 */
export function logo({ wordmark = true, size = 'size-9' } = {}) {
  return el(
    'a',
    {
      href: '/',
      'aria-label': 'RewindTv, inicio',
      class: 'group flex shrink-0 items-center gap-2.5 rounded-pill outline-offset-4',
    },
    [
      el('span', { class: 'transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:-rotate-6' }, [
        mark(size),
      ]),
      // En movil solo queda el simbolo: el nombre escrito le robaria al
      // buscador el ancho que necesita para ser usable.
      //
      // `data-wordmark` existe para el rail de television, que lo esconde
      // mientras esta plegado y lo enseña al desplegarse. Es ancho, no
      // anchura de pantalla: por eso no basta con el punto de corte.
      wordmark
        ? el('span', { 'data-wordmark': '', class: 'hidden font-display text-[1.35rem] font-extrabold leading-none tracking-tight sm:block' }, [
            el('span', { class: 'text-ink-0' }, 'Rewind'),
            el('span', { style: 'color: var(--fest-text)' }, 'Tv'),
          ])
        : null,
    ],
  );
}

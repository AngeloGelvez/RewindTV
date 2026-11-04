/**
 * Navegacion espacial: las flechas mueven el foco al elemento mas cercano en
 * esa direccion, como en la interfaz de cualquier televisor.
 *
 * Por que geometria y no un grafo de vecinos declarado a mano: las filas son
 * virtualizadas y los nodos entran y salen del DOM al desplazarse. Cualquier
 * mapa de "quien esta a la derecha de quien" quedaria obsoleto en el primer
 * scroll. Medir en cada pulsacion es barato: solo existen en el DOM los
 * elementos visibles mas un colchon (unos 150 en la portada).
 *
 * Teclas:
 *   flechas                  mover el foco
 *   OK / Enter               nativo (los destinos son <a> y <button>)
 *   Atras                    461 (webOS), 10009 (Tizen), BrowserBack, y
 *                            Backspace solo en modo TV
 *   Play/Pausa del mando     el <video> de la pagina, si lo hay
 *
 * Un componente que necesite las flechas para si (un slider, por ejemplo)
 * marca su contenedor con [data-nav-own]. Lo que no deba recibir foco por
 * flechas lleva [data-nav-skip].
 */
import { stripBase } from './base.js';
import { navigate } from './router.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

const DIR_BY_KEY = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
// Navegadores de TV antiguos mandan key = 'Unidentified' y solo keyCode.
const DIR_BY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
const BACK_CODES = new Set([461, 10009]);
const PLAY_CODES = new Set([415, 19, 10252, 179]);

function direction(event) {
  return DIR_BY_KEY[event.key] ?? DIR_BY_CODE[event.keyCode] ?? null;
}

function isTyping(node) {
  if (!node) return false;
  if (node.isContentEditable) return true;
  if (node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') return true;
  return node.tagName === 'INPUT' && !/^(button|checkbox|radio|submit|reset|range|color|file)$/i.test(node.type);
}

/** Destinos posibles con su caja ya medida (una sola pasada de lectura). */
function candidates(scope) {
  const out = [];
  for (const node of scope.querySelectorAll(FOCUSABLE)) {
    if (node.closest('[inert], [aria-hidden="true"], [data-nav-skip], [hidden]')) continue;
    const r = node.getBoundingClientRect();
    // < 2 deja fuera lo .sr-only (1x1 px), como el enlace "Saltar al contenido".
    if (r.width < 2 || r.height < 2) continue;
    out.push({ node, r });
  }
  return out;
}

/**
 * Puntua un candidato. Menor es mejor; Infinity = no esta en esa direccion.
 *  - main:  distancia en el eje del movimiento (hueco entre bordes).
 *  - gap:   hueco en el eje cruzado. 0 si las cajas se solapan, es decir,
 *           si estan en la misma fila o columna: eso pesa mucho.
 *  - align: desalineacion de centros, para desempatar dentro de la fila.
 */
function score(from, to, dir) {
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  const horizontal = dir === 'left' || dir === 'right';

  if (dir === 'right' && (tx <= fx + 1 || to.right <= from.right)) return Infinity;
  if (dir === 'left' && (tx >= fx - 1 || to.left >= from.left)) return Infinity;
  if (dir === 'down' && (ty <= fy + 1 || to.bottom <= from.bottom)) return Infinity;
  if (dir === 'up' && (ty >= fy - 1 || to.top >= from.top)) return Infinity;

  let main;
  if (dir === 'right') main = to.left - from.right;
  else if (dir === 'left') main = from.left - to.right;
  else if (dir === 'down') main = to.top - from.bottom;
  else main = from.top - to.bottom;

  const gap = horizontal
    ? Math.max(0, Math.max(to.top, from.top) - Math.min(to.bottom, from.bottom))
    : Math.max(0, Math.max(to.left, from.left) - Math.min(to.right, from.right));
  const align = horizontal ? Math.abs(ty - fy) : Math.abs(tx - fx);

  return Math.max(0, main) + gap * 4 + align * 0.3;
}

const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function focusNode(node) {
  node.focus({ preventScroll: true });
  const tv = document.documentElement.classList.contains('tv');
  // En TV se centra la fila: desde el sofa se ve que hay arriba y abajo.
  node.scrollIntoView({
    block: tv ? 'center' : 'nearest',
    inline: 'nearest',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

/** Primer destino util dentro de `scope` ([data-autofocus] tiene prioridad). */
export function firstFocusable(scope) {
  const preferido = scope.querySelector('[data-autofocus]');
  if (preferido) return preferido;
  const lista = candidates(scope);
  // El primero en orden de lectura: arriba-izquierda.
  lista.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
  return lista[0]?.node ?? null;
}

function move(dir) {
  const active = document.activeElement;
  const outlet = document.getElementById('outlet');

  // Sin foco util todavia (recien cargada): la primera flecha entra al contenido.
  if (!active || active === document.body || active === outlet) {
    const first = outlet && firstFocusable(outlet);
    if (first) focusNode(first);
    return Boolean(first);
  }

  const from = active.getBoundingClientRect();
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates(document)) {
    if (c.node === active) continue;
    const s = score(from, c.r, dir);
    if (s < bestScore) {
      bestScore = s;
      best = c.node;
    }
  }
  if (best) focusNode(best);
  return Boolean(best);
}

function goBack() {
  if (stripBase(location.pathname) === '/') return;
  if (history.length > 1) history.back();
  else navigate('/');
}

function togglePlayback() {
  const video = document.querySelector('#outlet video');
  if (!video) return false;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
  return true;
}

export function startSpatialNav() {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const active = document.activeElement;
    const tv = document.documentElement.classList.contains('tv');

    // Atras del mando. Backspace solo en TV: en un PC borra texto y nada mas.
    const back =
      BACK_CODES.has(event.keyCode) ||
      event.key === 'BrowserBack' ||
      event.key === 'GoBack' ||
      (tv && event.key === 'Backspace' && !isTyping(active));
    if (back) {
      event.preventDefault();
      goBack();
      return;
    }

    if (PLAY_CODES.has(event.keyCode) || event.key === 'MediaPlayPause') {
      if (togglePlayback()) event.preventDefault();
      return;
    }

    const dir = direction(event);
    if (!dir || event.shiftKey) return;
    if (active && active.closest('[data-nav-own]')) return;
    // Dentro de un campo de texto, izquierda/derecha mueven el cursor.
    if (isTyping(active) && (dir === 'left' || dir === 'right')) return;

    // Solo se bloquea el scroll nativo si de verdad movimos el foco: al final
    // de la pagina, la flecha abajo sigue desplazando como siempre.
    if (move(dir)) event.preventDefault();
  });
}

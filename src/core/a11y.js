/**
 * Accesibilidad de la navegacion SPA.
 *
 * Una SPA rompe tres cosas que una web clasica da gratis al cargar pagina:
 *   1. El titulo de la pestaña no cambia.
 *   2. El lector de pantalla no se entera de que hay pagina nueva.
 *   3. El foco se queda en el enlace pulsado, que ya ni existe.
 *
 * Aqui se reparan las tres tras cada ROUTE_CHANGED. Y una cuarta, pensada
 * para el mando de la tele: al volver Atras, el foco regresa a la tarjeta
 * desde la que se entro, en vez de arrancar otra vez desde arriba.
 */
import { on, EVENTS } from './eventBus.js';
import { firstFocusable, focusNode } from './spatialNav.js';

const APP = 'RewindTv';

// Tarjeta enfocada al salir de cada ruta, para restaurarla al volver.
const lastFocus = new Map();
let currentKey = null;
let viaKeys = false;
let viaHistory = false;

const routeKey = () => location.pathname + location.search;
const nextFrame = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

export function startRouteA11y(outlet, announcer) {
  // Modalidad de entrada: con raton no se mueve el foco visible a la fuerza.
  addEventListener('keydown', () => { viaKeys = true; }, { capture: true, passive: true });
  addEventListener('pointerdown', () => { viaKeys = false; }, { capture: true, passive: true });
  addEventListener('popstate', () => { viaHistory = true; });

  on(EVENTS.ROUTE_LOADING, () => {
    const id = document.activeElement?.closest?.('[data-id]')?.dataset.id;
    if (currentKey && id) lastFocus.set(currentKey, id);
  });

  on(EVENTS.ROUTE_CHANGED, () => {
    currentKey = routeKey();
    const restoring = viaHistory;
    viaHistory = false;

    // Dos frames: las vistas montan sus filas en el siguiente write().
    nextFrame(() => {
      const heading = outlet.querySelector('h1')?.textContent?.trim();
      document.title = heading && heading !== APP ? `${heading} · ${APP}` : APP;

      // Vaciar y reescribir: algunos lectores no repiten un texto identico.
      announcer.textContent = '';
      setTimeout(() => {
        announcer.textContent = heading ? `Pagina: ${heading}` : 'Pagina cargada';
      }, 60);

      const savedId = restoring ? lastFocus.get(currentKey) : null;
      const saved = savedId && outlet.querySelector(`[data-id="${CSS.escape(savedId)}"]`);
      if (saved) return focusNode(saved);

      if (viaKeys || document.documentElement.classList.contains('tv')) {
        const first = firstFocusable(outlet);
        if (first) return focusNode(first);
      }
      // Con raton o tactil: el foco va al <main> (sin anillo visible), y el
      // lector de pantalla empieza a leer desde el contenido nuevo.
      outlet.focus({ preventScroll: true });
    });
  });
}

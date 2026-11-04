/**
 * Router de History API con carga diferida de vistas.
 *
 * Cada ruta declara su vista como `import()` dinamico, asi Vite genera un chunk
 * por vista y el arranque solo descarga el shell + la vista actual.
 * Ademas: prefetch en hover/focus y cache del modulo ya resuelto.
 */
import { emit, EVENTS } from './eventBus.js';
import { patch } from './store.js';
import { idle } from './scheduler.js';
import { withBase, stripBase } from './base.js';

const routes = [
  { name: 'home', pattern: '/', load: () => import('../views/home.js') },
  { name: 'explore', pattern: '/explorar', load: () => import('../views/explore.js') },
  { name: 'search', pattern: '/buscar', load: () => import('../views/search.js') },
  { name: 'detail', pattern: '/titulo/:id', load: () => import('../views/detail.js') },
  // El matcher solo admite parametros de segmento completo, asi que la
  // temporada y el capitulo llegan como 't1' y 'c2' y se parsean en la vista.
  { name: 'watch', pattern: '/ver/:id/:season/:episode', load: () => import('../views/watch.js') },
  { name: 'watch', pattern: '/ver/:id', load: () => import('../views/watch.js') },
  { name: 'live', pattern: '/en-vivo', load: () => import('../views/live.js') },
  { name: 'guide', pattern: '/guia', load: () => import('../views/guide.js') },
];

const notFound = { name: 'notFound', pattern: '*', load: () => import('../views/notFound.js') };

// pattern -> { segments, keys } para no re-parsear en cada navegacion.
const compiled = new Map();
// name -> modulo ya cargado.
const moduleCache = new Map();

let outlet = null;
let activeView = null;

function compile(pattern) {
  let entry = compiled.get(pattern);
  if (entry) return entry;
  const segments = pattern.split('/').filter(Boolean);
  entry = { segments, keys: segments.filter((s) => s[0] === ':').map((s) => s.slice(1)) };
  compiled.set(pattern, entry);
  return entry;
}

function match(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const route of routes) {
    const { segments } = compile(route.pattern);
    if (segments.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg[0] === ':') params[seg.slice(1)] = decodeURIComponent(parts[i]);
      else if (seg !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return { route: notFound, params: {} };
}

async function loadModule(route) {
  let mod = moduleCache.get(route.name);
  if (!mod) {
    mod = await route.load();
    moduleCache.set(route.name, mod);
  }
  return mod;
}

/** Precarga el chunk de una ruta sin renderizarla (hover, focus, idle). */
export function prefetch(pathname) {
  const { route } = match(pathname);
  if (moduleCache.has(route.name)) return;
  idle(() => loadModule(route).catch(() => {}));
}

export async function navigate(to, { replace = false } = {}) {
  const url = new URL(withBase(to), location.origin);
  if (url.pathname === location.pathname && url.search === location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
  await render();
}

async function render() {
  const { route, params } = match(stripBase(location.pathname));
  const query = Object.fromEntries(new URLSearchParams(location.search));

  emit(EVENTS.ROUTE_LOADING, route.name);
  const mod = await loadModule(route);

  // Desmontaje explicito: cada vista libera listeners y devuelve nodos al pool.
  if (activeView && typeof activeView.unmount === 'function') activeView.unmount();

  patch('route', { name: route.name, params, query });
  activeView = await mod.default({ outlet, params, query });

  emit(EVENTS.ROUTE_CHANGED, { name: route.name, params, query });
  if (!params.id) window.scrollTo({ top: 0, behavior: 'instant' });
}

export function startRouter(mountPoint) {
  outlet = mountPoint;

  // Un unico listener para todos los enlaces internos de la app.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, location.origin);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    navigate(stripBase(url.pathname) + url.search);
  });

  document.addEventListener(
    'pointerover',
    (event) => {
      const anchor = event.target.closest?.('a[href^="/"]');
      if (anchor) prefetch(stripBase(new URL(anchor.href, location.origin).pathname));
    },
    { passive: true },
  );

  addEventListener('popstate', render);
  return render();
}

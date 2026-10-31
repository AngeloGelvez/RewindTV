/**
 * Bus de eventos de la app (patron Observer). Se usa para comunicacion entre
 * modulos que no se conocen entre si: el Player avisa "media:progress" y el
 * historial lo persiste sin que ninguno importe al otro.
 */
const channels = new Map();

export function on(event, handler) {
  let set = channels.get(event);
  if (!set) channels.set(event, (set = new Set()));
  set.add(handler);
  return () => off(event, handler);
}

export function once(event, handler) {
  const dispose = on(event, (payload) => {
    dispose();
    handler(payload);
  });
  return dispose;
}

export function off(event, handler) {
  const set = channels.get(event);
  if (!set) return;
  set.delete(handler);
  if (!set.size) channels.delete(event);
}

export function emit(event, payload) {
  const set = channels.get(event);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[eventBus:${event}]`, err);
    }
  }
}

export const EVENTS = Object.freeze({
  ROUTE_CHANGED: 'route:changed',
  ROUTE_LOADING: 'route:loading',
  MEDIA_PROGRESS: 'media:progress',
  MEDIA_ENDED: 'media:ended',
  SEARCH_QUERY: 'search:query',
  THEME_CHANGED: 'theme:changed',
});

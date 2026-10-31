/**
 * Store minimo con suscripcion por "slice". Un componente que solo mira
 * `state.player` no se re-renderiza cuando cambia `state.search`.
 * Sin dependencias, sin proxies profundos: comparacion por referencia.
 */
import { write } from './scheduler.js';

const state = {
  route: { name: 'home', params: {}, query: {} },
  user: { continueWatching: [], favorites: [] },
  catalog: { lastQuery: '', filters: { decade: null, genre: null, kind: null } },
  player: { titleId: null, playing: false, position: 0 },
  live: { channelId: null },
  ui: { navOpen: false, theme: 'dark' },
};

const listeners = new Map(); // slice -> Set<fn>
let pending = null;

export function getState() {
  return state;
}

export function select(slice) {
  return state[slice];
}

export function subscribe(slice, handler) {
  let set = listeners.get(slice);
  if (!set) listeners.set(slice, (set = new Set()));
  set.add(handler);
  return () => set.delete(handler);
}

/**
 * Aplica un patch sobre un slice. Las notificaciones se agrupan en un frame,
 * asi 10 `patch` seguidos producen un solo render.
 */
export function patch(slice, partial) {
  const current = state[slice];
  if (!current) throw new Error(`[store] slice desconocido: ${slice}`);
  const next = { ...current, ...partial };

  let changed = false;
  for (const key in next) {
    if (next[key] !== current[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;

  state[slice] = next;
  if (!pending) pending = new Set();
  pending.add(slice);
  write(notify);
}

function notify() {
  if (!pending) return;
  const slices = pending;
  pending = null;
  for (const slice of slices) {
    const set = listeners.get(slice);
    if (!set) continue;
    for (const handler of set) {
      try {
        handler(state[slice]);
      } catch (err) {
        console.error(`[store:${slice}]`, err);
      }
    }
  }
}

/**
 * Cache de dos niveles:
 *  L1 memoria  -> acceso inmediato durante la sesion
 *  L2 IndexedDB -> sobrevive recargas; en la segunda visita el catalogo
 *                  se pinta sin tocar la red (stale-while-revalidate)
 */
const DB_NAME = 'rewindtv';
const STORE = 'kv';
const memory = new Map();

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null); // modo privado / sin permisos: seguimos solo con L1
  return dbPromise;
}

export async function get(key, { maxAge = 86_400_000 } = {}) {
  if (memory.has(key)) return memory.get(key);
  const db = await openDb();
  if (!db) return undefined;
  const record = await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
  if (!record || Date.now() - record.at > maxAge) return undefined;
  memory.set(key, record.value);
  return record.value;
}

export async function set(key, value) {
  memory.set(key, value);
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put({ value, at: Date.now() }, key);
}

export function peek(key) {
  return memory.get(key);
}

export function invalidate(key) {
  memory.delete(key);
}

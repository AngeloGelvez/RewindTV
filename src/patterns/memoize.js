/**
 * Memoizacion con LRU. Se usa para resultados de filtro/busqueda/ordenamiento:
 * volver a una vista con los mismos filtros no recalcula nada.
 */
export function memoize(fn, { limit = 64, keyOf = (...args) => args.join('|') } = {}) {
  const cache = new Map();

  const memoized = (...args) => {
    const key = keyOf(...args);
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key); // reinsertar = marcar como reciente
      cache.set(key, value);
      return value;
    }
    const value = fn(...args);
    cache.set(key, value);
    if (cache.size > limit) cache.delete(cache.keys().next().value);
    return value;
  };

  memoized.clear = () => cache.clear();
  return memoized;
}

/** Version de un argumento con WeakMap: la clave se libera con el GC. */
export function memoizeWeak(fn) {
  const cache = new WeakMap();
  return (arg) => {
    let value = cache.get(arg);
    if (value === undefined) cache.set(arg, (value = fn(arg)));
    return value;
  };
}

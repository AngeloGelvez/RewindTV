/**
 * FLYWEIGHT
 * =========
 * Separa el estado *intrinseco* (compartido, inmutable) del *extrinseco*
 * (propio de cada uso). En RewindTv el catalogo puede tener miles de titulos
 * que repiten los mismos generos, decadas, cadenas y badges: en vez de crear
 * un objeto por cada aparicion, se crea UNO y se comparte por referencia.
 *
 *   10.000 titulos x 3 generos = 30.000 strings/objetos
 *   con flyweight             = ~40 objetos compartidos
 *
 * Reglas:
 *  - Un flyweight es inmutable (Object.freeze). Nunca se muta tras crearse.
 *  - La clave debe derivarse solo del estado intrinseco.
 */
export function createFlyweightFactory(name, build, keyOf = (input) => String(input)) {
  const pool = new Map();
  let hits = 0;
  let misses = 0;

  function get(input) {
    const key = keyOf(input);
    const existing = pool.get(key);
    if (existing !== undefined) {
      hits++;
      return existing;
    }
    misses++;
    const created = Object.freeze(build(input, key));
    pool.set(key, created);
    return created;
  }

  return {
    name,
    get,
    getAll: (inputs) => inputs.map(get),
    has: (input) => pool.has(keyOf(input)),
    get size() {
      return pool.size;
    },
    stats: () => ({ name, size: pool.size, hits, misses, ratio: hits / (hits + misses || 1) }),
    clear: () => {
      pool.clear();
      hits = misses = 0;
    },
  };
}

/** Internado de strings repetidos (generos, cadenas, ratings). */
const strings = new Map();
export function intern(value) {
  if (typeof value !== 'string') return value;
  const existing = strings.get(value);
  if (existing !== undefined) return existing;
  strings.set(value, value);
  return value;
}

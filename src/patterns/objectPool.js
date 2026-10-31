/**
 * OBJECT POOL (aplicado a nodos DOM)
 * ==================================
 * Crear y destruir nodos es lo mas caro del scroll. El pool recicla:
 * cuando una tarjeta sale del viewport no se destruye, se devuelve al pool
 * y se reusa para la siguiente que entra, cambiando solo su contenido.
 *
 * Es la pieza que permite recorrer 5.000 titulos con ~30 nodos vivos.
 */
export function createPool({ create, reset, prime = 0, max = 256 }) {
  const free = [];
  let created = 0;

  for (let i = 0; i < prime; i++) {
    free.push(create());
    created++;
  }

  return {
    acquire() {
      const item = free.pop();
      if (item) return item;
      created++;
      return create();
    },
    release(item) {
      if (free.length >= max) return;
      reset(item);
      free.push(item);
    },
    releaseAll(items) {
      for (let i = 0; i < items.length; i++) this.release(items[i]);
    },
    stats: () => ({ created, free: free.length, max }),
    drain: () => {
      free.length = 0;
    },
  };
}

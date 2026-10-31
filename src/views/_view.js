/**
 * Contrato de vista. Cada archivo en /views exporta por defecto una funcion
 * async que recibe { outlet, params, query } y devuelve { unmount() }.
 * El router llama a `unmount()` antes de montar la siguiente vista.
 */
export function createView(node, outlet, teardown) {
  outlet.replaceChildren(node);
  return {
    node,
    unmount() {
      teardown?.();
      outlet.replaceChildren();
    },
  };
}

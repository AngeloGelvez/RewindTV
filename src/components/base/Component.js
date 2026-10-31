/**
 * Contrato comun de componente. No es una clase base con herencia: es una
 * fabrica que devuelve un objeto con ciclo de vida explicito.
 *
 *   { node, update(props), destroy() }
 *
 * `destroy()` es obligatorio: ahi se quitan listeners, se cancelan observers y
 * se devuelven nodos al pool. Sin esto, el scroll infinito filtra memoria.
 */
export function defineComponent({ setup }) {
  return (props = {}) => {
    const disposers = [];
    const onDispose = (fn) => disposers.push(fn);

    const api = setup(props, { onDispose });

    return {
      ...api,
      destroy() {
        for (let i = disposers.length - 1; i >= 0; i--) {
          try {
            disposers[i]();
          } catch (err) {
            console.error('[destroy]', err);
          }
        }
        disposers.length = 0;
        api.destroy?.();
      },
    };
  };
}

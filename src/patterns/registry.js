/**
 * Registry + lazy factory de componentes. Un componente pesado (el Player, el
 * EPG) se registra por nombre y solo se importa cuando alguna vista lo pide.
 */
const definitions = new Map();
const instances = new Map();

export function define(name, loader, { singleton = false } = {}) {
  definitions.set(name, { loader, singleton });
}

export async function create(name, props) {
  const def = definitions.get(name);
  if (!def) throw new Error(`[registry] componente no registrado: ${name}`);

  if (def.singleton && instances.has(name)) {
    const instance = instances.get(name);
    instance.update?.(props);
    return instance;
  }

  const mod = await def.loader();
  const factory = mod.default ?? mod[name];
  const instance = factory(props);
  if (def.singleton) instances.set(name, instance);
  return instance;
}

export function dispose(name) {
  instances.get(name)?.destroy?.();
  instances.delete(name);
}

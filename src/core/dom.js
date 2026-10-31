/**
 * Helpers de DOM. Creamos nodos por API imperativa (no innerHTML) en todo lo
 * que se repite: es mas rapido, no reparsea HTML y evita inyeccion.
 * `html` queda disponible solo para bloques estaticos de una sola vez.
 */
export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key in attrs) {
      const value = attrs[key];
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else node.setAttribute(key, value === true ? '' : value);
    }
  }
  if (children != null) append(node, children);
  return node;
}

export function append(parent, children) {
  if (Array.isArray(children)) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child == null) continue;
      frag.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    parent.appendChild(frag);
    return parent;
  }
  parent.appendChild(
    typeof children === 'string' ? document.createTextNode(children) : children,
  );
  return parent;
}

/** Parsea un fragmento una sola vez y luego lo clona: clonar es ~10x mas rapido. */
export function template(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const node = tpl.content.firstElementChild;
  return () => node.cloneNode(true);
}

export function clear(node) {
  node.replaceChildren();
}

/**
 * Un solo listener en el contenedor en lugar de uno por tarjeta.
 * Con 500 tarjetas en pantalla son 1 listener en vez de 500.
 */
export function delegate(root, selector, type, handler) {
  const onEvent = (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, onEvent, { passive: type === 'touchstart' });
  return () => root.removeEventListener(type, onEvent);
}

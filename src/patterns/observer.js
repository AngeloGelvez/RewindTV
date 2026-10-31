/**
 * Observers compartidos. Un IntersectionObserver por configuracion para toda
 * la app en vez de uno por elemento: el navegador agrupa los calculos.
 */
const intersectionObservers = new Map();
const callbacks = new WeakMap();

function keyOf(options) {
  return `${options.root ? 'r' : 'v'}|${options.rootMargin ?? '0px'}|${options.threshold ?? 0}`;
}

export function observeIntersection(element, handler, options = {}) {
  const key = keyOf(options);
  let observer = intersectionObservers.get(key);
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        callbacks.get(entry.target)?.(entry, observer);
      }
    }, options);
    intersectionObservers.set(key, observer);
  }
  callbacks.set(element, handler);
  observer.observe(element);
  return () => {
    observer.unobserve(element);
    callbacks.delete(element);
  };
}

let resizeObserver = null;
const resizeCallbacks = new WeakMap();

export function observeResize(element, handler) {
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver((entries) => {
      for (let i = 0; i < entries.length; i++) {
        resizeCallbacks.get(entries[i].target)?.(entries[i]);
      }
    });
  }
  resizeCallbacks.set(element, handler);
  resizeObserver.observe(element);
  return () => {
    resizeObserver.unobserve(element);
    resizeCallbacks.delete(element);
  };
}

export function debounce(fn, wait = 150) {
  let id = 0;
  const wrapped = (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(id);
  return wrapped;
}

/** Throttle alineado a frames: ideal para scroll y pointermove. */
export function rafThrottle(fn) {
  let queued = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

/**
 * Scheduler cooperativo. Nada escribe en el DOM directamente: todo pasa por aqui
 * para que las escrituras se agrupen en un solo frame y las lecturas nunca
 * provoquen layout thrashing.
 *
 * - read(fn)   -> se ejecuta antes de las escrituras del frame
 * - write(fn)  -> se ejecuta despues de todas las lecturas
 * - idle(fn)   -> trabajo no urgente (prefetch, analitica, warmup de cache)
 */
const reads = [];
const writes = [];
let frameId = 0;

function flush() {
  frameId = 0;
  const r = reads.splice(0, reads.length);
  const w = writes.splice(0, writes.length);
  for (let i = 0; i < r.length; i++) runSafe(r[i]);
  for (let i = 0; i < w.length; i++) runSafe(w[i]);
  // Si una escritura encolo mas trabajo, lo atendemos en el siguiente frame.
  if (reads.length || writes.length) schedule();
}

function runSafe(fn) {
  try {
    fn();
  } catch (err) {
    console.error('[scheduler]', err);
  }
}

function schedule() {
  if (frameId) return;
  frameId = requestAnimationFrame(flush);
}

export function read(fn) {
  reads.push(fn);
  schedule();
}

export function write(fn) {
  writes.push(fn);
  schedule();
}

const idleQueue = [];
let idleHandle = 0;

const requestIdle =
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb) => setTimeout(() => cb({ timeRemaining: () => 8, didTimeout: true }), 1);

function drainIdle(deadline) {
  idleHandle = 0;
  while (idleQueue.length && (deadline.timeRemaining() > 2 || deadline.didTimeout)) {
    runSafe(idleQueue.shift());
  }
  if (idleQueue.length) scheduleIdle();
}

function scheduleIdle() {
  if (idleHandle) return;
  idleHandle = requestIdle(drainIdle, { timeout: 2000 });
}

export function idle(fn) {
  idleQueue.push(fn);
  scheduleIdle();
}

/** Ejecuta una tarea larga en trozos, cediendo el hilo entre cada uno. */
export async function chunked(items, worker, size = 64) {
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    for (let j = 0; j < slice.length; j++) worker(slice[j], i + j);
    if (i + size < items.length) await new Promise((r) => idle(r));
  }
}

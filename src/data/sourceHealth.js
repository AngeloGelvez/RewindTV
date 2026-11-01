/**
 * Disponibilidad de fuentes: la MEMORIA de lo observado, no un sondeo.
 *
 * Que se puede saber y que no, porque de eso depende todo el diseno:
 *
 *  - Fichero / HLS: el <video> emite `error` y hls.js emite errores fatales.
 *    Esa es una senal REAL de que la fuente no sirve, y permite caer a la
 *    siguiente sin que el usuario toque nada.
 *  - Iframe de tercero: opaco por origen cruzado. `load` dispara igual cuando
 *    el proveedor pinta "video no disponible", y no hay forma de leer dentro.
 *    NO existe health-check honesto de un iframe desde el navegador. La unica
 *    senal fiable es que el usuario diga que no carga.
 *
 * Por eso aqui no hay sondas: esto solo recuerda veredictos para no volver a
 * ofrecer primero algo que ya fallo. Las sondas de verdad estan en
 * scripts/check-sources.mjs, que corre en Node y no tiene origen cruzado.
 */
import * as cache from './cache.js';
import { debounce } from '../utils/timing.js';

const KEY = 'source-health';

// Un fallo caduca antes que un acierto: los enlaces se caen, pero tambien
// vuelven, y no queremos enterrar una fuente para siempre por un corte de red.
const TTL = { ok: 7 * 86_400_000, failed: 12 * 3_600_000 };

const verdicts = new Map(); // "proveedor:id" -> { status, reason, at }
let hydrated = false;

const keyOf = (source) => `${source.provider}:${source.id}`;
const expirado = (record) => Date.now() - record.at > (TTL[record.status] ?? TTL.failed);

// La escritura va agrupada: durante un fallback en cadena esto se llama varias
// veces en el mismo segundo y no hace falta tocar IndexedDB en cada una.
const persist = debounce(() => cache.set(KEY, Object.fromEntries(verdicts)), 500);

/** Se llama al arrancar; sin esto los veredictos solo viven la sesion. */
export async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  const stored = await cache.get(KEY, { maxAge: TTL.ok });
  if (!stored) return;
  for (const [key, record] of Object.entries(stored)) {
    if (!expirado(record)) verdicts.set(key, record);
  }
}

export function verdict(source) {
  if (!source) return 'unknown';
  const record = verdicts.get(keyOf(source));
  if (!record) return 'unknown';
  // Un veredicto vencido no se borra aqui (seria mutar en medio de un sort):
  // simplemente deja de contar.
  return expirado(record) ? 'unknown' : record.status;
}

export function markOk(source) {
  if (!source) return;
  verdicts.set(keyOf(source), { status: 'ok', at: Date.now() });
  persist();
}

export function markFailed(source, reason = '') {
  if (!source) return;
  verdicts.set(keyOf(source), { status: 'failed', reason, at: Date.now() });
  persist();
}

const PESO = { ok: 0, unknown: 1, failed: 2 };

/**
 * Ordena las fuentes de un capitulo: lo que funciono primero, lo que fallo al
 * final. El sort es estable, asi que a igual veredicto gana el orden del JSON,
 * que es el orden de preferencia que puso quien escribio el dato.
 */
export function rank(sources) {
  if (!sources?.length) return [];
  if (sources.length === 1) return sources;
  return sources
    .map((source, i) => ({ source, i, peso: PESO[verdict(source)] }))
    .sort((a, b) => a.peso - b.peso || a.i - b.i)
    .map((entry) => entry.source);
}

/** Para mirar desde la consola que ha aprendido la sesion. */
export const stats = () => ({ guardados: verdicts.size, verdicts: Object.fromEntries(verdicts) });

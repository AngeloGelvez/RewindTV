/**
 * Registro de proveedores de video.
 *
 * El JSON guarda [proveedor, id] y la URL se construye aqui. Que esto sea un
 * REGISTRO y no un switch resuelve dos cosas:
 *
 *  1. Validacion. Un `src` con un proveedor inexistente (dato viejo, typo en un
 *     fichero escrito a mano) antes lanzaba una excepcion DENTRO del Player y
 *     se llevaba la vista entera por delante. Ahora la fuente se descarta al
 *     parsear: el capitulo cae a la siguiente de su lista y la consola avisa
 *     una sola vez por proveedor.
 *  2. `kind` decide el camino de reproduccion. Un iframe de tercero es una caja
 *     opaca por origen cruzado; un fichero o un HLS emiten eventos de error que
 *     si podemos escuchar. El Player necesita saber cual es ANTES de montar.
 *
 * Lo que NO se guarda en el objeto fuente es la URL: con 20.000 capitulos
 * serian 20.000 strings que casi nadie mira. Se construye con `embedUrl()` en
 * el momento de reproducir.
 */
import { intern } from '../../patterns/flyweight.js';

const PROVIDERS = {
  okru: { kind: 'iframe', label: 'OK.ru', build: (id) => `https://ok.ru/videoembed/${id}` },
  vk: { kind: 'iframe', label: 'VK', build: (id) => `https://vk.com/video_ext.php?${id}` },
  dailymotion: {
    kind: 'iframe',
    label: 'Dailymotion',
    build: (id) => `https://www.dailymotion.com/embed/video/${id}`,
  },
  // `mp4` guarda la URL completa: hosting propio o fichero publico, no hay id
  // que expandir. Cubre tambien HLS, que se distingue por extension (.m3u8) y
  // no por proveedor: el stream de un canal y un mp4 entran por la misma puerta.
  mp4: { kind: 'file', label: 'Directo', build: (id) => id },
};

const HLS = /\.m3u8(\?|$)/i;
const EMPTY = Object.freeze([]);
const avisados = new Set();

function kindOf(provider, id) {
  const def = PROVIDERS[provider];
  return def.kind === 'file' && HLS.test(id) ? 'hls' : def.kind;
}

/**
 * Normaliza una tupla del JSON. Devuelve null cuando la fuente no es usable, y
 * esa es la diferencia con el comportamiento anterior: un dato malo no rompe
 * nada, simplemente deja de existir.
 */
export function createSource(raw, context = '') {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const [provider, id] = raw;
  if (!PROVIDERS[provider]) {
    if (!avisados.has(provider)) {
      avisados.add(provider);
      console.warn(`[embed] proveedor desconocido "${provider}" (${context}): fuente ignorada`);
    }
    return null;
  }
  if (typeof id !== 'string' || id.length === 0) return null;
  return Object.freeze({ provider: intern(provider), id, kind: intern(kindOf(provider, id)) });
}

/**
 * Acepta una tupla suelta (`src`, formato antiguo) o una lista ordenada
 * (`srcs`). El orden del JSON es el orden de preferencia.
 */
export function parseSources(raw, context = '') {
  if (!raw) return EMPTY;
  const list = Array.isArray(raw[0]) ? raw : [raw];
  const out = [];
  for (const entry of list) {
    const source = createSource(entry, context);
    if (!source) continue;
    // La misma fuente repetida en el dato no es un reintento real.
    if (out.some((s) => s.provider === source.provider && s.id === source.id)) continue;
    out.push(source);
  }
  return out.length ? out : EMPTY;
}

export function embedUrl(source) {
  if (!source) return null;
  const def = PROVIDERS[source.provider];
  return def ? def.build(source.id) : null; // createSource ya filtro los raros
}

export const isIframe = (source) => source?.kind === 'iframe';
export const providerLabel = (source) =>
  source ? (PROVIDERS[source.provider]?.label ?? source.provider) : '';
export const providerKind = (provider) => PROVIDERS[provider]?.kind ?? null;
export const knownProviders = () => Object.keys(PROVIDERS);

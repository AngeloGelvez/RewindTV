/**
 * Revalida las fuentes de public/data/episodes/*.json y reporta cuales siguen
 * vivas. Hermano de check-channels.mjs, pero para capitulos.
 *
 *   node scripts/check-sources.mjs           solo reporta
 *   node scripts/check-sources.mjs --prune   ademas borra las fuentes muertas
 *
 * Aqui SI se puede sondear de verdad: Node no tiene origen cruzado, asi que
 * podemos leer la respuesta de un mp4 o de un playlist HLS. Por eso el
 * health-check real vive en un script y no en el navegador.
 *
 * Lo que el script NO puede afirmar es si un iframe reproduce algo. ok.ru y vk
 * devuelven 200 con una pagina de "video no disponible", asi que el estado HTTP
 * de un embed es un INDICIO, no una prueba. Esas salen marcadas como `indicio`
 * y nunca se borran con --prune: borrar por una senal debil es peor que dejar
 * una fuente de mas, que el Player ya sabe descartar en caliente.
 *
 * Reutiliza el registro de proveedores de la app (src/data/models/embed.js)
 * para no tener dos tablas de URLs que se desincronicen.
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { embedUrl, parseSources, providerKind, providerLabel } from '../src/data/models/embed.js';

const DIR = new URL('../public/data/episodes/', import.meta.url);
const PUBLIC = new URL('../public/', import.meta.url);
const TIMEOUT = 9000;
const CONCURRENCY = 12;
const prune = process.argv.includes('--prune');
/**
 * `--solo t518` limita la pasada a esos ficheros. Sondear el catalogo entero
 * son 29.000 peticiones y mas de una hora; despues de importar UNA serie lo
 * que hace falta es comprobar esa serie.
 */
const solo = process.argv.find((a) => a.startsWith('--solo='))?.slice(7)
  ?? (process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1] : null);

const UA = { 'user-agent': 'Mozilla/5.0', accept: '*/*' };

/** Un fichero servido desde public/: se comprueba en disco, no por red. */
async function probeLocal(id) {
  const ruta = new URL('.' + id, PUBLIC);
  try {
    await access(ruta);
    return { estado: 'ok' };
  } catch {
    return { estado: 'muerta', motivo: 'no existe en public/' };
  }
}

async function pedir(url, metodo = 'GET') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, { method: metodo, signal: ctrl.signal, redirect: 'follow', headers: UA });
  } finally {
    clearTimeout(timer);
  }
}

async function probeFile(url) {
  try {
    // HEAD primero: un capitulo son decenas de MB y no hace falta bajarlos.
    let res = await pedir(url, 'HEAD');
    // Bastantes CDN no implementan HEAD; si lo rechazan, se reintenta con GET.
    if (res.status === 405 || res.status === 501) res = await pedir(url, 'GET');
    if (!res.ok) return { estado: 'muerta', motivo: `HTTP ${res.status}` };
    const tipo = res.headers.get('content-type') ?? '';
    if (tipo.startsWith('text/html')) {
      return { estado: 'muerta', motivo: 'devuelve HTML, no video' };
    }
    const bytes = Number(res.headers.get('content-length') ?? 0);
    return { estado: 'ok', detalle: bytes ? `${(bytes / 1048576).toFixed(1)} MB` : tipo };
  } catch (err) {
    return { estado: 'muerta', motivo: err.name === 'AbortError' ? 'timeout' : (err.cause?.code ?? err.message) };
  }
}

async function probeHls(url) {
  try {
    const res = await pedir(url);
    if (!res.ok) return { estado: 'muerta', motivo: `HTTP ${res.status}` };
    const body = (await res.text()).slice(0, 4000);
    if (!body.includes('#EXTM3U')) {
      return {
        estado: 'muerta',
        motivo: body.trimStart().startsWith('<') ? 'devuelve HTML' : 'no es HLS',
      };
    }
    const variantes = (body.match(/#EXT-X-STREAM-INF/g) || []).length;
    return { estado: 'ok', detalle: variantes ? `${variantes} variantes` : 'playlist simple' };
  } catch (err) {
    return { estado: 'muerta', motivo: err.name === 'AbortError' ? 'timeout' : (err.cause?.code ?? err.message) };
  }
}

async function probeIframe(url) {
  try {
    const res = await pedir(url);
    // Un 404/410 si es concluyente: el embed no existe.
    if (res.status === 404 || res.status === 410) {
      return { estado: 'muerta', motivo: `HTTP ${res.status}` };
    }
    if (!res.ok) return { estado: 'indicio', motivo: `HTTP ${res.status}` };
    return { estado: 'indicio', detalle: 'HTTP 200 (no prueba que reproduzca)' };
  } catch (err) {
    return { estado: 'indicio', motivo: err.name === 'AbortError' ? 'timeout' : (err.cause?.code ?? err.message) };
  }
}

/**
 * `video.g` trae dentro la URL del stream en googlevideo, asi que desde Node
 * se puede comprobar que el video sigue existiendo. Es mas de lo que se puede
 * decir de ok.ru, pero sigue sin ser prueba de reproduccion: lo que reproduce
 * es un embed de YouTube dentro de la pagina, y eso solo se puede juzgar en un
 * navegador de verdad.
 *
 * El caso que lo enseño: los 34 capitulos de t518 daban stream desde Node y
 * aun asi salia "Se produjo un error. Vuelve a intentarlo mas tarde", porque a
 * la URL le faltaba el `&origin=<dominio del blog>` que el blog si pone. El
 * dato estaba vivo y el embed mal construido, y un sondeo desde Node no
 * distingue una cosa de la otra.
 *
 * Asi que aqui solo se afirma lo negativo: si la pagina NO trae stream, el
 * video ya no existe (`muerta`). Si lo trae, es `indicio` y nada mas.
 */
async function probeBlogger(url) {
  try {
    const res = await pedir(url);
    if (res.status === 404 || res.status === 410) return { estado: 'muerta', motivo: `HTTP ${res.status}` };
    if (!res.ok) return { estado: 'indicio', motivo: `HTTP ${res.status}` };
    const body = await res.text();
    if (!/googlevideo\.com\/videoplayback/.test(body)) {
      return { estado: 'muerta', motivo: 'la pagina no trae stream (token caducado o video borrado)' };
    }
    return { estado: 'indicio', detalle: 'el video existe (no prueba que el embed reproduzca)' };
  } catch (err) {
    return { estado: 'indicio', motivo: err.name === 'AbortError' ? 'timeout' : (err.cause?.code ?? err.message) };
  }
}

/** Proveedores con un sondeo propio que si es concluyente. */
const PROBES = { blogger: probeBlogger };

function probe(source) {
  const url = embedUrl(source);
  const propio = PROBES[source.provider];
  if (propio) return propio(url);
  if (source.kind === 'iframe') return probeIframe(url);
  if (source.kind === 'hls') return probeHls(url);
  if (url.startsWith('/')) return probeLocal(url);
  return probeFile(url);
}

// ------------------------------------------------------------------ recorrido

const ficheros = (await readdir(DIR))
  .filter((f) => f.endsWith('.json'))
  .filter((f) => !solo || f.includes(solo));
if (!ficheros.length) {
  console.log(solo ? `ningun fichero de episodios coincide con "${solo}"` : 'no hay ficheros en public/data/episodes/');
  process.exit(0);
}

// Se aplana todo a una lista de trabajos: un capitulo puede tener N fuentes y
// la concurrencia debe repartirse por fuente, no por fichero.
const trabajos = [];
const docs = new Map();

for (const nombre of ficheros) {
  const url = new URL(nombre, DIR);
  const doc = JSON.parse(await readFile(url, 'utf8'));
  docs.set(nombre, { url, doc });
  for (const season of doc.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      const sources = parseSources(episode.srcs ?? episode.src);
      if (!sources.length) {
        trabajos.push({ nombre, season: season.number, episode, sinFuente: true });
        continue;
      }
      for (const source of sources) {
        trabajos.push({ nombre, season: season.number, episode, source });
      }
    }
  }
}

const cola = trabajos.filter((t) => !t.sinFuente);
const sinFuente = trabajos.filter((t) => t.sinFuente);
const resultados = [];

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cola.length) {
      const trabajo = cola.shift();
      const resultado = await probe(trabajo.source);
      resultados.push({ ...trabajo, ...resultado });
    }
  }),
);

// ------------------------------------------------------------------- reporte

const porEstado = (estado) => resultados.filter((r) => r.estado === estado);
const vivas = porEstado('ok');
const muertas = porEstado('muerta');
const indicios = porEstado('indicio');

const etiqueta = (r) => `${r.nombre} t${r.season}c${r.episode.n}`;

console.log(`\nfuentes sondeadas: ${resultados.length} en ${ficheros.length} ficheros`);
console.log(`  vivas:    ${vivas.length}`);
console.log(`  muertas:  ${muertas.length}`);
console.log(`  indicios: ${indicios.length}  (iframes: 200 no prueba reproduccion)`);

if (muertas.length) {
  console.log('\nmuertas:');
  for (const r of muertas) {
    console.log(`  ${etiqueta(r).padEnd(26)} ${providerLabel(r.source).padEnd(12)} ${r.motivo}`);
  }
}

if (indicios.filter((r) => r.motivo).length) {
  console.log('\nindicios con aviso:');
  for (const r of indicios.filter((x) => x.motivo)) {
    console.log(`  ${etiqueta(r).padEnd(26)} ${providerLabel(r.source).padEnd(12)} ${r.motivo}`);
  }
}

if (sinFuente.length) {
  console.log(`\nsin ninguna fuente declarada: ${sinFuente.length}`);
  for (const r of sinFuente.slice(0, 20)) console.log(`  ${etiqueta(r)}`);
  if (sinFuente.length > 20) console.log(`  ... y ${sinFuente.length - 20} mas`);
}

// Capitulos cuya ULTIMA fuente viva se cae: son los que quedan irreproducibles.
const porCapitulo = new Map();
for (const r of resultados) {
  const clave = `${r.nombre}|${r.season}|${r.episode.n}`;
  if (!porCapitulo.has(clave)) porCapitulo.set(clave, []);
  porCapitulo.get(clave).push(r);
}
const huerfanos = [...porCapitulo.values()].filter((rs) => rs.every((r) => r.estado === 'muerta'));
if (huerfanos.length) {
  console.log(`\n! ${huerfanos.length} capitulos se quedan SIN ninguna fuente usable:`);
  for (const rs of huerfanos.slice(0, 20)) console.log(`  ${etiqueta(rs[0])}`);
  if (huerfanos.length > 20) console.log(`  ... y ${huerfanos.length - 20} mas`);
}

// Aviso del mismo tipo que en check-channels: HTTPS no carga subrecursos HTTP.
const mixtas = vivas.filter((r) => embedUrl(r.source).startsWith('http://'));
if (mixtas.length) {
  console.log(`\n! ${mixtas.length} vivas por HTTP: el navegador las bloqueara en una web HTTPS`);
  for (const r of mixtas.slice(0, 10)) console.log(`  ${etiqueta(r)}`);
}

// --------------------------------------------------------------------- prune

if (!prune) {
  if (muertas.length) console.log('\n(usa --prune para quitarlas de los ficheros)');
  process.exit(0);
}

// Solo se borra lo demostrado muerto. Los indicios se quedan.
const aBorrar = new Set(muertas.map((r) => `${r.nombre}|${r.season}|${r.episode.n}|${r.source.provider}|${r.source.id}`));
let tocados = 0;

for (const [nombre, { url, doc }] of docs) {
  let cambiado = false;
  for (const season of doc.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      const sources = parseSources(episode.srcs ?? episode.src);
      if (!sources.length) continue;
      const quedan = sources.filter(
        (s) => !aBorrar.has(`${nombre}|${season.number}|${episode.n}|${s.provider}|${s.id}`),
      );
      if (quedan.length === sources.length) continue;
      delete episode.src;
      delete episode.srcs;
      // Se reescribe en la forma mas compacta: una sola fuente vuelve a `src`.
      if (quedan.length === 1) episode.src = [quedan[0].provider, quedan[0].id];
      else if (quedan.length > 1) episode.srcs = quedan.map((s) => [s.provider, s.id]);
      cambiado = true;
      tocados++;
    }
  }
  if (cambiado) {
    await writeFile(url, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    console.log(`  reescrito ${nombre}`);
  }
}

console.log(`\n${tocados} capitulos actualizados, ${muertas.length} fuentes eliminadas`);
console.log(`(${fileURLToPath(DIR)})`);

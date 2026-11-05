/**
 * Genera lo que sirve la web a partir de la lista maestra: trozos por
 * categoria en public/data/channels/ y un indice.
 *
 *   node scripts/build-channels.mjs
 *
 * Por que trozos
 * --------------
 * El maestro pesa ~2 MB (casi 8.000 canales). Servirlo entero significaba que
 * quien abre "En vivo" bajaba y parseaba todos aunque solo mirara una
 * categoria. Ahora la web pide el indice (unos KB) y cada trozo cuando hace
 * falta: la rejilla va por trozos de ~1.000 canales segun se hace scroll, y la
 * portada solo necesita los destacados, que ya vienen en el indice.
 *
 * Los trozos son un dato DERIVADO, como picks.json: no se editan ni se
 * versionan, se regeneran (`predev` y `prebuild` lo hacen solos).
 *
 * Que se quita de cada registro
 * -----------------------------
 * Todo lo que es el valor por defecto o lo que la interfaz no lee: `genres`
 * vacio, `country`/`quality` nulos, `always: true`, `checkedAt` (solo lo usan
 * los scripts) y `category` (va implicita en el nombre del fichero). Con 8.000
 * registros, cada campo repetido es un 30 % de peso que no dice nada.
 */
import { readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { CATEGORIAS, SALIDA, leerMaestro, ordenar } from './lib/canales.mjs';

const TROZO = 1000;
const DESTACADOS = 24;
/** Paises donde esta la audiencia de la web: mandan en los destacados. */
const PAISES = new Set(['mx', 'es', 'ar', 'co', 'cl', 'pe', 'us', 'uy', 've', 'ec']);

const canales = ordenar(await leerMaestro());

/** El registro minimo que lee `createChannel`. */
function compacto(c) {
  const r = { id: c.id, name: c.name };
  if (c.genres?.length) r.genres = c.genres;
  if (c.country) r.country = c.country;
  if (c.quality) r.quality = c.quality;
  if (c.always === false) r.always = false;
  if (c.logo) r.logo = c.logo;
  r.stream = c.stream;
  if (c.webPlayable === false) {
    r.webPlayable = false;
    r.webReason = c.webReason ?? 'cors';
  }
  return r;
}

const porCategoria = new Map(CATEGORIAS.map((c) => [c.slug, []]));
for (const c of canales) (porCategoria.get(c.category) ?? porCategoria.get('general')).push(c);

// Partir de cero: un trozo viejo que ya no existe no debe quedar sirviendose.
await rm(SALIDA, { recursive: true, force: true });
await mkdir(SALIDA, { recursive: true });

const indice = { version: null, total: canales.length, bloqueados: 0, categorias: [], destacados: [] };
let bytes = 0;
let comprimido = 0;

for (const { slug, label } of CATEGORIAS) {
  const lista = porCategoria.get(slug);
  if (!lista.length) continue;

  const trozos = [];
  for (let i = 0; i * TROZO < lista.length; i++) {
    const parte = lista.slice(i * TROZO, (i + 1) * TROZO).map(compacto);
    const fichero = `${slug}-${i + 1}.json`;
    const cuerpo = JSON.stringify(parte);
    await writeFile(new URL(fichero, SALIDA), cuerpo, 'utf8');
    bytes += Buffer.byteLength(cuerpo);
    comprimido += gzipSync(cuerpo).length;
    trozos.push({ file: fichero, count: parte.length });
  }

  const bloqueados = lista.filter((c) => c.webPlayable === false).length;
  indice.bloqueados += bloqueados;
  indice.categorias.push({ slug, label, count: lista.length, bloqueados, trozos });
}

/*
 * Destacados de la portada: hasta 24 que reproduzcan, tengan logo y emitan
 * siempre, repartidos por categoria para que la fila no sea toda de lo mismo, y
 * con preferencia por los paises de la audiencia. Es una seleccion
 * determinista: la portada no cambia de canales entre dos builds sin que
 * cambie la lista.
 */
const buenos = (c) => c.webPlayable !== false && c.logo && c.always !== false && c.quality !== '240p' && c.quality !== '360p';
const cola = new Map(
  CATEGORIAS.map(({ slug }) => [
    slug,
    porCategoria
      .get(slug)
      .filter(buenos)
      .sort((a, b) => Number(b.lang === 'spa') - Number(a.lang === 'spa') || Number(PAISES.has(b.country)) - Number(PAISES.has(a.country)))
      .slice(0, DESTACADOS),
  ]),
);
const vistos = new Set();
while (indice.destacados.length < DESTACADOS && [...cola.values()].some((l) => l.length)) {
  for (const { slug } of CATEGORIAS) {
    const c = cola.get(slug).shift();
    if (c && !vistos.has(c.id)) {
      vistos.add(c.id);
      indice.destacados.push({ ...compacto(c), category: slug });
      if (indice.destacados.length >= DESTACADOS) break;
    }
  }
}

// La version cambia solo si cambia el contenido: la web la usa de clave de
// cache, asi que regenerar sin cambios no invalida nada.
const { createHash } = await import('node:crypto');
indice.version = createHash('sha1')
  .update(JSON.stringify([indice.categorias, indice.destacados, canales.length]))
  .update(String(bytes))
  .digest('hex')
  .slice(0, 10);

await writeFile(new URL('index.json', SALIDA), JSON.stringify(indice), 'utf8');

const ficheros = (await readdir(SALIDA)).length;
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`\nchannels: ${canales.length} canales en ${ficheros - 1} trozos + indice (v${indice.version})`);
console.log(`  trozos     : ${kb(bytes)} (${kb(comprimido)} con gzip)`);
console.log(`  mayor trozo: ${kb(Math.max(...indice.categorias.flatMap((c) => c.trozos.map((t) => t.count))) * 230)} aprox.`);
console.log(`  bloqueados : ${indice.bloqueados}   destacados: ${indice.destacados.length}`);
for (const c of indice.categorias) {
  console.log(`    ${c.slug.padEnd(16)} ${String(c.count).padStart(5)}  (${c.trozos.length} trozo${c.trozos.length > 1 ? 's' : ''})`);
}

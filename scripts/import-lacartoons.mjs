/**
 * Importa el volcado CSV del catalogo de lacartoons.com a los JSON del proyecto.
 *
 *   node scripts/import-lacartoons.mjs <ruta-del-csv>
 *   node scripts/import-lacartoons.mjs <ruta-del-csv> --dry
 *
 * El CSV trae UNA FILA POR CAPITULO (29.199 filas, 503 series) con la serie
 * repetida en cada fila. Eso es exactamente lo que el esquema del proyecto
 * evita: aqui la serie se escribe una vez en `titles.json` y los capitulos van
 * a `episodes/<id>.json`, que solo se baja al abrir esa serie.
 *
 * Por que un script y no una conversion a mano
 * -------------------------------------------
 * El volcado se va a repetir: la fuente crece y los enlaces se caen. Un script
 * deja la conversion auditable y repetible, y de paso valida lo que el CSV no
 * garantiza (proveedores desconocidos, capitulos duplicados, filas sin enlace).
 *
 * Lo que el CSV NO trae, y por tanto no se inventa aqui:
 *   - duracion por capitulo  -> `min` se omite; la UI ya tolera vacio
 *   - sinopsis               -> cadena vacia
 *   - poster / backdrop      -> /placeholder.svg (la tarjeta pinta iniciales)
 *   - genero fino            -> ver GENEROS mas abajo
 *   - clasificacion por edad -> el modelo cae a 'NR'
 */
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DATA = new URL('../public/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const EPISODES_DIR = join(DATA, 'episodes');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const csvPath = args.find((a) => !a.startsWith('--'));

if (!csvPath) {
  console.error('uso: node scripts/import-lacartoons.mjs <ruta-del-csv> [--dry]');
  process.exit(1);
}

/**
 * El CSV lleva comas dentro de los campos ("El gato / La cabra, Vudu"), asi que
 * no se puede partir por comas. Parser minimo con comillas dobles escapadas
 * como "": son 7 MB, no justifica una dependencia.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') (field += '"'), i++;
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(field), (field = ''));
    else if (c === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) (row.push(field), rows.push(row));

  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = (s) =>
  sinAcentos(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * El CSV identifica el proveedor por HOSTNAME y guarda la URL completa. Aqui se
 * invierte: se extrae el id y se guarda la tupla [proveedor, id] que entiende
 * `src/data/models/embed.js`. Dos hosts del mismo servicio con forma de URL
 * distinta son dos proveedores distintos (cubeembed.com/v/ vs rpmvid /#).
 *
 * `openload.co` no esta: el servicio cerro en 2020 y sus 5 enlaces no van a
 * volver. Esos capitulos entran sin fuente en vez de con una fuente muerta.
 */
const EXTRACTORES = [
  ['okru', /^https?:\/\/(?:www\.)?ok\.ru\/videoembed\/([^/?#]+)/],
  ['rpmvid', /^https?:\/\/cubeembed\.rpmvid\.com\/#([^/?#]+)/],
  ['cubeembed', /^https?:\/\/(?:www\.)?cubeembed\.com\/v\/([^/?#]+)/],
  ['dhtpre', /^https?:\/\/(?:www\.)?dhtpre\.com\/embed\/([^/?#]+)/],
  // sendvid aparece de dos formas: el embed y la pagina de ver. El id es el
  // mismo, asi que la segunda se normaliza a la primera en vez de descartarla.
  ['sendvid', /^https?:\/\/(?:www\.)?sendvid\.com\/(?:embed\/)?([^/?#]+)/],
  ['yourupload', /^https?:\/\/(?:www\.)?yourupload\.com\/embed\/([^/?#]+)/],
];

function extraerFuente(url) {
  for (const [provider, re] of EXTRACTORES) {
    const m = url.match(re);
    if (m) return [provider, m[1]];
  }
  return null;
}

/**
 * `categoria` en el CSV es la CADENA, no el genero: "Cartoon Network",
 * "Nickelodeon", "Marvel". Va a `network`, que es donde el modelo la espera y
 * de donde sale el color del badge (`taxonomy.js`).
 */
const NETWORK = {
  'Cartoon Network': 'Cartoon Network',
  Disney: 'Disney Channel',
  'Fox Kids': 'Fox Kids',
  'Hanna Barbera': 'Hanna Barbera',
  Marvel: 'Marvel',
  Nickelodeon: 'Nickelodeon',
  'Warner Channel': 'Warner Channel',
  Otros: 'Otros',
};

/**
 * GENEROS: el CSV no trae ninguno. Lo unico afirmable de la fuente entera es
 * que es un catalogo de animacion, asi que todos los titulos entran con
 * `animacion` y nada mas. Poner generos finos aqui seria inventarlos; si hacen
 * falta, salen de una pasada aparte con una fuente que si los tenga.
 */
const GENEROS = ['animacion'];

/**
 * Festividades: tampoco vienen en el CSV, pero el titulo del capitulo las
 * delata ("Especial Del Dia De Accion De Gracias"). Las reglas son
 * deliberadamente ESTRICTAS — solo el nombre de la fiesta — porque un falso
 * positivo mete un capitulo cualquiera en la portada de Halloween. Un patron
 * como /terror|fantasma/ daba 632 aciertos, la mayoria basura.
 */
const FESTIVIDADES = [
  ['halloween', /\bhalloween\b|\bnoche de brujas\b|\bdia de brujas\b|\bembrujad/],
  ['navidad', /\bnavid(?:ad|ena|eno)|\bnochebuena\b|\bsanta claus\b|\bpapa noel\b|\bchristmas\b|\bgrinch\b/],
  ['ano-nuevo', /\bano nuevo\b|\bnochevieja\b|\bfin de ano\b/],
  ['san-valentin', /\bsan valentin\b|\bdia del amor\b/],
  ['pascua', /\bpascua\b/],
  ['accion-de-gracias', /\baccion de gracias\b|\bthanksgiving\b/],
  ['dia-de-muertos', /\bdia de (?:los )?muertos\b/],
  ['dia-de-las-madres', /\bdia de (?:las madres|la madre)\b/],
  ['carnaval', /\bcarnaval\b/],
  ['verano', /\bverano\b/],
  ['regreso-a-clases', /\bregreso a clases\b|\bprimer dia de (?:clases|escuela)\b|\bvuelta al colegio\b/],
];

function festividades(titulo) {
  const texto = sinAcentos(titulo).toLowerCase();
  const out = [];
  for (const [slug, re] of FESTIVIDADES) if (re.test(texto)) out.push(slug);
  return out;
}

// --------------------------------------------------------------------- lectura

const filas = parseCsv((await readFile(csvPath, 'utf8')).replace(/^﻿/, ''));

/**
 * Portadas ya importadas, por id. Este script reescribe titles.json entero,
 * asi que sin esto una reimportacion del catalogo borraria el trabajo de
 * scripts/import-portadas.mjs. Las imagenes no vienen de este CSV, pero
 * tampoco son suyas para tirarlas.
 */
const arte = new Map();
try {
  const previos = JSON.parse(await readFile(join(DATA, 'titles.json'), 'utf8'));
  for (const t of previos) if (t.poster || t.backdrop) arte.set(t.id, { poster: t.poster, backdrop: t.backdrop });
} catch {
  /* primera importacion: todavia no hay titles.json */
}

const series = new Map();
const conflictos = [];
const stats = {
  filas: filas.length,
  sinFuente: 0,
  proveedores: new Map(),
  renumerados: 0,
  fest: new Map(),
};

for (const fila of filas) {
  let serie = series.get(fila.serie_id);
  if (!serie) {
    serie = {
      id: `t${fila.serie_id}`,
      slug: slugify(fila.serie),
      name: fila.serie,
      year: Number(fila.anio) || null,
      score: Number(fila.valoracion) || null,
      network: NETWORK[fila.categoria] ?? 'Otros',
      seasons: new Map(), // numero -> Map<capitulo, episodio>
    };
    series.set(fila.serie_id, serie);
  }

  const season = Number(fila.temporada) || 1;
  let capitulos = serie.seasons.get(season);
  if (!capitulos) serie.seasons.set(season, (capitulos = new Map()));

  const n = Number(fila.capitulo_numero) || 0;

  const fuente = fila.url_embed ? extraerFuente(fila.url_embed) : null;
  if (fuente) stats.proveedores.set(fuente[0], (stats.proveedores.get(fuente[0]) ?? 0) + 1);
  else stats.sinFuente++;

  const fest = festividades(fila.titulo);
  for (const slug of fest) stats.fest.set(slug, (stats.fest.get(slug) ?? 0) + 1);

  const episodio = { n, name: fila.titulo.trim() };
  if (fuente) episodio.src = fuente;
  if (fest.length) episodio.fest = fest;

  // El CSV tiene 6 pares (serie, temporada, capitulo) repetidos con titulos
  // distintos: son dos capitulos reales con el mismo numero. Si se dejan, el id
  // derivado (`t20-2-1`) colisiona y la vista de detalle pierde uno.
  //
  // El conflicto se aparta y se resuelve DESPUES de leer el CSV entero, no en
  // el momento: mover el repetido al siguiente hueco libre mientras se lee le
  // roba el numero a un capitulo que aun no ha llegado, y el desplazamiento se
  // propaga en cascada por el resto de la temporada.
  if (n && !capitulos.has(n)) capitulos.set(n, episodio);
  else conflictos.push({ capitulos, episodio });
}

for (const { capitulos, episodio } of conflictos) {
  let n = Math.max(0, ...capitulos.keys()) + 1;
  while (capitulos.has(n)) n++;
  episodio.n = n;
  capitulos.set(n, episodio);
  stats.renumerados++;
}

// --------------------------------------------------------------------- salida

const titles = [];
const ficheros = [];

for (const serie of [...series.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))) {
  const seasons = [...serie.seasons.keys()].sort((a, b) => a - b);
  const episodeCount = seasons.reduce((n, s) => n + serie.seasons.get(s).size, 0);

  const imagenes = arte.get(serie.id);

  titles.push({
    id: serie.id,
    slug: serie.slug,
    name: serie.name,
    year: serie.year,
    kind: 'serie',
    seasonCount: seasons.length,
    episodeCount,
    score: serie.score,
    ...(imagenes?.poster ? { poster: imagenes.poster } : {}),
    ...(imagenes?.backdrop ? { backdrop: imagenes.backdrop } : {}),
    synopsis: '',
    genres: GENEROS,
    network: serie.network,
  });

  ficheros.push({
    file: `${serie.id}.json`,
    body: {
      titleId: serie.id,
      seasons: seasons.map((number) => ({
        number,
        episodes: [...serie.seasons.get(number).values()].sort((a, b) => a.n - b.n),
      })),
    },
  });
}

if (!dry) {
  await mkdir(EPISODES_DIR, { recursive: true });
  // Los ficheros de episodios que ya no respalda ningun titulo se borran: un
  // episodes/t9.json huerfano no lo pide nadie, pero despista al siguiente.
  const vivos = new Set(ficheros.map((f) => f.file));
  for (const file of await readdir(EPISODES_DIR)) {
    if (file.endsWith('.json') && !vivos.has(file)) await unlink(join(EPISODES_DIR, file));
  }
  await writeFile(join(DATA, 'titles.json'), JSON.stringify(titles, null, 2), 'utf8');
  for (const { file, body } of ficheros) {
    await writeFile(join(EPISODES_DIR, file), JSON.stringify(body), 'utf8');
  }
}

const kb = (obj) => `${(Buffer.byteLength(JSON.stringify(obj)) / 1024).toFixed(0)} KB`;

console.log(`\n${dry ? '[dry] ' : ''}importacion desde ${csvPath}`);
console.log(`  filas leidas       : ${stats.filas}`);
console.log(`  titulos            : ${titles.length}  (titles.json ${kb(titles)})`);
console.log(`  capitulos          : ${titles.reduce((n, t) => n + t.episodeCount, 0)}`);
console.log(`  renumerados        : ${stats.renumerados}`);
console.log(`  sin fuente usable  : ${stats.sinFuente}`);
console.log(`  portadas conservadas: ${titles.filter((t) => t.poster || t.backdrop).length}`);
console.log('  fuentes por proveedor:');
for (const [p, n] of [...stats.proveedores].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${p.padEnd(12)} ${n}`);
}
console.log('  capitulos por festividad:');
for (const [slug, n] of [...stats.fest].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${slug.padEnd(20)} ${n}`);
}
console.log(`\nsiguiente paso: npm run data   (regenera picks.json)`);

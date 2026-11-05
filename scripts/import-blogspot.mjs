/**
 * Importa el volcado CSV de un blog de Blogspot a los JSON del proyecto.
 *
 *   node scripts/import-blogspot.mjs <ruta-del-csv> <clave-de-serie>
 *   node scripts/import-blogspot.mjs <ruta-del-csv> <clave-de-serie> --dry
 *
 * Hermano de import-lacartoons.mjs, con una diferencia que manda en todo el
 * diseño: aquel convierte un catalogo entero (503 series en un CSV), este
 * convierte UNA serie. El CSV no trae nombre de serie, ni año, ni cadena
 * —solo capitulos— porque el blog entero ES la serie.
 *
 * Por eso es un PARCHE sobre titles.json y no una reescritura: añade o
 * actualiza un titulo y escribe su episodes/<id>.json sin tocar los otros 503.
 * Volver a correrlo cuando el blog crezca es seguro.
 *
 * Los metadatos que el CSV no tiene viven en SERIES, aqui abajo. Ese registro
 * es tambien la constancia de DE DONDE salio cada serie: dentro de un año,
 * saber que `t518` vino de verlooneytunesshow.blogspot.com es la diferencia
 * entre poder actualizarla y no.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DATA = new URL('../public/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const EPISODES_DIR = join(DATA, 'episodes');

/**
 * Lo que el CSV no puede decir. `origen` no lo usa el codigo: esta para el
 * siguiente que venga a reimportar.
 *
 * `sinopsis`, `score` y las dos imagenes no salen de ninguna columna: son los
 * campos que NO son un hecho del volcado, y por eso se declaran aqui, donde se
 * ve de quien son y de donde vienen, en vez de aparecer sin padre en el JSON.
 *
 * `score` importa mas de lo que parece. build-picks.mjs ordena cada fila de
 * festividad por la puntuacion del titulo y corta a 60; un titulo sin `score`
 * cuenta como 0 y nunca entra en la portada de Navidad por mucho que tenga un
 * especial navideño. Dejarlo vacio no es neutral, es enterrarlo.
 */
const SERIES = {
  'looney-tunes-show': {
    id: 't518',
    slug: 'el-show-de-los-looney-tunes',
    name: 'El Show de los Looney Tunes',
    year: 2011,
    network: 'Warner Channel',
    genres: ['animacion'],
    // TMDB 32605. El volcado del blog no trae puntuacion; esta es la de TMDB
    // (79 % en la temporada 2) redondeada a la escala entera que usa el resto
    // del catalogo. Mismo sitio del que salen las dos imagenes.
    score: 8,
    poster: 'vl9ZMgLSPib1vzuWCXEoHXZM7ub.jpg',
    backdrop: 'gAZ0mAt2Fe3EB4hREXsD5jlfZCR.jpg',
    synopsis:
      'Bugs Bunny y el Pato Lucas dejan el bosque y se mudan a un barrio residencial, ' +
      'donde comparten casa y aguantan al resto de los Looney Tunes como vecinos. ' +
      'La serie cambia la persecucion clasica por el humor de convivencia: los gags ' +
      'salen de pagar facturas, sacar la licencia de conducir o sobrevivir a una cita doble.',
    origen: 'verlooneytunesshow.blogspot.com',
  },
};

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const [csvPath, clave] = args.filter((a) => !a.startsWith('--'));

if (!csvPath || !clave) {
  console.error('uso: node scripts/import-blogspot.mjs <ruta-del-csv> <clave-de-serie> [--dry]');
  console.error(`series declaradas: ${Object.keys(SERIES).join(', ')}`);
  process.exit(1);
}

const serie = SERIES[clave];
if (!serie) {
  console.error(`serie "${clave}" no declarada en SERIES (scripts/import-blogspot.mjs)`);
  console.error(`declaradas: ${Object.keys(SERIES).join(', ')}`);
  process.exit(1);
}

/** Mismo parser minimo que los otros importadores: comillas y comas. */
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

/**
 * Blogspot aloja el video en el propio Blogger: el embed es `video.g` con un
 * token opaco. Es el unico proveedor de este volcado, pero el extractor es una
 * lista como en el otro importador porque un blog suele mezclar alojamientos.
 */
const EXTRACTORES = [
  ['blogger', /^https?:\/\/(?:www\.)?blogger\.com\/video\.g\?(\S+)/],
  ['okru', /^https?:\/\/(?:www\.)?ok\.ru\/videoembed\/([^/?#]+)/],
  ['dailymotion', /^https?:\/\/(?:www\.)?dailymotion\.com\/embed\/video\/([^/?#]+)/],
  ['yourupload', /^https?:\/\/(?:www\.)?yourupload\.com\/embed\/([^/?#]+)/],
];

function extraerFuente(url) {
  for (const [provider, re] of EXTRACTORES) {
    const m = url.trim().match(re);
    if (m) return [provider, m[1]];
  }
  return null;
}

/**
 * El enlace del CSV no sirve, y conviene entender por que antes de quitar esta
 * parte. Un volcado guarda el `video.g?token=...` del dia que se hizo, pero el
 * token de Blogger caduca: los 34 del volcado original ya no reproducian. Y le
 * falta ademas el `&origin=<dominio del blog>` que el blog SI pone y que el
 * reproductor de YouTube necesita; sin el se queda en buffering para siempre y
 * acaba en "Se produjo un error. Vuelve a intentarlo mas tarde".
 *
 * Asi que la fuente de verdad es la entrada del blog, no la columna del CSV:
 * se relee el `<iframe class="b-hbp-video">` de cada entrada. Son estables
 * entre cargas, asi que se pueden guardar; cuando vuelvan a caducar, basta
 * volver a correr el importador.
 */
const CONCURRENCIA = 6;

async function embedVivo(entrada) {
  const res = await fetch(entrada, { headers: { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/<iframe[^>]*class="[^"]*b-hbp-video[^"]*"[^>]*src="([^"]+)"/);
  if (!m) throw new Error('la entrada ya no tiene iframe de video');
  return m[1].replace(/&amp;/g, '&');
}

/** Rellena `fila.iframe_vivo` en paralelo, sin reventar el blog a peticiones. */
async function refrescarEmbeds(filas, stats) {
  const cola = filas.filter((f) => f.url_entrada);
  await Promise.all(
    Array.from({ length: CONCURRENCIA }, async () => {
      while (cola.length) {
        const fila = cola.shift();
        try {
          fila.iframe_vivo = await embedVivo(fila.url_entrada);
          stats.refrescados++;
        } catch (err) {
          stats.sinRefrescar.push(`${fila.titulo}: ${err.message}`);
        }
      }
    }),
  );
}

/**
 * Hosts de imagen que ya no existen. Misma decision que `openload.co` en el
 * importador de lacartoons: un enlace demostrado muerto no entra como dato
 * roto, simplemente no entra. postimg.org movio todo a postimg.cc y sus
 * subdominios `sNN.` llevan años sin resolver.
 *
 * El resto sube a https: servimg sirve las mismas imagenes por TLS, y una web
 * HTTPS no carga una imagen http —el navegador la bloquea por contenido mixto
 * sin decirle nada al usuario—.
 */
const IMAGEN_MUERTA = [/^s\d+\.postimg\.org$/i];

function fotograma(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (IMAGEN_MUERTA.some((re) => re.test(u.hostname))) return null;
  u.protocol = 'https:';
  return u.href;
}

/**
 * Festividades: mismas reglas estrictas que el importador de lacartoons. Solo
 * el nombre de la fiesta — un patron amplio mete un capitulo cualquiera en la
 * portada de Halloween.
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
  return FESTIVIDADES.filter(([, re]) => re.test(texto)).map(([slug]) => slug);
}

// --------------------------------------------------------------------- lectura

const filas = parseCsv((await readFile(csvPath, 'utf8')).replace(/^﻿/, ''));

/**
 * EL ORDEN, que es la decision que mas se nota en la interfaz.
 *
 * El CSV no trae temporada ni numero de capitulo: un blog es una lista de
 * entradas y las publica de la mas nueva a la mas vieja. Lo unico que la
 * fuente afirma sobre el orden es la fecha de publicacion.
 *
 * Asi que se numera por fecha ASCENDENTE —la entrada mas vieja es el capitulo
 * 1— y, dentro del mismo dia, invirtiendo el orden del CSV: varias entradas
 * del mismo dia vienen tambien de la mas nueva a la mas vieja, y darles la
 * vuelta restaura el orden en que se publicaron.
 *
 * Esto es el orden del BLOG, no el de emision oficial. Son distintos y el CSV
 * no permite reconstruir el segundo: deducirlo del nombre del fichero de la
 * portada (`tlts_212.png`) es tentador, pero el volcado mezcla tres
 * numeraciones de tres alojamientos distintos y se contradicen entre si.
 * Partir una temporada 2 a partir de eso seria afirmar algo que la fuente no
 * dice, asi que entra todo como una temporada.
 */
const ordenadas = filas
  .map((fila, i) => ({ fila, i }))
  .sort((a, b) => (a.fila.fecha < b.fila.fecha ? -1 : a.fila.fecha > b.fila.fecha ? 1 : b.i - a.i));

const episodes = [];
const stats = {
  filas: filas.length,
  sinFuente: 0,
  proveedores: new Map(),
  stills: 0,
  stillsMuertos: 0,
  partes: 0,
  fest: new Map(),
  refrescados: 0,
  sinRefrescar: [],
};

// Por defecto se releen los embeds del blog (ver `embedVivo`). `--sin-red` usa
// la columna del CSV tal cual, que sirve para un `--dry` rapido pero produce
// enlaces que ya no reproducen.
if (!args.includes('--sin-red')) {
  console.log(`leyendo el embed actual de ${filas.length} entradas del blog...`);
  await refrescarEmbeds(filas, stats);
}

for (const [indice, { fila }] of ordenadas.entries()) {
  // `parte` esta vacio en el volcado actual. Cuando no lo este, se pega al
  // nombre en vez de abrir un capitulo aparte: una "Parte 2" es la segunda
  // mitad del mismo capitulo, no el siguiente.
  const parte = fila.parte?.trim();
  if (parte) stats.partes++;
  const name = parte ? `${fila.titulo.trim()} (${parte})` : fila.titulo.trim();

  // El embed recien leido manda sobre el del volcado.
  const enlace = fila.iframe_vivo || fila.iframe_src;
  const fuente = enlace ? extraerFuente(enlace) : null;
  if (fuente) stats.proveedores.set(fuente[0], (stats.proveedores.get(fuente[0]) ?? 0) + 1);
  else stats.sinFuente++;

  const st = fotograma(fila.portada);
  if (st) stats.stills++;
  else if (fila.portada) stats.stillsMuertos++;

  const fest = festividades(name);
  for (const slug of fest) stats.fest.set(slug, (stats.fest.get(slug) ?? 0) + 1);

  const episodio = { n: indice + 1, name };
  if (fuente) episodio.src = fuente;
  if (st) episodio.st = st;
  if (fest.length) episodio.fest = fest;
  episodes.push(episodio);
}

// --------------------------------------------------------------------- salida

const title = {
  id: serie.id,
  slug: serie.slug,
  name: serie.name,
  year: serie.year,
  kind: 'serie',
  seasonCount: 1,
  episodeCount: episodes.length,
  ...(serie.score != null ? { score: serie.score } : {}),
  ...(serie.poster ? { poster: serie.poster } : {}),
  ...(serie.backdrop ? { backdrop: serie.backdrop } : {}),
  synopsis: serie.synopsis ?? '',
  genres: serie.genres,
  network: serie.network,
};

const titles = JSON.parse(await readFile(join(DATA, 'titles.json'), 'utf8'));

// Un id ya usado por OTRA serie seria una colision silenciosa: el titulo viejo
// desaparece del catalogo y su episodes/<id>.json se sobrescribe.
const previo = titles.findIndex((t) => t.id === title.id);
if (previo !== -1 && titles[previo].slug !== title.slug) {
  console.error(`! ${title.id} ya es "${titles[previo].name}" en titles.json; elige otro id`);
  process.exit(1);
}
const chocaSlug = titles.findIndex((t) => t.slug === title.slug && t.id !== title.id);
if (chocaSlug !== -1) {
  console.error(`! el slug "${title.slug}" ya es de ${titles[chocaSlug].id}; la ruta /serie/<slug> colisiona`);
  process.exit(1);
}

if (previo === -1) titles.push(title);
else titles[previo] = title;
titles.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

const body = { titleId: title.id, seasons: [{ number: 1, episodes }] };

if (!dry) {
  await mkdir(EPISODES_DIR, { recursive: true });
  await writeFile(join(DATA, 'titles.json'), JSON.stringify(titles, null, 2), 'utf8');
  await writeFile(join(EPISODES_DIR, `${title.id}.json`), JSON.stringify(body), 'utf8');
}

console.log(`\n${dry ? '[dry] ' : ''}${serie.name}  (${serie.origen})`);
console.log(`  ${previo === -1 ? 'alta nueva' : 'actualiza '}       : ${title.id}  /serie/${title.slug}`);
console.log(`  filas leidas      : ${stats.filas}`);
console.log(`  capitulos         : ${episodes.length}  en 1 temporada`);
console.log(`  orden             : ${ordenadas[0].fila.fecha} -> ${ordenadas.at(-1).fila.fecha} (publicacion del blog)`);
console.log(`  embeds releidos   : ${stats.refrescados} / ${stats.filas}`);
if (stats.sinRefrescar.length) {
  console.log(`  ! no se pudo releer (se queda el enlace viejo del CSV, que puede no reproducir):`);
  for (const aviso of stats.sinRefrescar) console.log(`      ${aviso}`);
}
console.log(`  sin fuente        : ${stats.sinFuente}`);
console.log(
  `  fotogramas        : ${stats.stills}${stats.stillsMuertos ? `  (${stats.stillsMuertos} descartados: host muerto)` : ''}`,
);
if (stats.partes) console.log(`  capitulos en partes: ${stats.partes}  (revisalos: el nombre lleva la parte)`);
console.log('  fuentes por proveedor:');
for (const [p, n] of [...stats.proveedores].sort((a, b) => b[1] - a[1])) console.log(`    ${p.padEnd(12)} ${n}`);
if (stats.fest.size) {
  console.log('  capitulos por festividad:');
  for (const [slug, n] of [...stats.fest].sort((a, b) => b[1] - a[1])) console.log(`    ${slug.padEnd(20)} ${n}`);
}
console.log(`\nsiguiente paso: npm run data   (regenera picks.json)`);

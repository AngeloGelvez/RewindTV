/**
 * Funde una lista de canales en vivo con public/data/channels.json.
 *
 *   node scripts/import-canales.mjs <ruta-del-csv>
 *   node scripts/import-canales.mjs <ruta-del-csv> --dry
 *
 * El CSV de entrada viene de un verificador externo y usa punto y coma:
 *
 *   canal;grupo;tipo;listas;url;logo
 *
 * SUMA, no reemplaza: lo que ya estaba se queda tal cual, con su `checkedAt`.
 * Un canal nuevo entra sin sello, y es `npm run channels` quien decide despues
 * si sobrevive. Aqui no se verifica nada: este script normaliza, el otro
 * comprueba. Mezclar las dos cosas haria que una lista de 3.800 lineas
 * tardara media hora en entrar.
 *
 * Que se descarta y por que
 * -------------------------
 *  RADIO        casi mil emisoras (grupos Radio_*, streams .aac/.mp3). Esto es
 *               un catalogo de television; una emisora sin imagen en una
 *               rejilla de tarjetas con logo es una tarjeta que no hace nada.
 *  http://      el navegador bloquea mixed content en una web HTTPS, sin aviso
 *               util. Entrarian solo para fallar al pulsarlas.
 *  no-HLS       .mpd (DASH) y descargas sueltas: el reproductor habla HLS y
 *               ficheros, pero un canal "en vivo" que es un mp4 en bucle no es
 *               un canal.
 *  repetidos    por URL y por id, contra el fichero y dentro del propio CSV.
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../public/data/channels.json', import.meta.url);

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const csvPath = args.find((a) => !a.startsWith('--'));

if (!csvPath) {
  console.error('uso: node scripts/import-canales.mjs <ruta-del-csv> [--dry]');
  process.exit(1);
}

/** CSV con punto y coma. Hay campos entrecomillados que llevan ; dentro. */
function parseCsv(text, sep = ';') {
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
    else if (c === sep) (row.push(field), (field = ''));
    else if (c === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) (row.push(field), rows.push(row));

  const head = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = (s) =>
  sinAcentos(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * El nombre trae cuatro datos pegados, con las mismas convenciones que ya
 * normalizamos del m3u original (ver docs/canales.md):
 *
 *   "Telefe (1080p) [Not 24/7] | AR"  ->  nombre, calidad, franjas, pais
 */
function partirNombre(bruto) {
  let name = bruto;
  let country = null;
  let quality = null;
  let always = true;

  const pais = name.match(/\|\s*([A-Za-z]{2})\s*$/);
  if (pais) {
    country = pais[1].toLowerCase();
    name = name.slice(0, pais.index);
  }

  const cal = name.match(/\((\d{3,4}p)\)/i);
  if (cal) {
    quality = cal[1].toLowerCase();
    name = name.replace(cal[0], ' ');
  }

  if (/\[not 24\/7\]/i.test(name)) {
    always = false;
    name = name.replace(/\[not 24\/7\]/i, ' ');
  }

  // Lo que quede entre corchetes es ruido de la lista de origen.
  name = name.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  return { name, country, quality, always };
}

/**
 * `grupo` mezcla categoria y genero, y puede traer varios separados por ;.
 * Nuestro esquema tiene CUATRO categorias y una lista de generos aparte: la
 * categoria sale del primer grupo reconocido y el resto cae a generos.
 */
const CATEGORIA = {
  sports: 'deportes', deportes: 'deportes', deporte: 'deportes', futbol: 'deportes',
  music: 'musica', musica: 'musica', musicales: 'musica', musical: 'musica',
  entertainment: 'entretenimiento', entretenimiento: 'entretenimiento',
  movies: 'entretenimiento', cine: 'entretenimiento', series: 'entretenimiento',
  kids: 'entretenimiento', infantil: 'entretenimiento', anime: 'entretenimiento',
  religious: 'entretenimiento', religioso: 'entretenimiento',
  documentary: 'entretenimiento', documental: 'entretenimiento',
  culture: 'entretenimiento', cultura: 'entretenimiento', comedy: 'entretenimiento',
  lifestyle: 'entretenimiento', travel: 'entretenimiento', outdoor: 'entretenimiento',
  education: 'entretenimiento', educativo: 'entretenimiento', classic: 'entretenimiento',
  general: 'general', news: 'general', noticias: 'general', public: 'general',
};

const GENERO = {
  movies: 'cine', cine: 'cine', series: 'series', kids: 'infantil', infantil: 'infantil',
  anime: 'anime', religious: 'religioso', religioso: 'religioso',
  documentary: 'documental', documental: 'documental', news: 'noticias',
  noticias: 'noticias', education: 'educativo', educativo: 'educativo',
  culture: 'cultura', cultura: 'cultura', comedy: 'comedia', music: 'musica',
  sports: 'deportes', lifestyle: 'estilo-de-vida', travel: 'viajes', classic: 'clasicos',
};

function clasificar(grupo) {
  const partes = grupo
    .split(/[;,/|]/)
    .map((p) => slugify(p))
    .filter((p) => p && p !== 'undefined');

  let category = null;
  const genres = [];
  for (const p of partes) {
    if (!category && CATEGORIA[p]) category = CATEGORIA[p];
    const g = GENERO[p];
    if (g && !genres.includes(g)) genres.push(g);
  }
  // Sin grupo reconocible, "general" es lo honesto: no inventamos una
  // categoria que la fuente no da.
  return { category: category ?? 'general', genres };
}

const esRadio = (fila) =>
  /^radio/i.test(fila.grupo) ||
  /^radios\b/i.test(fila.grupo) ||
  /\b(radio|emisora)s?\b/i.test(fila.listas) ||
  /\.(aac|mp3|ogg)(\?|$)/i.test(fila.url);

// ------------------------------------------------------------------ proceso

const filas = parseCsv((await readFile(csvPath, 'utf8')).replace(/^﻿/, ''));
const canales = JSON.parse(await readFile(FILE, 'utf8'));

const porUrl = new Set(canales.map((c) => c.stream));
const porId = new Set(canales.map((c) => c.id));

const stats = { filas: filas.length, radio: 0, http: 0, noHls: 0, repetidos: 0, renombrados: 0, sinNombre: 0, nuevos: 0 };
const nuevos = [];

for (const fila of filas) {
  if (!fila.url || !fila.canal) {
    stats.sinNombre++;
    continue;
  }
  if (esRadio(fila)) {
    stats.radio++;
    continue;
  }
  if (!fila.url.startsWith('https://')) {
    stats.http++;
    continue;
  }
  if (!/\.m3u8(\?|$)/i.test(fila.url)) {
    stats.noHls++;
    continue;
  }
  if (porUrl.has(fila.url)) {
    stats.repetidos++;
    continue;
  }

  const { name, country, quality, always } = partirNombre(fila.canal);
  if (!name) {
    stats.sinNombre++;
    continue;
  }

  // Dos canales distintos pueden compartir nombre (una cadena con dos señales):
  // el id se numera en vez de pisarse.
  let id = slugify(name);
  if (!id) id = `canal-${nuevos.length + 1}`;
  if (porId.has(id)) {
    let n = 2;
    while (porId.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
    stats.renombrados++;
  }

  const { category, genres } = clasificar(fila.grupo);

  porUrl.add(fila.url);
  porId.add(id);
  nuevos.push({
    id,
    name,
    category,
    genres,
    country,
    quality,
    always,
    logo: fila.logo || null,
    stream: fila.url,
  });
  stats.nuevos++;
}

const salida = [...canales, ...nuevos].sort(
  (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
);

if (!dry) await writeFile(FILE, JSON.stringify(salida, null, 2), 'utf8');

const cuenta = (lista, campo) =>
  lista.reduce((m, c) => ((m[c[campo]] = (m[c[campo]] ?? 0) + 1), m), {});

console.log(`\n${dry ? '[dry] ' : ''}canales desde ${csvPath}`);
console.log(`  filas leidas       : ${stats.filas}`);
console.log(`  descartadas:`);
console.log(`    radio            : ${stats.radio}`);
console.log(`    por http://      : ${stats.http}   (mixed content)`);
console.log(`    no son HLS       : ${stats.noHls}`);
console.log(`    ya estaban       : ${stats.repetidos}   (misma url)`);
console.log(`  con id numerado    : ${stats.renombrados}  (mismo nombre, señal distinta)`);
console.log(`    sin nombre o url : ${stats.sinNombre}`);
console.log(`  nuevos             : ${stats.nuevos}`);
console.log(`  total en el fichero: ${salida.length}  (${(Buffer.byteLength(JSON.stringify(salida)) / 1024).toFixed(0)} KB)`);
console.log(`  por categoria      : ${JSON.stringify(cuenta(salida, 'category'))}`);
console.log(`  sin logo           : ${salida.filter((c) => !c.logo).length}`);
console.log(`\nsiguiente paso: npm run channels   (verifica y sella los nuevos)`);

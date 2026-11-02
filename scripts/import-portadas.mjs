/**
 * Mete las portadas del volcado de TMDB en public/data/titles.json.
 *
 *   node scripts/import-portadas.mjs <ruta-del-csv>
 *   node scripts/import-portadas.mjs <ruta-del-csv> --dry
 *
 * El CSV trae por serie una portada VERTICAL (para la ficha) y una APAISADA
 * (para el hero y las tarjetas). Se guarda solo el nombre del fichero en TMDB,
 * no la URL: el prefijo se arma en `src/data/models/images.js`, que es donde
 * tambien se decide el ancho. Ver ahi el porque.
 *
 * Es un PARCHE sobre titles.json, no una reescritura: respeta todo lo que ya
 * hay (nombre, año, cadena, numero de capitulos) y solo toca `poster` y
 * `backdrop`. Asi se puede volver a correr cuando el volcado crezca.
 *
 * Una serie sin portada no recibe el campo. No se le pone una imagen generica:
 * los componentes ya dibujan el color de la cadena con las iniciales, que
 * distingue una tarjeta de otra; un marcador repetido 503 veces, no.
 */
import { readFile, writeFile } from 'node:fs/promises';

const DATA = new URL('../public/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const csvPath = args.find((a) => !a.startsWith('--'));

if (!csvPath) {
  console.error('uso: node scripts/import-portadas.mjs <ruta-del-csv> [--dry]');
  process.exit(1);
}

/** Mismo parser minimo que el importador del catalogo: comillas y comas. */
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

/** De la URL de TMDB solo interesa el nombre del fichero. */
const ficheroTmdb = (url) => {
  if (!url) return null;
  const m = url.match(/\/t\/p\/[^/]+\/([^/?#]+)$/);
  return m ? m[1] : null;
};

const filas = parseCsv((await readFile(csvPath, 'utf8')).replace(/^﻿/, ''));
const titles = JSON.parse(await readFile(`${DATA}titles.json`, 'utf8'));
const byId = new Map(titles.map((t) => [t.id, t]));

const stats = { conPoster: 0, conBackdrop: 0, sinPoster: [], sinBackdrop: [], huerfanas: [], revisar: [] };

for (const fila of filas) {
  const title = byId.get(`t${fila.serie_id}`);
  if (!title) {
    stats.huerfanas.push(`${fila.serie_id} ${fila.serie}`);
    continue;
  }

  // La apaisada se toma en w1280 y no en "original": el original de TMDB pasa
  // de los 3 MB y va de fondo de un hero que se ve una vez.
  const poster = ficheroTmdb(fila.portada_vertical);
  const backdrop = ficheroTmdb(fila.portada_horizontal_1280 || fila.portada_horizontal);

  if (poster) (title.poster = poster), stats.conPoster++;
  else (delete title.poster, stats.sinPoster.push(title.name));

  if (backdrop) (title.backdrop = backdrop), stats.conBackdrop++;
  else (delete title.backdrop, stats.sinBackdrop.push(title.name));

  if (fila.revisar?.toLowerCase() === 'si') {
    stats.revisar.push(`${title.name}${fila.nota ? ` — ${fila.nota}` : ''}`);
  }
}

if (!dry) await writeFile(`${DATA}titles.json`, JSON.stringify(titles, null, 2), 'utf8');

const kb = (o) => `${(Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(0)} KB`;

console.log(`\n${dry ? '[dry] ' : ''}portadas desde ${csvPath}`);
console.log(`  filas              : ${filas.length}`);
console.log(`  con portada        : ${stats.conPoster}/${titles.length}`);
console.log(`  con fondo apaisado : ${stats.conBackdrop}/${titles.length}`);
console.log(`  titles.json        : ${kb(titles)}`);
if (stats.huerfanas.length) console.log(`  ! sin titulo en el catalogo: ${stats.huerfanas.join(', ')}`);
if (stats.sinPoster.length) console.log(`  sin portada vertical : ${stats.sinPoster.join(', ')}`);
if (stats.sinBackdrop.length) console.log(`  sin fondo apaisado   : ${stats.sinBackdrop.join(', ')}`);

// Las marcadas para revisar se listan SIEMPRE: son coincidencias que el
// volcado no da por seguras, y nadie las va a mirar si no salen por aqui.
if (stats.revisar.length) {
  console.log(`\n  ${stats.revisar.length} marcadas para revisar:`);
  for (const r of stats.revisar) console.log(`    - ${r}`);
}

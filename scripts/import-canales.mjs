/**
 * Funde una lista de canales en vivo con la lista maestra (data/channels.json).
 *
 *   node scripts/import-canales.mjs <ruta-del-csv>
 *   node scripts/import-canales.mjs <ruta-del-csv> --dry
 *
 * El CSV de entrada viene de un verificador externo y usa punto y coma:
 *
 *   canal;grupo;tipo;listas;url;logo
 *
 * SUMA, no reemplaza: lo que ya estaba se queda tal cual, con su `checkedAt` y
 * su `webPlayable`. Un canal nuevo entra sin sello, y es `npm run channels`
 * quien decide despues si sobrevive. Aqui no se verifica nada: este script
 * normaliza, el otro comprueba. Mezclar las dos cosas haria que una lista de
 * 10.000 lineas tardara media hora en entrar.
 *
 * Reclasifica TODO, no solo lo nuevo: las categorias pasaron de cuatro a diez
 * (ver scripts/lib/canales.mjs) y los canales de antes tienen que caer en
 * ellas, o "general" seguiria teniendo medio catalogo.
 *
 * Que se descarta y por que
 * -------------------------
 *  RADIO        casi mil emisoras (grupos Radio_*, streams .aac/.mp3) y otras
 *               tantas con "Radio" en el nombre y sin grupo. Esto es un
 *               catalogo de television; una emisora sin imagen en una rejilla
 *               de tarjetas con logo es una tarjeta que no hace nada.
 *  http://      el navegador bloquea mixed content en una web HTTPS, sin aviso
 *               util. Entrarian solo para fallar al pulsarlas.
 *  no-HLS       .mpd (DASH) y descargas sueltas: el reproductor habla HLS y
 *               ficheros, pero un canal "en vivo" que es un mp4 en bucle no es
 *               un canal.
 *  repetidos    por URL, contra el fichero y dentro del propio CSV.
 */
import { readFile } from 'node:fs/promises';
import { categoriaDe, generosDe, esRadio, slugify, leerMaestro, escribirMaestro } from './lib/canales.mjs';

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

  const cal = name.match(/\((\d{3,4}[pi])\)/i);
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
 * Logos inservibles: la lista trae `http://127.0.0.1/` y similares, que no
 * apuntan a ninguna imagen. Es mejor un null —la tarjeta pinta las iniciales—
 * que una peticion a localhost en cada tarjeta de quien abre la web.
 */
const logoUtil = (url) => {
  if (!url) return null;
  try {
    const { hostname, pathname } = new URL(url);
    if (/^(localhost|127.|0.0.0.0|10.|192.168.)/.test(hostname)) return null;
    if (pathname === '/' || pathname === '') return null;
    return url;
  } catch {
    return null;
  }
};

/** Los grupos de una fila: pueden venir varios separados por ; o , */
const gruposDe = (grupo) =>
  grupo
    .split(/[;,/|]/)
    .map((g) => g.trim())
    .filter((g) => g && !/^undefined$/i.test(g));

// ------------------------------------------------------------------ proceso

const filas = parseCsv((await readFile(csvPath, 'utf8')).replace(/^﻿/, ''));
const canales = await leerMaestro();

const porUrl = new Set(canales.map((c) => c.stream));
const porId = new Set(canales.map((c) => c.id));

const stats = {
  filas: filas.length, radio: 0, http: 0, noHls: 0, repetidos: 0,
  renombrados: 0, sinNombre: 0, nuevos: 0, reclasificados: 0,
};
const nuevos = [];

for (const fila of filas) {
  if (!fila.url || !fila.canal) {
    stats.sinNombre++;
    continue;
  }
  const { name, country, quality, always } = partirNombre(fila.canal);

  if (esRadio({ grupo: fila.grupo, listas: fila.listas, url: fila.url, nombre: name })) {
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
  // Un nombre hecho de '?' es una codificacion perdida en el origen: no hay nada
  // que mostrar ni de donde recuperarlo.
  if (!name || !/[p{L}p{N}]/u.test(name.replace(/?/g, ''))) {
    stats.sinNombre++;
    continue;
  }

  // Dos canales distintos pueden compartir nombre (una cadena con dos señales):
  // el id se numera en vez de pisarse.
  let id = slugify(name) || `canal-${nuevos.length + 1}`;
  if (porId.has(id)) {
    let n = 2;
    while (porId.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
    stats.renombrados++;
  }

  const grupos = gruposDe(fila.grupo);

  porUrl.add(fila.stream ?? fila.url);
  porId.add(id);
  nuevos.push({
    id,
    name,
    category: categoriaDe({ senales: grupos, nombre: name }),
    genres: generosDe(grupos),
    country,
    quality,
    always,
    logo: logoUtil(fila.logo),
    stream: fila.url,
  });
  stats.nuevos++;
}

// Los de antes tambien: las categorias cambiaron. Se usan sus generos ya
// guardados y su categoria anterior como senales, y el nombre como ultimo
// recurso.
for (const canal of canales) {
  const nueva = categoriaDe({
    senales: [...(canal.genres ?? []), canal.category],
    nombre: canal.name,
  });
  if (nueva !== canal.category) {
    canal.category = nueva;
    stats.reclasificados++;
  }
}

const salida = [...canales, ...nuevos];
if (!dry) await escribirMaestro(salida);

const cuenta = (lista, campo) =>
  lista.reduce((m, c) => ((m[c[campo]] = (m[c[campo]] ?? 0) + 1), m), {});

console.log(`\n${dry ? '[dry] ' : ''}canales desde ${csvPath}`);
console.log(`  filas leidas       : ${stats.filas}`);
console.log(`  descartadas:`);
console.log(`    radio            : ${stats.radio}`);
console.log(`    por http://      : ${stats.http}   (mixed content)`);
console.log(`    no son HLS       : ${stats.noHls}`);
console.log(`    ya estaban       : ${stats.repetidos}   (misma url)`);
console.log(`    sin nombre o url : ${stats.sinNombre}`);
console.log(`  con id numerado    : ${stats.renombrados}  (mismo nombre, señal distinta)`);
console.log(`  nuevos             : ${stats.nuevos}`);
console.log(`  reclasificados     : ${stats.reclasificados}  de los ${canales.length} que ya estaban`);
console.log(`  total en el fichero: ${salida.length}`);
console.log(`  por categoria      : ${JSON.stringify(cuenta(salida, 'category'))}`);
console.log(`  sin logo           : ${salida.filter((c) => !c.logo).length}`);
console.log(`\nsiguiente paso: npm run channels   (verifica y sella los nuevos)`);

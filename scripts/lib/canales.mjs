/**
 * Piezas comunes de los scripts de canales: donde vive la lista, como se
 * clasifica y como se lee y escribe.
 *
 * La lista MAESTRA vive en `data/channels.json`, FUERA de `public/`. Es la
 * fuente de verdad que tocan los scripts (importar, verificar, marcar). Lo que
 * sirve la web son los trozos que genera `scripts/build-channels.mjs` en
 * `public/data/channels/`, y esos no se versionan: se regeneran.
 *
 * Es el mismo reparto que `picks.json`: un dato derivado no se edita a mano.
 * La diferencia es que aqui el maestro pesa casi 2 MB, y partirlo en trozos por
 * categoria es lo que evita que quien abre "En vivo" se baje los 8.000 canales.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';

export const MAESTRO = new URL('../../data/channels.json', import.meta.url);
export const SALIDA = new URL('../../public/data/channels/', import.meta.url);

/**
 * Las categorias, EN EL ORDEN en que salen como pestanas y en que "Todos"
 * recorre la lista.
 *
 * Eran cuatro (deportes, entretenimiento, general, musica) y con 8.000 canales
 * "general" tenia 4.500: una categoria que no divide nada. Tampoco se pueden
 * hacer cuarenta pestanas, asi que son diez, cada una con un tema reconocible.
 * "general" es la ultima porque es el cajon de lo que no dijo de que va, y no
 * la primera que ve quien entra a "Todos".
 */
export const CATEGORIAS = [
  { slug: 'general', label: 'Generalistas' },
  { slug: 'entretenimiento', label: 'Entretenimiento' },
  { slug: 'noticias', label: 'Noticias' },
  { slug: 'deportes', label: 'Deportes' },
  { slug: 'cine', label: 'Cine' },
  { slug: 'series', label: 'Series' },
  { slug: 'infantil', label: 'Infantil' },
  { slug: 'musica', label: 'Musica' },
  { slug: 'documentales', label: 'Documentales' },
  { slug: 'religioso', label: 'Religioso' },
];

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const slugify = (s) =>
  sinAcentos(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Cada senal (un grupo del CSV, un genero ya guardado o la categoria anterior)
 * apunta a UNA categoria. Es una sola tabla porque las tres fuentes dicen lo
 * mismo con palabras distintas: "Movies", "cine" y "vod-movies-en" son cine.
 */
const SENAL = {
  // noticias y actualidad
  news: 'noticias', noticias: 'noticias', legislative: 'noticias', legislativo: 'noticias',
  weather: 'noticias', clima: 'noticias', business: 'noticias', negocios: 'noticias',
  // deporte
  sports: 'deportes', deportes: 'deportes', deporte: 'deportes', futbol: 'deportes',
  // cine y series
  movies: 'cine', 'vod-movies-en': 'cine', cine: 'cine', classic: 'cine', clasicos: 'cine',
  series: 'series',
  // infantil
  kids: 'infantil', animation: 'infantil', animacion: 'infantil', infantil: 'infantil', anime: 'infantil',
  // musica
  music: 'musica', musica: 'musica', musicales: 'musica', musical: 'musica',
  // religion
  religious: 'religioso', religioso: 'religioso',
  // documentales y cultura
  documentary: 'documentales', documental: 'documentales', education: 'documentales',
  educativo: 'documentales', science: 'documentales', ciencia: 'documentales',
  culture: 'documentales', cultura: 'documentales', travel: 'documentales', viajes: 'documentales',
  // entretenimiento
  entertainment: 'entretenimiento', entretenimiento: 'entretenimiento', comedy: 'entretenimiento',
  comedia: 'entretenimiento', lifestyle: 'entretenimiento', 'estilo-de-vida': 'entretenimiento',
  outdoor: 'entretenimiento', 'aire-libre': 'entretenimiento', cooking: 'entretenimiento',
  cocina: 'entretenimiento', family: 'entretenimiento', familia: 'entretenimiento',
  auto: 'entretenimiento', motor: 'entretenimiento', shop: 'entretenimiento',
  compras: 'entretenimiento', relax: 'entretenimiento',
  // generalistas
  general: 'general', public: 'general',
};

/** Genero que se guarda para cada grupo reconocido (lo que ve la ficha). */
const GENERO = {
  news: 'noticias', legislative: 'legislativo', weather: 'clima', business: 'negocios',
  sports: 'deportes', movies: 'cine', 'vod-movies-en': 'cine', classic: 'clasicos',
  series: 'series', kids: 'infantil', animation: 'animacion', anime: 'anime',
  music: 'musica', musicales: 'musica', religious: 'religioso',
  documentary: 'documental', education: 'educativo', science: 'ciencia',
  culture: 'cultura', travel: 'viajes', comedy: 'comedia', lifestyle: 'estilo-de-vida',
  outdoor: 'aire-libre', cooking: 'cocina', family: 'familia', auto: 'motor',
  shop: 'compras', relax: 'relax',
};

/**
 * Cuando un canal tiene varias senales manda la mas especifica. Un canal
 * marcado "News" y "Entertainment" es de noticias, no de entretenimiento.
 */
const PRIORIDAD = [
  'noticias', 'deportes', 'infantil', 'religioso', 'cine', 'series',
  'musica', 'documentales', 'entretenimiento', 'general',
];

/**
 * Ultimo recurso para lo que no trae grupo: 3.500 de las 10.000 filas de la
 * remesa nueva vienen sin el. Solo se mira el nombre cuando todo lo demas ha
 * dicho "general", y las reglas son de palabras enteras: "Gol TV" no debe caer
 * en "gol" ni "Radio Nacional" en nada.
 */
const POR_NOMBRE = [
  ['noticias', /\b(noticias?|news|informativ[oa]s?|actualidad|cnn|euronews|al ?jazeera|france ?24|telesur|dw)\b/],
  ['deportes', /\b(deportes?|sports?|futbol|football|soccer|nba|nfl|ufc|motogp|golf|tenis|tennis|eurosport|bein|espn|dazn)\b/],
  ['infantil', /\b(kids?|ninos?|infantil(es)?|cartoon|toons?|junior|baby|dibujos|nick(elodeon)?|disney)\b/],
  ['religioso', /\b(cristian[oa]s?|christian|iglesia|church|gospel|catolic[oa]|islam|quran|biblia|bible|ewtn|3abn)\b/],
  ['cine', /\b(cine|movies?|films?|peliculas?)\b/],
  ['series', /\b(series?|novelas?|telenovelas?)\b/],
  ['musica', /\b(music|musica|musical|mtv|vevo|hits)\b/],
  ['documentales', /\b(documental(es)?|documentary|discovery|nature|naturaleza|historia|history)\b/],
];

/**
 * @param {object} p
 * @param {string[]} p.senales  grupos del CSV, generos ya guardados y/o la categoria anterior
 * @param {string}   p.nombre
 * @returns {string} slug de categoria
 */
export function categoriaDe({ senales = [], nombre = '' }) {
  const encontradas = new Set();
  for (const s of senales) {
    const cat = SENAL[slugify(s)];
    if (cat) encontradas.add(cat);
  }

  // Un canal que dice ser de seis cosas a la vez no es de ninguna de ellas.
  const especificas = [...encontradas].filter((c) => c !== 'general' && c !== 'entretenimiento');
  if (especificas.length >= 3) return 'entretenimiento';

  let categoria = PRIORIDAD.find((c) => encontradas.has(c)) ?? 'general';

  if (categoria === 'general') {
    const texto = sinAcentos(nombre).toLowerCase();
    for (const [cat, re] of POR_NOMBRE) {
      if (re.test(texto)) {
        categoria = cat;
        break;
      }
    }
  }
  return categoria;
}

/** Generos para guardar, a partir de los grupos del CSV. */
export function generosDe(senales) {
  const out = [];
  for (const s of senales) {
    const g = GENERO[slugify(s)];
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}

/**
 * Una emisora de radio con stream HLS de solo audio no es un canal. La
 * remesa anterior se filtraba por grupo y por la lista de origen; esta trae
 * ademas radios SIN grupo, con "Radio" en el nombre, asi que tambien se mira
 * ahi. "Radio Television Espanola" es television: si el nombre habla de tele o
 * de TV no se descarta.
 */
export function esRadio({ grupo = '', listas = '', url = '', nombre = '' }) {
  if (/^radio/i.test(grupo) || /^radios\b/i.test(grupo)) return true;
  if (/\b(radio|emisora)s?\b/i.test(listas)) return true;
  if (/\.(aac|mp3|ogg)(\?|$)/i.test(url)) return true;

  const n = sinAcentos(nombre).toLowerCase();
  if (/\b(tv|tele|television|televisao|canal)\b/.test(n)) return false;
  return /^radio\b/.test(n) || /\bradio$/.test(n) || /\b\d{2,3}[.,]\d\b/.test(n) || /\bfm\b/.test(n);
}

const ORDEN_CAT = new Map(CATEGORIAS.map((c, i) => [c.slug, i]));

/** Orden estable de la lista maestra: categoria, lo que reproduce, nombre. */
export function ordenar(canales) {
  return canales.sort(
    (a, b) =>
      (ORDEN_CAT.get(a.category) ?? 99) - (ORDEN_CAT.get(b.category) ?? 99) ||
      (a.webPlayable === false) - (b.webPlayable === false) ||
      a.name.localeCompare(b.name),
  );
}

export async function leerMaestro() {
  return JSON.parse(await readFile(MAESTRO, 'utf8'));
}

/**
 * Un canal por linea. Con 8.000 registros, el JSON con sangria pesa el doble
 * y cualquier cambio de un campo reescribe medio fichero en el diff: asi un
 * canal nuevo es una linea nueva y nada mas.
 */
export async function escribirMaestro(canales) {
  const cuerpo = ordenar(canales).map((c) => '  ' + JSON.stringify(c)).join(',\n');
  await mkdir(new URL('./', MAESTRO), { recursive: true });
  await writeFile(MAESTRO, `[\n${cuerpo}\n]\n`, 'utf8');
}

/**
 * Asigna `country` y `lang` a los canales de data/channels.json.
 *
 *   node scripts/asignar-paises.mjs          lo baja todo y escribe
 *   node scripts/asignar-paises.mjs --dry    solo informa
 *
 * Las listas de origen casi nunca dicen el pais, asi que se cruza con dos
 * catalogos publicos: iptv-org (stream -> canal -> pais e idioma) y la tabla de
 * regiones de Pluto TV de i.mjh.nz. De lo mas fiable a lo menos:
 *
 *   1. canal de Pluto: la region en la que se emite
 *   2. la URL del stream, tal cual o sin parametros, en iptv-org
 *   3. el pais que ya traia la lista
 *   4. el nombre del canal, si en iptv-org solo apunta a un pais
 *   5. el pais escrito en el nombre: "(Germany)", "Judge Judy DK"
 *   6. el dominio del stream, si es de un pais
 *
 * Lo que no sale por ninguna via se queda sin pais: mejor sin bandera que con
 * una inventada.
 */
import { gunzipSync } from 'node:zlib';
import { leerMaestro, escribirMaestro } from './lib/canales.mjs';

const dry = process.argv.includes('--dry');

const IPTV = 'https://iptv-org.github.io/api';
const json = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
};

const [channels, streams, feeds, countries, pluto] = await Promise.all([
  json(`${IPTV}/channels.json`),
  json(`${IPTV}/streams.json`),
  json(`${IPTV}/feeds.json`),
  json(`${IPTV}/countries.json`),
  fetch('https://i.mjh.nz/PlutoTV/.channels.json.gz')
    .then((r) => r.arrayBuffer())
    .then((b) => {
      const bytes = Buffer.from(b);
      // El servidor a veces ya entrega el fichero descomprimido.
      return JSON.parse((bytes[0] === 0x1f ? gunzipSync(bytes) : bytes).toString());
    }),
]);

const PAISES = new Map(countries.map((c) => [c.code.toLowerCase(), c]));
const IDIOMA_PAIS = (code) => PAISES.get(code)?.languages?.[0] ?? null;
const hablaEspanol = (code) => PAISES.get(code)?.languages?.includes('spa') ?? false;

// --- iptv-org ------------------------------------------------------------------

const canalPorId = new Map(channels.map((c) => [c.id, c]));
const idiomasFeed = new Map();
for (const f of feeds) {
  idiomasFeed.set(`${f.channel}@${f.id}`, f.languages);
  if (f.is_main) idiomasFeed.set(f.channel, f.languages);
}

const sinParametros = (url) => url.replace(/^https?:\/\//, '').split('?')[0].toLowerCase();
const porUrl = new Map();
for (const s of streams) {
  if (!s.channel || !canalPorId.has(s.channel)) continue;
  porUrl.set(s.url, s);
  porUrl.set(sinParametros(s.url), s);
}

const normal = (texto) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(hd|sd|fhd|uhd|4k|tv|channel|canal)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');

const porNombre = new Map();
for (const c of channels) {
  for (const nombre of [c.name, ...(c.alt_names ?? [])]) {
    const clave = normal(nombre);
    if (clave.length < 4) continue;
    if (!porNombre.has(clave)) porNombre.set(clave, new Set());
    porNombre.get(clave).add(c.id);
  }
}

const unaSolaNacion = (ids) => new Set([...ids].map((id) => canalPorId.get(id).country)).size === 1;

function idiomaDe(canalId, feedId, pais) {
  const langs = idiomasFeed.get(`${canalId}@${feedId}`) ?? idiomasFeed.get(canalId);
  if (langs?.length) return langs.includes('spa') ? 'spa' : langs[0];
  return hablaEspanol(pais) ? 'spa' : IDIOMA_PAIS(pais);
}

// --- Pluto ---------------------------------------------------------------------

// Las regiones en español mandan: un canal que se emite en Mexico y en EE. UU.
// es, para esta web, un canal en español.
const REGIONES = ['mx', 'es', 'cl', 'ar', ...Object.keys(pluto.regions)];
const regionPluto = new Map();
for (const region of REGIONES) {
  for (const id of Object.keys(pluto.regions[region].channels ?? {})) {
    if (!regionPluto.has(id)) regionPluto.set(id, region);
  }
}
const idPluto = (url) =>
  /jmp2\.uk\/plu-([0-9a-f]{24})/.exec(url)?.[1] ?? /pluto\.tv\/.*channel\/([0-9a-f]{24})/.exec(url)?.[1] ?? null;
const IDIOMA_REGION = { mx: 'spa', es: 'spa', cl: 'spa', ar: 'spa', br: 'por', de: 'deu', fr: 'fra', it: 'ita', no: 'nor', se: 'swe', dk: 'dan' };

// --- pistas de texto -----------------------------------------------------------

// Dominios que se venden como genericos: no dicen nada del pais.
const TLD_GENERICOS = new Set(['co', 'tv', 'me', 'io', 'ai', 'cc', 'fm', 'am', 'ws', 'la', 'to', 'us', 'pw', 'uk', 'im', 'gg', 'st', 'in', 'eu']);
// Codigos que las listas meten en el hueco del pais y son calidad, no pais.
// Tambien palabras que acaban un nombre ("Wrestling TV") y coinciden con un codigo.
const NO_ES_PAIS = new Set(['hd', 'sd', 'tv', 'fm', 'am']);
const EN_NOMBRE = new Map(countries.map((c) => [c.name.toLowerCase(), c.code.toLowerCase()]));
const ESPANOL_EN_NOMBRE = /\b(espa[nñ]ol|castellano|latino|latam|latinoamerica)\b/i;

function paisDelNombre(nombre) {
  const entre = /\(([^)]+)\)\s*(?:[A-Z]{2})?\s*$/.exec(nombre)?.[1]?.toLowerCase();
  if (entre && EN_NOMBRE.has(entre)) return EN_NOMBRE.get(entre);
  const cola = /\s([A-Z]{2})$/.exec(nombre)?.[1]?.toLowerCase();
  return cola && !NO_ES_PAIS.has(cola) && PAISES.has(cola) ? cola : null;
}

function paisDelDominio(url) {
  try {
    const tld = new URL(url).hostname.split('.').pop();
    return !TLD_GENERICOS.has(tld) && PAISES.has(tld) ? tld : null;
  } catch {
    return null;
  }
}

// --- reparto -------------------------------------------------------------------

const canales = await leerMaestro();
const vias = {};

function resolver(c) {
  const plu = idPluto(c.stream);
  if (plu && regionPluto.has(plu)) {
    const region = regionPluto.get(plu);
    return { via: 'pluto', country: region, lang: IDIOMA_REGION[region] ?? 'eng' };
  }

  const s = porUrl.get(c.stream) ?? porUrl.get(sinParametros(c.stream));
  if (s) {
    const country = canalPorId.get(s.channel).country.toLowerCase();
    return { via: 'url', country, lang: idiomaDe(s.channel, s.feed, country) };
  }

  const propio = c.country === 'uk' ? 'gb' : c.country;
  if (propio && !NO_ES_PAIS.has(propio) && PAISES.has(propio)) {
    return { via: 'lista', country: propio, lang: hablaEspanol(propio) ? 'spa' : IDIOMA_PAIS(propio) };
  }

  const ids = porNombre.get(normal(c.name));
  if (ids && unaSolaNacion(ids)) {
    const id = [...ids][0];
    const country = canalPorId.get(id).country.toLowerCase();
    return { via: 'nombre', country, lang: idiomaDe(id, null, country) };
  }

  const texto = paisDelNombre(c.name) ?? paisDelDominio(c.stream);
  if (texto) return { via: 'texto', country: texto, lang: hablaEspanol(texto) ? 'spa' : IDIOMA_PAIS(texto) };

  return { via: 'ninguna', country: null, lang: null };
}

for (const c of canales) {
  const { via, country, lang } = resolver(c);
  vias[via] = (vias[via] ?? 0) + 1;
  c.country = country;
  // Que el nombre diga "español" pesa mas que el idioma principal del pais.
  const idioma = ESPANOL_EN_NOMBRE.test(c.name) ? 'spa' : lang;
  if (idioma) c.lang = idioma;
  else delete c.lang;
}

if (!dry) await escribirMaestro(canales);

const espanol = canales.filter((c) => c.lang === 'spa');
const top = canales.reduce((m, c) => ((m[c.country ?? '-'] = (m[c.country ?? '-'] ?? 0) + 1), m), {});
console.log(`\n${dry ? '[dry] ' : ''}paises de ${canales.length} canales`);
console.log(`  por via     : ${JSON.stringify(vias)}`);
console.log(`  en español  : ${espanol.length} (reproducibles: ${espanol.filter((c) => c.webPlayable !== false).length})`);
console.log(`  mas comunes : ${Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, n]) => `${k} ${n}`).join(', ')}`);

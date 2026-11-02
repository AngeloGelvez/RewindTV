/**
 * Capa de datos. Las vistas solo hablan con este modulo; el adaptador decide
 * de donde salen los datos (JSON estatico hoy, API real manana) sin tocar la UI.
 *
 * Indices construidos una sola vez al cargar:
 *   byId, bySlug, byGenre, byDecade, byFestivity
 * Las consultas pasan a ser O(1) o un filtrado sobre un subconjunto, en vez de
 * recorrer el catalogo entero en cada render.
 */
import { adapter } from './adapters/mockAdapter.js';
import { memoize } from '../patterns/memoize.js';
import { idle } from '../core/scheduler.js';
import { isActive, daysUntil, daysToPeak } from './models/festivity.js';
import { hydrate as hydrateSourceHealth } from './sourceHealth.js';
import { createChannel } from './models/channel.js';

let bootstrapped = null;

const index = {
  titles: [],
  byId: new Map(),
  bySlug: new Map(),
  byGenre: new Map(),
  byDecade: new Map(),
  byNetwork: new Map(),
  festivities: [],
  festivityBySlug: new Map(),
  picks: {}, // slug -> [{ t: titleId, s: season, n: number, name }]
};

function pushTo(map, key, value) {
  let bucket = map.get(key);
  if (!bucket) map.set(key, (bucket = []));
  bucket.push(value);
}

export function bootstrap() {
  if (bootstrapped) return bootstrapped;
  bootstrapped = (async () => {
    // Los veredictos de fuentes se leen junto al catalogo: el Player los
    // necesita ya ordenados en el primer click, no dos segundos despues.
    const [{ titles, festivities, picks }] = await Promise.all([
      adapter.loadAll(),
      hydrateSourceHealth(),
    ]);

    index.titles = titles;
    for (const title of titles) {
      index.byId.set(title.id, title);
      index.bySlug.set(title.slug, title);
      for (const genre of title.genres) pushTo(index.byGenre, genre.slug, title);
      pushTo(index.byDecade, title.decade.slug, title);
      if (title.network) pushTo(index.byNetwork, title.network.slug, title);
    }

    index.festivities = festivities;
    for (const festivity of festivities) index.festivityBySlug.set(festivity.slug, festivity);
    index.picks = picks ?? {};

    idle(buildSearchIndex);
    return index;
  })();
  return bootstrapped;
}

export const getTitleById = (id) => index.byId.get(id);
export const getTitleBySlug = (slug) => index.bySlug.get(slug);
export const getByGenre = memoize((slug) => index.byGenre.get(slug) ?? []);
export const getByDecade = memoize((slug) => index.byDecade.get(slug) ?? []);
export const getByNetwork = memoize((slug) => index.byNetwork.get(slug) ?? []);

/**
 * Cadenas del catalogo, de la que mas titulos tiene a la que menos. Es el
 * indice que la portada usa para sus pestanas: con 503 titulos de ocho
 * cadenas, agrupar por cadena dice mucho mas que agrupar por genero, que aqui
 * es siempre el mismo.
 */
export const networks = memoize(
  () =>
    [...index.byNetwork.entries()]
      .map(([slug, titles]) => ({ network: titles[0].network, slug, titles }))
      .sort((a, b) => b.titles.length - a.titles.length),
  { keyOf: () => 'all' },
);

// ---------------------------------------------------------------- festividades

/**
 * Festividad de hoy. Si caen varias (ej. 31-oct Halloween y vispera de Dia de
 * Muertos) gana la de mayor `priority`. Si no hay ninguna, devuelve null y la
 * portada cae al orden normal.
 */
export function activeFestivity(date = new Date()) {
  let best = null;
  for (const festivity of index.festivities) {
    if (!isActive(festivity, date)) continue;
    if (!best || festivity.priority > best.priority) best = festivity;
  }
  return best;
}

/** La siguiente en el calendario, para el modulo "proximamente". */
export function upcomingFestivity(date = new Date()) {
  let best = null;
  let bestDays = Infinity;
  for (const festivity of index.festivities) {
    const days = daysUntil(festivity, date);
    if (days > 0 && days < bestDays) {
      best = festivity;
      bestDays = days;
    }
  }
  return best ? { festivity: best, days: bestDays } : null;
}

/**
 * Dias de antelacion con los que la portada empieza a anunciar una festividad.
 * Una semana es lo que tarda alguien en volver a entrar y seguir viendolo como
 * novedad; con un mes, para cuando llega el dia ya cansa.
 */
export const AVISO_DIAS = 7;

/**
 * La festividad que manda HOY en la portada, con lo que hay que decir de ella.
 *
 * Tres situaciones, y la distincion importa:
 *
 *   season  estamos dentro de su temporada (del 1 al 26 de diciembre)
 *   days    dias hasta su DIA señalado (el 25), no hasta la temporada
 *   active  hoy es ese dia -> toca el saludo
 *
 * La cuenta atras se mide siempre contra el dia, nunca contra el inicio de la
 * temporada: Accion de Gracias abre su temporada tres dias antes, y "faltan 3
 * dias" cuando en realidad faltan 6 seria mentir con precision.
 */
export function festivityOnStage(date = new Date(), aviso = AVISO_DIAS) {
  const activa = activeFestivity(date);
  if (activa) {
    const days = daysToPeak(activa, date);
    return { festivity: activa, days, active: days === 0, season: true };
  }

  // Fuera de temporada solo se anuncia lo que tiene dia y lo tiene cerca.
  let mejor = null;
  for (const festivity of index.festivities) {
    const days = daysToPeak(festivity, date);
    if (days === null || days <= 0 || days > aviso) continue;
    if (!mejor || days < mejor.days) mejor = { festivity, days, active: false, season: false };
  }
  return mejor;
}

/**
 * Episodios de una festividad, ya resueltos en `picks.json` en tiempo de build.
 * La portada NO necesita la base de episodios para armar la fila de Halloween.
 */
export function festivityPicks(slug) {
  const entries = index.picks[slug] ?? [];
  return entries
    .map((entry) => {
      const title = index.byId.get(entry.t);
      return title ? { title, season: entry.s, number: entry.n, name: entry.name } : null;
    })
    .filter(Boolean);
}

export const getFestivity = (slug) => index.festivityBySlug.get(slug);
export const allFestivities = () => index.festivities;

/**
 * Calendario completo: cada festividad con los dias que faltan y cuanto
 * contenido tiene. Ordenado por cercania, con la activa de hoy (0 dias) la
 * primera. Es lo que pinta la franja de "proximas" de la portada.
 */
export function festivityCalendar(date = new Date()) {
  return index.festivities
    .map((festivity) => ({
      festivity,
      days: daysUntil(festivity, date),
      picks: (index.picks[festivity.slug] ?? []).length,
    }))
    .sort((a, b) => a.days - b.days);
}

// ------------------------------------------------------------------ episodios

const episodesInFlight = new Map();

/**
 * Carga diferida de capitulos. Con 500 series en el catalogo, traerlos todos
 * serian decenas de miles de objetos que la grilla nunca mira.
 * Deduplica: si dos componentes piden a la vez, sale una sola peticion.
 */
export function loadEpisodes(title) {
  if (title.seasons) return Promise.resolve(title.seasons);
  let pending = episodesInFlight.get(title.id);
  if (pending) return pending;
  pending = adapter.loadEpisodes(title).then((seasons) => {
    title.seasons = seasons;
    episodesInFlight.delete(title.id);
    return seasons;
  });
  episodesInFlight.set(title.id, pending);
  return pending;
}

export function getEpisode(title, season, number) {
  return title.seasons?.get(season)?.find((e) => e.number === number) ?? null;
}

/** Siguiente capitulo, saltando al inicio de la temporada siguiente si toca. */
export function nextEpisode(title, episode) {
  const current = title.seasons?.get(episode.season) ?? [];
  const i = current.findIndex((e) => e.number === episode.number);
  if (i >= 0 && i < current.length - 1) return current[i + 1];
  return title.seasons?.get(episode.season + 1)?.[0] ?? null;
}

// -------------------------------------------------------------------- queries

export const query = memoize(
  ({ genre, decade, kind, sort = 'year-desc' }) => {
    let pool = genre ? getByGenre(genre) : decade ? getByDecade(decade) : index.titles;
    if (kind) pool = pool.filter((t) => t.kind === kind);
    if (decade && genre) pool = pool.filter((t) => t.decade.slug === decade);
    const sorted = pool.slice();
    if (sort === 'year-desc') sorted.sort((a, b) => b.year - a.year);
    else if (sort === 'year-asc') sorted.sort((a, b) => a.year - b.year);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'score') sorted.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return sorted;
  },
  { keyOf: (f) => `${f.genre}|${f.decade}|${f.kind}|${f.sort}` },
);

let searchIndex = null;

/**
 * Texto comparable: sin acentos y en minusculas.
 *
 * Es la diferencia entre que el buscador sirva o no. Medio catalogo lleva
 * tilde —"El Capitán Planeta", "Día de Muertos", "Dragón"— y nadie las escribe
 * al buscar: antes, "capitan" encontraba UN titulo de cuatro, y el que no
 * llevaba tilde. La normalizacion va en los dos lados, indice y consulta.
 */
const normalizar = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function buildSearchIndex() {
  if (searchIndex) return;
  searchIndex = index.titles.map((title) => ({
    title,
    // La cadena entra en el indice: "cartoon network" es una busqueda legitima
    // y el genero aqui es "animacion" en los 503, asi que no distingue nada.
    haystack: normalizar(
      `${title.name} ${title.year} ${title.network?.name ?? ''} ${title.genres.map((g) => g.label).join(' ')}`,
    ),
  }));
}

export const search = memoize(
  (term) => {
    const needle = normalizar(term.trim());
    if (needle.length < 2) return [];
    buildSearchIndex();
    const out = [];
    for (let i = 0; i < searchIndex.length && out.length < 60; i++) {
      if (searchIndex[i].haystack.includes(needle)) out.push(searchIndex[i].title);
    }
    return out;
  },
  { limit: 32 },
);

/**
 * Busqueda de canales. El buscador prometia "series, pelis o canales" y solo
 * miraba el catalogo: escribir "ESPN" con 1.864 canales dentro no devolvia
 * nada. El indice se arma la primera vez que se busca, no al cargar los
 * canales: quien entra a "En vivo" y no busca no paga ese trabajo.
 */
let channelSearchIndex = null;

export const searchChannels = memoize(
  (term) => {
    const needle = normalizar(term.trim());
    if (needle.length < 2 || !channelIndex.all.length) return [];
    if (!channelSearchIndex) {
      channelSearchIndex = channelIndex.all.map((channel) => ({
        channel,
        haystack: normalizar(
          `${channel.name} ${channel.category} ${channel.country ?? ''} ${channel.genres.map((g) => g.label).join(' ')}`,
        ),
      }));
    }
    const out = [];
    for (let i = 0; i < channelSearchIndex.length && out.length < 40; i++) {
      if (channelSearchIndex[i].haystack.includes(needle)) out.push(channelSearchIndex[i].channel);
    }
    return out;
  },
  { limit: 32 },
);

// -------------------------------------------------------------------- canales

/**
 * Canales en vivo.
 *
 * La lista son ~8.000 canales y no se baja entera. Se pide:
 *   1. el INDICE (categorias, cuantos hay y los destacados de la portada), y
 *   2. cada TROZO de ~1.000 canales cuando hace falta: la rejilla de "En vivo"
 *      pide el siguiente al hacer scroll y el buscador los pide todos la
 *      primera vez que se escribe algo.
 *
 * `channelIndex` solo contiene lo YA cargado; `getChannel` devuelve undefined
 * para un canal cuyo trozo no se ha pedido, y quien necesite uno concreto debe
 * cargar antes su categoria (`loadChannelCategory`).
 */
let indicePromise = null;
let indice = null;
const channelIndex = { all: [], byId: new Map() };
const trozosCargados = new Map(); // "categoria/fichero" -> Promise<Channel[]>

function registrar(canales) {
  for (const c of canales) {
    if (channelIndex.byId.has(c.id)) continue;
    channelIndex.byId.set(c.id, c);
    channelIndex.all.push(c);
  }
  channelSearchIndex = null; // el indice de busqueda se rehace con lo nuevo
}

/** Categorias, totales y destacados. Es lo unico que pide la portada. */
export function loadChannelIndex() {
  if (indicePromise) return indicePromise;
  indicePromise = adapter.loadChannelIndex().then((raw) => {
    indice = raw;
    registrar(raw.destacados.map((c, i) => createChannel(c, i)));
    return raw;
  });
  return indicePromise;
}

/** Un trozo concreto, con deduplicacion: dos peticiones a la vez son una. */
export async function loadChannelChunk(categoria, fichero) {
  const idx = await loadChannelIndex();
  const clave = `${categoria}/${fichero}`;
  let pendiente = trozosCargados.get(clave);
  if (!pendiente) {
    pendiente = adapter.loadChannelChunk(idx.version, categoria, fichero).then((canales) => {
      registrar(canales);
      return canales;
    });
    trozosCargados.set(clave, pendiente);
  }
  return pendiente;
}

/** Todos los trozos de una categoria. */
export async function loadChannelCategory(slug) {
  const idx = await loadChannelIndex();
  const cat = idx.categorias.find((c) => c.slug === slug);
  if (!cat) return [];
  const partes = await Promise.all(cat.trozos.map((t) => loadChannelChunk(slug, t.file)));
  return partes.flat();
}

/** Todo. Solo para quien lo necesita entero: el buscador y los enlaces sin categoria. */
export async function loadAllChannels() {
  const idx = await loadChannelIndex();
  await Promise.all(idx.categorias.map((c) => loadChannelCategory(c.slug)));
  return channelIndex.all;
}

export const channelsCatalog = () => indice;
export const channelCategories = () => indice?.categorias ?? [];
export const getChannel = (id) => channelIndex.byId.get(id);
export const getChannels = () => channelIndex.all;
export const getFeaturedChannels = () => indice?.destacados.map((c) => channelIndex.byId.get(c.id)).filter(Boolean) ?? [];

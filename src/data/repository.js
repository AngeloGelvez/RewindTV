/**
 * Capa de datos. Las vistas solo hablan con este modulo; el adaptador decide
 * de donde salen los datos (mock local hoy, API real manana) sin tocar la UI.
 *
 * Indices construidos una sola vez al cargar:
 *   byId, bySlug, byGenre, byDecade  -> las consultas son O(1)/O(n filtrado)
 *   en vez de recorrer el catalogo completo en cada render.
 */
import { adapter } from './adapters/mockAdapter.js';
import { memoize } from '../patterns/memoize.js';
import { idle } from '../core/scheduler.js';

let bootstrapped = null;
const index = {
  titles: [],
  byId: new Map(),
  bySlug: new Map(),
  byGenre: new Map(),
  byDecade: new Map(),
  channels: [],
  channelById: new Map(),
  programs: [],
  programsByChannel: new Map(),
};

function pushTo(map, key, value) {
  let bucket = map.get(key);
  if (!bucket) map.set(key, (bucket = []));
  bucket.push(value);
}

export function bootstrap() {
  if (bootstrapped) return bootstrapped;
  bootstrapped = (async () => {
    const { titles, channels, programs } = await adapter.loadAll();

    index.titles = titles;
    for (const title of titles) {
      index.byId.set(title.id, title);
      index.bySlug.set(title.slug, title);
      for (const genre of title.genres) pushTo(index.byGenre, genre.slug, title);
      pushTo(index.byDecade, title.decade.slug, title);
    }

    index.channels = channels;
    for (const channel of channels) index.channelById.set(channel.id, channel);

    index.programs = programs;
    for (const program of programs) pushTo(index.programsByChannel, program.channelId, program);

    // El indice de busqueda es caro: se construye cuando el hilo esta libre.
    idle(buildSearchIndex);
    return index;
  })();
  return bootstrapped;
}

export const getTitleById = (id) => index.byId.get(id);
export const getTitleBySlug = (slug) => index.bySlug.get(slug);
export const getChannels = () => index.channels;
export const getProgramsFor = (channelId) => index.programsByChannel.get(channelId) ?? [];

export const getByGenre = memoize((slug) => index.byGenre.get(slug) ?? []);
export const getByDecade = memoize((slug) => index.byDecade.get(slug) ?? []);

export const query = memoize(
  ({ genre, decade, kind, sort = 'year-desc' }) => {
    let pool = genre ? getByGenre(genre) : decade ? getByDecade(decade) : index.titles;
    if (kind) pool = pool.filter((t) => t.kind === kind);
    if (decade && genre) pool = pool.filter((t) => t.decade.slug === decade);
    const sorted = pool.slice();
    if (sort === 'year-desc') sorted.sort((a, b) => b.year - a.year);
    else if (sort === 'year-asc') sorted.sort((a, b) => a.year - b.year);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  },
  { keyOf: (f) => `${f.genre}|${f.decade}|${f.kind}|${f.sort}` },
);

// --- busqueda ---
let searchIndex = null;

function buildSearchIndex() {
  if (searchIndex) return;
  searchIndex = index.titles.map((title) => ({
    title,
    haystack: `${title.name} ${title.year} ${title.genres.map((g) => g.label).join(' ')}`.toLowerCase(),
  }));
}

export const search = memoize(
  (term) => {
    const needle = term.trim().toLowerCase();
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

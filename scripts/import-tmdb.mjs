// node scripts/import-tmdb.mjs [slug] [--dry]
// El token de lectura se usa aquí, fuera del frontend.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';

const data = new URL('../public/data/', import.meta.url);
const token = process.env.TMDB_READ_ACCESS_TOKEN;
if (!token) throw new Error('Configura TMDB_READ_ACCESS_TOKEN en el entorno de importación.');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const slug = args.find((arg) => !arg.startsWith('--'));
const titlesFile = new URL('titles.json', data);
const titles = JSON.parse(await readFile(titlesFile, 'utf8'));
const selection = titles.filter((t) => t.kind === 'serie' && (!slug || t.slug === slug));
if (!selection.length) throw new Error('No se encontró la serie en el catálogo.');

async function request(path, params) {
  const url = new URL('https://api.themoviedb.org/3/' + path);
  url.search = new URLSearchParams({ language: 'es-MX', ...params });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000),
    });
    if (res.ok) return res.json();
    if (res.status !== 429 || attempt >= 2) throw new Error(`TMDB ${res.status} en ${path}`);
    await pause(1000 * Math.max(1, parseInt(res.headers.get('retry-after'), 10) || 2));
  }
}

const key = (name) => (name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const filename = (path) => path?.replace(/^\//, '');

async function identify(title) {
  if (Number.isInteger(title.tmdbId)) return title.tmdbId;
  const { results } = await request('search/tv', { query: title.name });
  const candidates = results.filter((r) =>
    (title.poster && title.poster === filename(r.poster_path)) ||
    (title.backdrop && title.backdrop === filename(r.backdrop_path)) ||
    (Number(r.first_air_date?.slice(0, 4)) === title.year &&
      [r.name, r.original_name].some((name) => key(name) === key(title.name))));
  return candidates.length === 1 ? candidates[0].id : null;
}

async function save(file, object, indent) {
  const tmp = new URL(file.href + '.' + process.pid + '.tmp');
  await writeFile(tmp, JSON.stringify(object, null, indent));
  await rename(tmp, file);
}

let series = 0;
let capitulos = 0;
for (const title of selection) {
  const id = await identify(title);
  if (!id) { console.log('Sin coincidencia segura:', title.name); continue; }
  const show = await request(`tv/${id}`);
  const file = new URL(`episodes/${title.id}.json`, data);
  const local = JSON.parse(await readFile(file, 'utf8'));
  const byName = new Map();
  // La numeración del blog puede cruzar temporadas de emisión. Solo se
  // reutiliza un capítulo por nombre inequívoco, nunca solo por su posición.
  for (const season of show.seasons ?? []) {
    const remote = await request(`tv/${id}/season/${season.season_number}`);
    for (const ep of remote.episodes) {
      const name = key(ep.name);
      if (!name || /^(?:episode|episodio|capitulo) \d+$/.test(name)) continue;
      byName.set(name, byName.has(name) ? null : ep);
    }
  }
  let updated = 0;
  for (const season of local.seasons) {
    for (const ep of season.episodes) {
      const match = byName.get(key(ep.name));
      if (!match) continue;
      let changed = false;
      if (!ep.st && match.still_path) { ep.st = filename(match.still_path); changed = true; }
      if (!ep.min && match.runtime > 0) { ep.min = match.runtime; changed = true; }
      if (changed) updated++;
    }
  }
  title.tmdbId = id;
  if (!title.synopsis?.trim() && show.overview?.trim()) {
    title.synopsis = show.overview.trim();
    title.synopsisSource = 'tmdb';
  }
  if (!title.poster && show.poster_path) title.poster = filename(show.poster_path);
  if (!title.backdrop && show.backdrop_path) title.backdrop = filename(show.backdrop_path);
  if (!dry) {
    if (updated) await save(file, local);
    await save(titlesFile, titles, 2);
  }
  series++;
  capitulos += updated;
}
console.log(`${dry ? 'Simulación' : 'Importación'}: ${series} series identificadas, ${capitulos} episodios enriquecidos.`);

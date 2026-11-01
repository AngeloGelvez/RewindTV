/**
 * Adaptador mock: lee los JSON estaticos de /public/data. No hay backend.
 *
 * Reparto de los datos, pensado para que el arranque sea minimo:
 *
 *   titles.json          catalogo ligero, sin episodios        -> se carga al inicio
 *   festivities.json     ~15 reglas de fecha                   -> se carga al inicio
 *   picks.json           indice festividad -> episodios        -> se carga al inicio
 *   episodes/<id>.json   capitulos de UN titulo                -> bajo demanda
 *   channels/schedule    modo en vivo                          -> bajo demanda
 *
 * Asi la portada puede recomendar la festividad de hoy sin bajar la base de
 * episodios entera: `picks.json` ya trae resuelto que episodio va en cada una.
 */
import { createTitle } from '../models/title.js';
import { createChannel } from '../models/channel.js';
import { createProgram } from '../models/program.js';
import { parseSeasons } from '../models/episode.js';
import { Festivity } from '../models/festivity.js';
import * as cache from '../cache.js';

// v4: catalogo importado de lacartoons.com (503 titulos). Subir la version
// invalida la cache vieja: sin esto, quien ya visito la web seguiria viendo el
// catalogo de demostracion hasta que caduque el registro de IndexedDB.
const CATALOG_KEY = 'catalog:v4';

async function fetchJson(path) {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`[mockAdapter] ${path} -> ${res.status}`);
  return res.json();
}

export const adapter = {
  async loadAll() {
    const cached = await cache.get(CATALOG_KEY);
    const raw = cached ?? (await loadCatalog());
    if (!cached) cache.set(CATALOG_KEY, raw);

    const titles = raw.titles.map(createTitle);
    return {
      titles,
      festivities: raw.festivities.map(Festivity.get),
      picks: raw.picks,
    };
  },

  /** Capitulos de un titulo. Un fichero por serie: solo bajas lo que abres. */
  async loadEpisodes(title) {
    const key = `episodes:${title.id}`;
    let raw = await cache.get(key);
    if (!raw) {
      raw = await fetchJson(`/data/episodes/${title.id}.json`);
      cache.set(key, raw);
    }
    return parseSeasons(raw, title);
  },

  /**
   * Canales HLS en vivo. Solo los pide quien entra al modo en vivo.
   * Cache larga (7 dias) porque la lista cambia poco; lo que cambia es si el
   * stream responde, y eso lo revalida `scripts/check-channels.mjs`.
   */
  async loadChannels() {
    const key = 'channels:v1';
    let raw = await cache.get(key, { maxAge: 7 * 86_400_000 });
    if (!raw) {
      raw = await fetchJson('/data/channels.json');
      cache.set(key, raw);
    }
    return raw.map(createChannel);
  },

  /** Guia de programacion del catalogo propio (distinta de los canales HLS). */
  async loadSchedule(titleIndex) {
    const programs = await fetchJson('/data/schedule.json');
    return programs.map((p) => createProgram(p, titleIndex));
  },
};

async function loadCatalog() {
  const [titles, festivities, picks] = await Promise.all([
    fetchJson('/data/titles.json'),
    fetchJson('/data/festivities.json'),
    fetchJson('/data/picks.json').catch(() => ({})), // aun sin generar: no es fatal
  ]);
  return { titles, festivities, picks };
}

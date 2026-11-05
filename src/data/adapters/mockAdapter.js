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
import { withBase } from '../../core/base.js';

// v6: las festividades traen saludo (`greeting`) y dia señalado (`rule.peak`).
//
// Subir la version invalida la cache vieja, y hay que acordarse SIEMPRE que
// cambia la forma del dato: el adaptador guarda el JSON crudo en IndexedDB, y
// quien ya visito la web seguiria leyendo la version anterior —sin saludo, sin
// portadas— durante un dia entero. Esta es la tercera vez que pasa.
const CATALOG_KEY = 'catalog:v7';

// Y esta es la cuarta, pero en el otro fichero: `episodes:<id>` no llevaba
// version, asi que el aviso de arriba no protegia a los capitulos. Al cambiar
// la forma de `src` en las fuentes de Blogger (de token suelto a la query
// entera), quien ya habia abierto la serie seguia construyendo la URL vieja y
// el reproductor salia en blanco. Comprobado en caliente antes de arreglarlo.
//
// La version va en la clave, no en un borrado al arrancar: una clave nueva
// deja la vieja muerta sin tocar nada mas, y `cache.get` ya la descarta a las
// 24 h por antigüedad.
const EPISODES_VERSION = 'v2';
const episodesKey = (id) => `episodes:${EPISODES_VERSION}:${id}`;

async function fetchJson(path) {
  const res = await fetch(withBase(path), { headers: { accept: 'application/json' } });
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
    const key = episodesKey(title.id);
    let raw = await cache.get(key);
    if (!raw) {
      raw = await fetchJson(`/data/episodes/${title.id}.json`);
      cache.set(key, raw);
    }
    return parseSeasons(raw, title);
  },

  /**
   * Indice de canales: categorias con sus trozos, y los destacados de la
   * portada. Es lo unico que se pide al entrar; el resto va bajo demanda.
   * Pesa unos KB, asi que su cache es corta: es lo que avisa de una version
   * nueva de los trozos.
   */
  async loadChannelIndex() {
    // SIN cache propia, a proposito. El indice es lo que dice que version de
    // los trozos toca leer: cachearlo 30 minutos hacia que una lista nueva
    // tardara media hora en verse (la cabecera seguia contando los canales
    // viejos). Son 7 KB y el navegador ya los gestiona con su cache HTTP; lo
    // que merece cache de IndexedDB son los trozos, y esos llevan la version
    // del indice en la clave.
    return fetchJson('/data/channels/index.json');
  },

  /**
   * Un trozo de ~1.000 canales. La clave lleva la VERSION del indice: cada vez
   * que se regenera la lista cambia, y el trozo viejo deja de leerse solo, sin
   * tener que acordarse de subir un numero a mano (que es lo que habia que
   * hacer con `channels:v4` y se olvidaba).
   */
  async loadChannelChunk(version, categoria, fichero) {
    const key = `channels:${version}:${fichero}`;
    let raw = await cache.get(key, { maxAge: 7 * 86_400_000 });
    if (!raw) {
      raw = await fetchJson(`/data/channels/${fichero}`);
      cache.set(key, raw);
    }
    // La categoria va implicita en el fichero: no se repite en cada registro.
    return raw.map((c, i) => createChannel({ ...c, category: categoria }, i));
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

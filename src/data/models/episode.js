/**
 * Episodio.
 *
 * El JSON usa claves cortas (`n`, `src`, `min`, `fest`) a proposito: con miles
 * de episodios, los nombres de campo son una fraccion real del peso del
 * dataset. La forma "larga" se reconstruye aqui, una sola vez, al parsear.
 *
 * `src` es una tupla [proveedor, id] en vez de la URL completa:
 *   ["okru", "1392690399817"]  ->  https://ok.ru/videoembed/1392690399817
 * Si manana cambias de proveedor, cambia el dato, no la UI.
 */
import { intern } from '../../patterns/flyweight.js';
import { Festivity } from './festivity.js';

export function createEpisode(raw, title, season) {
  return {
    id: `${title.id}-${season}-${raw.n}`,
    titleId: title.id,
    season,
    number: raw.n,
    name: raw.name,
    synopsis: raw.synopsis ?? '',
    runtime: raw.min ?? title.runtime,
    source: raw.src ? { provider: intern(raw.src[0]), id: raw.src[1] } : null,
    // Referencias compartidas a los flyweights de festividad.
    festivities: raw.fest ? raw.fest.map((slug) => Festivity.get({ slug })) : EMPTY,
    href: `/ver/${title.slug}/t${season}/c${raw.n}`,
  };
}

const EMPTY = Object.freeze([]);

/** Aplana el JSON (temporadas anidadas) a Map<numeroTemporada, Episode[]>. */
export function parseSeasons(raw, title) {
  const seasons = new Map();
  for (const season of raw.seasons) {
    const list = season.episodes.map((episode) => createEpisode(episode, title, season.number));
    seasons.set(season.number, list);
  }
  return seasons;
}

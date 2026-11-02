/**
 * Episodio.
 *
 * El JSON usa claves cortas (`n`, `src`, `min`, `fest`) a proposito: con miles
 * de episodios, los nombres de campo son una fraccion real del peso del
 * dataset. La forma "larga" se reconstruye aqui, una sola vez, al parsear.
 *
 * Las fuentes son una tupla [proveedor, id] en vez de la URL completa:
 *   ["okru", "1392690399817"]  ->  https://ok.ru/videoembed/1392690399817
 * Si manana cambias de proveedor, cambia el dato, no la UI.
 *
 * Un capitulo puede declarar VARIAS fuentes en `srcs`, en orden de preferencia:
 *   "srcs": [["okru", "139..."], ["mp4", "https://.../cap01.mp4"]]
 * `src` (una sola tupla) se sigue aceptando: es el formato anterior y no hay
 * razon para reescribir los ficheros que ya estan bien.
 */
import { intern } from '../../patterns/flyweight.js';
import { Festivity } from './festivity.js';
import { parseSources } from './embed.js';
import { imageUrl } from './images.js';

export function createEpisode(raw, title, season) {
  // El contexto solo se usa en el aviso de consola cuando una fuente es
  // invalida; sin el, un dato malo en 20.000 capitulos es imposible de ubicar.
  const sources = parseSources(raw.srcs ?? raw.src, `${title.slug} t${season}c${raw.n}`);
  return {
    id: `${title.id}-${season}-${raw.n}`,
    titleId: title.id,
    season,
    number: raw.n,
    name: raw.name,
    synopsis: raw.synopsis ?? '',
    runtime: raw.min ?? title.runtime,
    // `st`: fotograma del capitulo, guardado como nombre de fichero igual que
    // las portadas. Todavia no lo trae ningun capitulo; la vista de ficha cae
    // al fondo de la serie mientras tanto.
    still: imageUrl(raw.st, 'still'),
    sources,
    // Compat: las vistas que solo entienden una fuente siguen funcionando.
    source: sources[0] ?? null,
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

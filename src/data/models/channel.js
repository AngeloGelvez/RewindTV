/**
 * Canal en vivo (HLS).
 *
 * `category` y `genres` son flyweights: 55 canales hoy, pero la lista crece y
 * repite muchisimo "entretenimiento" / "cine". Se comparten por referencia.
 *
 * `always: false` marca los canales que no emiten 24/7: la UI debe tolerar que
 * el playlist este vacio a ciertas horas y no tratarlo como error.
 */
import { intern } from '../../patterns/flyweight.js';
import { Genre } from './taxonomy.js';

export function createChannel(raw, position) {
  return {
    id: raw.id,
    name: raw.name,
    number: position + 1,
    logo: raw.logo,
    category: intern(raw.category),
    genres: raw.genres?.length ? raw.genres.map(Genre.get) : EMPTY,
    country: raw.country ? intern(raw.country) : null,
    quality: raw.quality ? intern(raw.quality) : null,
    always: raw.always !== false,
    stream: raw.stream,
    // Lo rellena el checker; la UI lo usa para no ofrecer canales caidos.
    checkedAt: raw.checkedAt ?? null,
  };
}

const EMPTY = Object.freeze([]);

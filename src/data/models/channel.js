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
    /*
     * `webPlayable: false` lo pone scripts/marcar-canales.mjs: el stream esta
     * vivo pero el navegador no puede con el —el origen no manda CORS, o el
     * codec no es decodificable— y eso solo se mide en un navegador.
     *
     * No se esconden: siguen en la lista, al final y avisados. El canal existe
     * y emite; lo que falla es el camino, y deja de fallar en cuanto el origen
     * arregle sus cabeceras o la app se sirva tras un proxy.
     */
    webPlayable: raw.webPlayable !== false,
    webReason: raw.webReason ?? null,
  };
}

const EMPTY = Object.freeze([]);

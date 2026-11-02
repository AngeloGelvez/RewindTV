/**
 * Modelo Title. El objeto por titulo guarda SOLO su estado extrinseco
 * (id, nombre, poster, duracion) y referencias a los flyweights compartidos.
 *
 * `episodes` / `seasons` se adjuntan despues, de forma perezosa: la vista de
 * catalogo no necesita la lista de capitulos y cargarla costaria memoria por
 * cada titulo visible.
 */
import { Genre, Decade, Network } from './taxonomy.js';
import { intern } from '../../patterns/flyweight.js';
import { imageUrl } from './images.js';

export function createTitle(raw) {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    year: raw.year,
    kind: intern(raw.kind), // 'serie' | 'pelicula' | 'especial'
    runtime: raw.runtime,
    // El JSON guarda el nombre del fichero; la URL (y el ancho) se deciden en
    // images.js. Sin portada queda null, y cada componente pinta su respaldo.
    poster: imageUrl(raw.poster, 'poster'),
    backdrop: imageUrl(raw.backdrop, 'backdrop'),
    synopsis: raw.synopsis,
    rating: intern(raw.rating ?? 'NR'),
    score: raw.score ?? null, // 0-10, el "7 estrella" de la tarjeta
    // --- referencias compartidas, no copias ---
    genres: raw.genres.map(Genre.get),
    decade: Decade.get(raw.year),
    network: raw.network ? Network.get(raw.network) : null,
    // --- se rellena bajo demanda en la vista de detalle ---
    seasonCount: raw.seasonCount ?? null,
    episodeCount: raw.episodeCount ?? null,
    seasons: null, // Map<number, Episode[]>
  };
}

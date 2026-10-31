/**
 * Modelo Title. El objeto por titulo guarda SOLO su estado extrinseco
 * (id, nombre, poster, duracion) y referencias a los flyweights compartidos.
 */
import { Genre, Decade, Network } from './taxonomy.js';
import { intern } from '../../patterns/flyweight.js';

export function createTitle(raw) {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    year: raw.year,
    kind: intern(raw.kind), // 'serie' | 'pelicula' | 'especial'
    runtime: raw.runtime,
    poster: raw.poster,
    backdrop: raw.backdrop,
    synopsis: raw.synopsis,
    rating: intern(raw.rating ?? 'NR'),
    // --- referencias compartidas, no copias ---
    genres: raw.genres.map(Genre.get),
    decade: Decade.get(raw.year),
    network: raw.network ? Network.get(raw.network) : null,
    seasons: raw.seasons ?? null,
  };
}

import { readFile } from 'node:fs/promises';

// La numeración del blog cambia si aparece una entrada antigua. Solo se
// trasladan metadatos entre nombres únicos dentro de la misma temporada.
export async function preserveEpisodeMetadata(file, catalog) {
  let previous;
  try {
    previous = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const season of catalog.seasons) {
    const old = previous.seasons.find((entry) => entry.number === season.number);
    if (!old) continue;
    const byName = new Map();
    for (const episode of old.episodes) {
      byName.set(episode.name, byName.has(episode.name) ? null : episode);
    }
    const seen = new Set();
    for (const episode of season.episodes) {
      if (seen.has(episode.name)) byName.delete(episode.name);
      seen.add(episode.name);
    }
    for (const episode of season.episodes) {
      const metadata = byName.get(episode.name);
      if (metadata?.st) episode.st = metadata.st;
    }
  }
}

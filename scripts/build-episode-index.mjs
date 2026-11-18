// Índice de descubrimiento. Las fuentes y sinopsis completas se leen al abrir la ficha.
import { readFile, writeFile } from 'node:fs/promises';
import { parseSources } from '../src/data/models/embed.js';

const data = new URL('../public/data/', import.meta.url);
const titles = JSON.parse(await readFile(new URL('titles.json', data), 'utf8'));
const index = {};
for (const title of titles) {
  const { seasons } = JSON.parse(await readFile(new URL(`episodes/${title.id}.json`, data), 'utf8'));
  const rows = [];
  for (const season of seasons) {
    for (const episode of season.episodes) {
      if (parseSources(episode.srcs ?? episode.src).length) {
        const row = [season.number, episode.n, episode.name];
        if (episode.st) row.push(episode.st);
        rows.push(row);
      }
    }
  }
  if (rows.length) index[title.id] = rows;
}
await writeFile(new URL('episode-index.json', data), JSON.stringify(index));

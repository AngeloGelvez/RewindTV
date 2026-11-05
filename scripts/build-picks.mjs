/**
 * Genera public/data/picks.json: el indice festividad -> episodios.
 *
 * Por que precalcularlo
 * --------------------
 * Sin backend, la alternativa seria que el navegador bajara TODOS los
 * episodes/*.json al abrir la web para poder armar la fila de Halloween.
 * Con 500 series eso son 500 peticiones y varios MB.
 *
 * Este script recorre los ficheros UNA vez, en tu maquina, y deja un unico
 * JSON de unos pocos KB que la portada consume directo. El trabajo pasa del
 * dispositivo del usuario (cada visita) a tu build (una vez).
 *
 *   node scripts/build-picks.mjs
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { providerClean } from '../src/data/models/embed.js';

const DATA = new URL('../public/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const EPISODES_DIR = join(DATA, 'episodes');
const MAX_POR_FESTIVIDAD = 60;

const titles = JSON.parse(await readFile(join(DATA, 'titles.json'), 'utf8'));
const festivities = JSON.parse(await readFile(join(DATA, 'festivities.json'), 'utf8'));
const titleById = new Map(titles.map((t) => [t.id, t]));
const known = new Set(festivities.map((f) => f.slug));

const picks = Object.create(null);
const stats = { ficheros: 0, episodios: 0, etiquetados: 0, desconocidas: new Set() };

for (const file of await readdir(EPISODES_DIR)) {
  if (!file.endsWith('.json')) continue;
  stats.ficheros++;

  const raw = JSON.parse(await readFile(join(EPISODES_DIR, file), 'utf8'));
  const title = titleById.get(raw.titleId);
  if (!title) {
    console.warn(`  ! ${file}: titleId "${raw.titleId}" no existe en titles.json`);
    continue;
  }

  // `adFree`: todos sus capitulos con fuente van por un proveedor sin ventanas
  // de anuncios. El catalogo pone estas series primero (ver `query`).
  const fuentes = raw.seasons.flatMap((s) => s.episodes.filter((e) => e.src).map((e) => e.src[0]));
  title.adFree = fuentes.length > 0 && fuentes.every(providerClean);

  for (const season of raw.seasons) {
    for (const episode of season.episodes) {
      stats.episodios++;
      if (!episode.fest?.length) continue;
      stats.etiquetados++;

      for (const slug of episode.fest) {
        if (!known.has(slug)) {
          stats.desconocidas.add(slug);
          continue;
        }
        (picks[slug] ??= []).push({
          t: title.id,
          s: season.number,
          n: episode.n,
          name: episode.name,
          // Se ordena por puntuacion del titulo: lo mejor valorado va primero.
          _score: title.score ?? 0,
        });
      }
    }
  }
}

for (const slug of Object.keys(picks)) {
  picks[slug] = picks[slug]
    .sort((a, b) => b._score - a._score)
    .slice(0, MAX_POR_FESTIVIDAD)
    .map(({ _score, ...entry }) => entry);
}

await writeFile(join(DATA, 'picks.json'), JSON.stringify(picks), 'utf8');
await writeFile(join(DATA, 'titles.json'), JSON.stringify(titles, null, 2), 'utf8');

console.log(`\npicks.json generado`);
console.log(`  ficheros de episodios : ${stats.ficheros}`);
console.log(`  episodios totales     : ${stats.episodios}`);
console.log(`  con festividad        : ${stats.etiquetados}`);
for (const slug of Object.keys(picks)) {
  console.log(`    ${slug.padEnd(22)} ${picks[slug].length}`);
}
const sinContenido = festivities.filter((f) => !picks[f.slug]).map((f) => f.slug);
if (sinContenido.length) console.log(`  sin episodios         : ${sinContenido.join(', ')}`);
if (stats.desconocidas.size) {
  console.log(`  ! slugs no declarados : ${[...stats.desconocidas].join(', ')}`);
  process.exitCode = 1;
}

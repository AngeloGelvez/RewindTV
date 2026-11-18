// Completa las fichas del catálogo original por su ID estable.
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../public/data/titles.json', import.meta.url);
const titles = JSON.parse(await readFile(file, 'utf8'));
const pendientes = titles.filter((t) => !t.synopsis?.trim() || (!t.poster && !t.backdrop));
const cambios = new Map();
const texto = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function importar(t) {
  const url = new URL('https://www.lacartoons.com/serie/' + t.id.slice(1));
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const name = texto(html.match(/<h2[^>]*subtitulo-serie-seccion[^>]*>([^<]*)/i)?.[1]);
  if (name.localeCompare(t.name, 'es', { sensitivity: 'base' }) !== 0) return;
  const patch = {};
  const synopsis = texto(html.match(/Reseña:\s*<br\s*\/?>\s*<span>([\s\S]*?)<\/span>/i)?.[1]);
  if (!t.synopsis?.trim() && synopsis.length > 25) {
    patch.synopsis = synopsis;
    patch.synopsisSource = 'lacartoons';
  }
  if (!t.poster && !t.backdrop) {
    const src = html.match(/class="imagen-serie">\s*<img src="([^"]+)"/)?.[1];
    if (src?.startsWith('/rails/active_storage/')) patch.poster = new URL(src, url).href;
  }
  if (Object.keys(patch).length) cambios.set(t.id, patch);
}

let next = 0;
async function worker() {
  while (next < pendientes.length) {
    const t = pendientes[next++];
    try { await importar(t); }
    catch (err) { console.warn(t.slug, err.message); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
// Aplica solo campos ausentes. Conserva ediciones realizadas durante la descarga.
const current = JSON.parse(await readFile(file, 'utf8'));
for (const t of current) {
  for (const [k, value] of Object.entries(cambios.get(t.id) ?? {})) if (!t[k]?.trim()) t[k] = value;
}
if (cambios.size) await writeFile(file, JSON.stringify(current, null, 2));
console.log(`${cambios.size} fichas actualizadas de ${pendientes.length} consultadas.`);

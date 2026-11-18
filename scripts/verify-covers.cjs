const fs = require('node:fs/promises');
async function run() {
  const file = 'public/data/titles.json';
  const titles = JSON.parse(await fs.readFile(file, 'utf8'));
  let count = 0;
  for (const t of titles.filter(t => !t.tmdbId && t.poster && !t.poster.startsWith('https:'))) {
    const url = 'https://www.lacartoons.com/serie/' + t.id.slice(1);
    const page = await fetch(url, {signal: AbortSignal.timeout(18000)});
    if (!page.ok) continue;
    const html = await page.text();
    const name = html.match(/<h2[^>]*subtitulo-serie-seccion[^>]*>([^<]*)/i)?.[1]?.trim();
    const src = html.match(/class="imagen-serie">\s*<img src="([^"]+)"/)?.[1];
    if (name !== t.name || !src?.startsWith('/rails/active_storage/')) continue;
    const img = new URL(src, url).href;
    const response = await fetch(img, {signal: AbortSignal.timeout(12000)});
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) continue;
    await response.arrayBuffer();
    t.poster = img;
    delete t.backdrop;
    count++;
  }
  await fs.writeFile(file, JSON.stringify(titles, null, 2));
  console.log(count, 'portadas dudosas sustituidas por las de su ficha de origen');
}
run().catch(e => { console.error(e); process.exitCode = 1; });

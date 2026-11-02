/**
 * Revalida public/data/channels.json: pide cada playlist HLS y reporta cuales
 * siguen vivos. Los streams publicos se caen constantemente, asi que esto hay
 * que pasarlo cada cierto tiempo.
 *
 *   node scripts/check-channels.mjs           solo reporta
 *   node scripts/check-channels.mjs --prune   ademas borra los caidos
 *
 * Un canal se considera vivo si responde 200 y el cuerpo es un playlist HLS
 * (#EXTM3U). Un 200 que devuelve HTML es un portal caido, no un stream.
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../public/data/channels.json', import.meta.url);
// 15 s y no 9: hay canales lentos pero vivos, y un corte por impaciencia se
// parece demasiado a un canal muerto.
const TIMEOUT = 15_000;
const CONCURRENCY = 24;
const prune = process.argv.includes('--prune');

const channels = JSON.parse(await readFile(FILE, 'utf8'));

async function probe(channel) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(channel.stream, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0', accept: '*/*' },
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = (await res.text()).slice(0, 4000);
    if (!body.includes('#EXTM3U')) {
      return { ok: false, reason: body.trimStart().startsWith('<') ? 'devuelve HTML' : 'no es HLS' };
    }

    const variantes = (body.match(/#EXT-X-STREAM-INF/g) || []).length;
    if (!variantes) return { ok: true, variants: 0 };

    // Un master vivo no basta: hay canales que responden 200 con la lista de
    // variantes y devuelven 404 en la variante, asi que no reproducen aunque
    // el checker los diera por buenos. Se comprueba la primera.
    const primera = body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (!primera) return { ok: false, reason: 'master sin variante' };

    const variante = await fetch(new URL(primera, res.url).href, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0', accept: '*/*' },
    });
    if (!variante.ok) return { ok: false, reason: `variante HTTP ${variante.status}` };

    return { ok: true, variants: variantes };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'timeout' : (err.cause?.code ?? err.message) };
  } finally {
    clearTimeout(timer);
  }
}

const queue = channels.slice();
const vivos = [];
const caidos = [];

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const channel = queue.shift();
      const result = await probe(channel);
      if (result.ok) {
        channel.checkedAt = new Date().toISOString().slice(0, 10);
        vivos.push(channel);
      } else {
        caidos.push({ channel, reason: result.reason });
      }
    }
  }),
);

console.log(`\nvivos: ${vivos.length} / ${channels.length}`);
if (caidos.length) {
  console.log('\ncaidos:');
  for (const { channel, reason } of caidos) {
    console.log(`  ${channel.name.padEnd(32)} ${reason}`);
  }
}

// Aviso: una web servida por HTTPS no puede cargar un stream HTTP.
const mixtos = vivos.filter((c) => c.stream.startsWith('http://'));
if (mixtos.length) {
  console.log(`\n! ${mixtos.length} vivos por HTTP: el navegador los bloqueara en una web HTTPS`);
  for (const c of mixtos) console.log(`  - ${c.name}`);
}

if (prune) {
  vivos.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  await writeFile(FILE, JSON.stringify(vivos, null, 2), 'utf8');
  console.log(`\nchannels.json reescrito con ${vivos.length} canales`);
} else if (caidos.length) {
  console.log('\n(usa --prune para eliminarlos del fichero)');
}

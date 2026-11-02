/**
 * Comprueba que canales puede reproducir un NAVEGADOR, no solo un servidor.
 *
 *   node scripts/check-web.mjs                 # solo reporta
 *   node scripts/check-web.mjs --write ids.json  # ademas deja la lista
 *
 * `check-channels.mjs` responde "¿existe el stream?". Este responde "¿lo puede
 * tocar una pagina web?", que es otra pregunta y la que de verdad decide si al
 * pulsar sale imagen o sale "esta fuente no responde".
 *
 * Dos cosas lo deciden, y las dos se pueden leer desde Node:
 *
 *  CORS    hls.js baja el playlist con fetch, asi que el origen tiene que
 *          mandar Access-Control-Allow-Origin. Aqui se pide con la cabecera
 *          `Origin` puesta, porque muchos servidores solo la devuelven cuando
 *          se la mandan: sin eso el resultado seria mas pesimista que la
 *          realidad.
 *  CODECS  reproducir por MSE exige un codec que el navegador sepa decodificar.
 *          El playlist los anuncia; HEVC y AC-3/E-AC-3 no los decodifica
 *          Chrome en ningun caso, y van en la lista negra de abajo.
 *
 * Lo que NO se puede saber desde aqui es si el reproductor nativo salvaria al
 * canal cuando falla hls.js. La medicion en navegador sobre los 1.864 canales
 * dijo que no salva a ninguno: de 365 sin CORS o con codec imposible, el
 * <video> nativo no levanto ni uno. Por eso este script da el mismo veredicto
 * con un 97 % menos de trabajo.
 *
 * El resultado alimenta a `marcar-canales.mjs`, que NO borra: pone
 * `webPlayable: false` y el motivo.
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../public/data/channels.json', import.meta.url);
const TIMEOUT = 12_000;
const CONCURRENCY = 48;
// Un origen cualquiera sirve: lo que se mira es si el servidor contesta algo.
const ORIGEN = 'http://localhost:5173';

const args = process.argv.slice(2);
const salida = args.includes('--write') ? args[args.indexOf('--write') + 1] : null;

/** Codecs que ningun Chrome de escritorio decodifica por MSE. */
const IMPOSIBLES = /hvc1|hev1|ac-3|ec-3|mp4a\.a5|mp4a\.a6|dvh1|dvhe/i;

const canales = JSON.parse(await readFile(FILE, 'utf8'));

async function probar(canal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(canal.stream, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0', accept: '*/*', origin: ORIGEN },
    });

    if (!res.ok) return { id: canal.id, motivo: `http-${res.status}` };

    const acao = res.headers.get('access-control-allow-origin');
    if (!acao || (acao !== '*' && acao !== ORIGEN)) return { id: canal.id, motivo: 'cors' };

    const cuerpo = (await res.text()).slice(0, 6000);
    const codecs = cuerpo.match(/CODECS="([^"]+)"/i);
    if (codecs && IMPOSIBLES.test(codecs[1])) return { id: canal.id, motivo: 'codec' };

    return null;
  } catch (err) {
    // Un timeout no es prueba de nada (ver check-channels.mjs): no se marca.
    return err.name === 'AbortError' ? null : { id: canal.id, motivo: 'cors' };
  } finally {
    clearTimeout(timer);
  }
}

const cola = canales.slice();
const malos = [];

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cola.length) {
      const resultado = await probar(cola.shift());
      if (resultado) malos.push(resultado);
    }
  }),
);

const porMotivo = malos.reduce((m, x) => ((m[x.motivo] = (m[x.motivo] ?? 0) + 1), m), {});

console.log(`\nreproducibles en navegador: ${canales.length - malos.length} / ${canales.length}`);
console.log(`  no reproducen : ${malos.length}  (${((malos.length / canales.length) * 100).toFixed(1)} %)`);
console.log(`  por motivo    : ${JSON.stringify(porMotivo)}`);

if (salida) {
  await writeFile(salida, JSON.stringify(malos, null, 2), 'utf8');
  console.log(`\nlista escrita en ${salida}`);
  console.log(`siguiente paso: node scripts/marcar-canales.mjs ${salida}`);
} else {
  console.log('\n(usa --write <fichero> para dejar la lista y luego marcarlos)');
}

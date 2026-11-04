/**
 * Marca en public/data/channels.json los canales que el NAVEGADOR no puede
 * reproducir, aunque el servidor los dé por vivos.
 *
 *   node scripts/marcar-canales.mjs <ids.json>
 *   node scripts/marcar-canales.mjs <ids.json> --dry
 *
 * MARCA, no borra: les pone `"webPlayable": false` y un `webReason` con el
 * motivo. Siguen en la lista, al final de su categoria y con su aviso en la
 * tarjeta. Borrarlos seria mas limpio de ver, pero esconde informacion que es
 * verdad —el canal existe y emite— y que deja de serlo en cuanto el origen
 * arregle sus cabeceras o se sirva la app detras de un proxy.
 *
 * Por que hace falta otra verificacion
 * ------------------------------------
 * `check-channels.mjs` corre en Node y comprueba lo que se puede comprobar
 * desde un servidor: que el playlist responda y que la variante exista. Hay
 * dos cosas que NO puede ver, y las dos deciden si un canal reproduce:
 *
 *   CORS    hls.js baja el playlist con fetch, asi que el origen tiene que
 *           mandar Access-Control-Allow-Origin. Node no tiene origen, asi que
 *           para el siempre pasa.
 *   CODECS  reproducir por MSE exige que el navegador sepa decodificar lo que
 *           anuncia el playlist. AC-3 o HEVC son 200 por HTTP y silencio en
 *           pantalla.
 *
 * Un canal sin CORS todavia puede salvarse por el reproductor nativo, que no
 * lo necesita; solo se marca el que falla por los DOS caminos.
 *
 * La lista sale de scripts/sonda-reproduccion.js, que se pega en la consola
 * del navegador y solo da por bueno un canal cuyo video avanza.
 */
import { readFile } from 'node:fs/promises';
import { leerMaestro, escribirMaestro, ordenar } from './lib/canales.mjs';


const args = process.argv.slice(2);
const dry = args.includes('--dry');
const idsPath = args.find((a) => !a.startsWith('--'));

if (!idsPath) {
  console.error('uso: node scripts/marcar-canales.mjs <ids.json> [--dry]');
  process.exit(1);
}

const crudo = JSON.parse(await readFile(idsPath, 'utf8'));
// Se acepta ["id", ...] o [{ id, motivo }, ...].
const motivos = new Map(
  crudo.map((e) => (typeof e === 'string' ? [e, 'cors'] : [e.id, e.motivo ?? 'cors'])),
);

const canales = await leerMaestro();

let marcados = 0;
let desmarcados = 0;

for (const canal of canales) {
  if (motivos.has(canal.id)) {
    if (canal.webPlayable !== false) marcados++;
    canal.webPlayable = false;
    canal.webReason = motivos.get(canal.id);
  } else if (canal.webPlayable === false) {
    // Volvio a funcionar: la marca se quita sola en la siguiente pasada.
    delete canal.webPlayable;
    delete canal.webReason;
    desmarcados++;
  }
}

/* Los que no reproducen van al final de su categoria (lo hace `ordenar`). No se
   esconden, pero tampoco ocupan las primeras filas de la rejilla. */
const salida = ordenar(canales);

if (!dry) await escribirMaestro(salida);

const malos = salida.filter((c) => c.webPlayable === false);
const porMotivo = malos.reduce((m, c) => ((m[c.webReason] = (m[c.webReason] ?? 0) + 1), m), {});
const porCategoria = malos.reduce((m, c) => ((m[c.category] = (m[c.category] ?? 0) + 1), m), {});

console.log(`\n${dry ? '[dry] ' : ''}marcado por reproduccion real`);
console.log(`  canales            : ${salida.length}`);
console.log(`  marcados ahora     : ${marcados}`);
if (desmarcados) console.log(`  vuelven a funcionar: ${desmarcados}`);
console.log(`  no reproducen      : ${malos.length}  (${((malos.length / salida.length) * 100).toFixed(1)} %)`);
console.log(`  por motivo         : ${JSON.stringify(porMotivo)}`);
console.log(`  por categoria      : ${JSON.stringify(porCategoria)}`);

const huerfanos = [...motivos.keys()].filter((id) => !salida.some((c) => c.id === id));
if (huerfanos.length) console.log(`  ! ids que ya no estaban: ${huerfanos.length}`);

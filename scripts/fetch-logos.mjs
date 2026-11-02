/**
 * Baja los logos de cadena a public/img/cadenas/.
 *
 *   node scripts/fetch-logos.mjs
 *
 * Por que local y no enlazado a Wikipedia
 * ---------------------------------------
 * Antes estas imagenes se pedian a `Special:FilePath`, que funciona pero
 * depende de un tercero: si el fichero se renombra o se borra alli, aqui
 * desaparece, y Wikimedia desaconseja que otros sitios enlacen a sus imagenes.
 * Servidas desde public/ cargan del mismo origen, entran en el cache del CDN
 * con el resto de la app y no se rompen solas.
 *
 * Este fichero es ademas el registro de DE DONDE salio cada logo: el nombre
 * exacto del fichero en Wikipedia y en que idioma esta la pagina. Sin eso,
 * dentro de un año nadie sabe como actualizarlos.
 *
 * Son logos de marca, propiedad de cada cadena. Estan aqui como identificacion
 * editorial del catalogo, que es el mismo uso que hace Wikipedia.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DESTINO = new URL('../public/img/cadenas/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const LOGOS = [
  ['cartoon-network', 'en', 'Cartoon_Network_2010_logo.svg'],
  ['nickelodeon', 'en', 'Nickelodeon_2023_logo_(outline).svg'],
  ['fox-kids', 'en', 'FOX_Kids_logo.svg'],
  ['hanna-barbera', 'en', 'Hanna-Barbera_wordmark.svg'],
  ['disney-channel', 'en', '2024_Disney_Channel_text_logo.svg'],
  ['marvel', 'en', 'MarvelLogo.svg'],
  ['warner-channel', 'es', 'Warner_Channel_2026.svg'],
];

// Un SVG pesa unos pocos KB y se ve nitido a cualquier tamano, que es lo que
// hace falta para un logo que aparece a 24 px en una pestaña y a 36 en una
// tarjeta. Si alguno viniera enorme, se avisa para bajarlo como PNG.
const AVISO_KB = 120;

await mkdir(DESTINO, { recursive: true });

let fallos = 0;

for (const [slug, wiki, file] of LOGOS) {
  const url = `https://${wiki}.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
  try {
    // Wikipedia limita las peticiones seguidas y devuelve 429 a mitad de la
    // tanda (paso de verdad: siete descargas, una fallo). Se reintenta
    // espaciando, que es lo que pide esa respuesta.
    let res;
    for (let intento = 1; intento <= 4; intento++) {
      res = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'RewindTv/0.1 (catalogo retro; descarga puntual de logos)' },
      });
      if (res.status !== 429) break;
      await new Promise((sigue) => setTimeout(sigue, intento * 4000));
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const tipo = res.headers.get('content-type') ?? '';
    const ext = tipo.includes('svg') ? 'svg' : tipo.includes('png') ? 'png' : 'bin';
    const bytes = Buffer.from(await res.arrayBuffer());
    const kb = bytes.length / 1024;

    await writeFile(join(DESTINO, `${slug}.${ext}`), bytes);
    console.log(
      `  ${slug.padEnd(16)} ${String(kb.toFixed(1)).padStart(7)} KB  ${ext}  <- ${wiki}:${file}` +
        (kb > AVISO_KB ? '  (!) pesado para un logo' : ''),
    );
  } catch (err) {
    fallos++;
    console.error(`  ${slug.padEnd(16)} FALLA: ${err.message}`);
  }
}

console.log(`\n${LOGOS.length - fallos}/${LOGOS.length} logos en public/img/cadenas/`);
if (fallos) process.exitCode = 1;

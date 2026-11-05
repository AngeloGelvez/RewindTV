/**
 * Modo televisor.
 *
 * Un navegador de Smart TV no tiene raton ni pantalla tactil: tiene un mando
 * con flechas, OK y Atras. Este modulo decide si estamos en uno y, si es asi,
 * pone `html.tv`, que activa la interfaz de 3 metros (ver main.css).
 *
 * Deteccion, por orden:
 *   1. ?tv=1 / ?tv=0 en la URL. Se recuerda, para probar desde un PC o para
 *      forzarlo en un televisor que no se identifique bien.
 *   2. User agent de las plataformas conocidas (Tizen, webOS, Android TV,
 *      Fire TV, Chromecast, HbbTV, VIDAA...).
 *   3. Lo que el aparato puede hacer. Muchos televisores Android no dicen "TV"
 *      en su user agent, y algunos navegadores se presentan como un movil. Lo
 *      que no pueden fingir es el hardware: sin pantalla tactil y sin raton solo
 *      queda el mando.
 *
 * `?tv=info` ensena en pantalla lo que ve esta deteccion, para diagnosticar un
 * televisor concreto sin consola.
 *
 * La navegacion por flechas (spatialNav.js) funciona SIEMPRE, no solo aqui:
 * un teclado tambien tiene flechas.
 */

const UA_TV =
  /SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|HbbTV|BRAVIA|AFT[A-Z]|CrKey|Android TV|GoogleTV|AndroidTV|Roku|PhilipsTV|VIDAA|Hisense|Viera|DTV|TV Safari|\bTV\b|MiTV|MiBOX|Chromecast|SHIELD/i;

const KEY = 'rewind:tv';

function forced() {
  try {
    const q = new URLSearchParams(location.search).get('tv');
    // `?tv=1` se recuerda, que es lo util en un televisor que no se
    // identifica. `?tv=0` BORRA la marca en vez de guardar un "no": si se
    // guardara, un PC que probo el modo TV se quedaria con una preferencia
    // pegada para siempre, y un televisor que lo desactivo una vez no volveria
    // a detectarse solo.
    if (q === '1') localStorage.setItem(KEY, '1');
    else if (q === '0') localStorage.removeItem(KEY);
    const guardado = localStorage.getItem(KEY);
    // Un '0' guardado viene de la version anterior, cuando el "no" tambien se
    // recordaba. Se limpia al pasar: si no, ese navegador no volveria a
    // detectar un televisor nunca.
    if (guardado === '0') {
      localStorage.removeItem(KEY);
      return null;
    }
    return guardado;
  } catch {
    return null;
  }
}

/** La decision en si, sin tocar el navegador. */
export function pareceTv({ ua, toques, punteroFino, hover, ancho, alto }) {
  if (UA_TV.test(ua)) return true;
  // Un movil o una tablet siempre tienen pantalla tactil. Y por si alguno no lo
  // declara: un televisor es grande y apaisado, y un telefono no.
  if (toques > 0 || ancho < 960 || ancho <= alto) return false;
  // Ni tactil, ni raton, ni nada que pase por encima: un mando.
  if (!punteroFino && !hover) return true;
  // Android sin tactil en pantalla grande, aunque el mando se comporte como
  // puntero y el navegador diga "Mobile": asi se presenta el de los TCL.
  return /Android/i.test(ua);
}

function rasgos() {
  return {
    ua: navigator.userAgent,
    toques: navigator.maxTouchPoints ?? 0,
    punteroFino: matchMedia('(any-pointer: fine)').matches,
    hover: matchMedia('(any-hover: hover)').matches,
    ancho: screen.width,
    alto: screen.height,
  };
}

export function isTv() {
  if (forced() === '1') return true;
  return pareceTv(rasgos());
}

function mostrarDiagnostico(tv) {
  const caja = document.createElement('pre');
  caja.style.cssText =
    'position:fixed;inset:auto 0 0 0;z-index:9999;margin:0;padding:1rem;background:#000;color:#fff;font-size:1rem;white-space:pre-wrap';
  caja.textContent = JSON.stringify({ tv, ...rasgos(), ventana: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio }, null, 1);
  document.body.appendChild(caja);
}

/** Para decidir en JS lo que en CSS decide `html.tv`. */
export const esTv = () => document.documentElement.classList.contains('tv');

export function initTv() {
  const tv = isTv();
  document.documentElement.classList.toggle('tv', tv);
  if (new URLSearchParams(location.search).get('tv') === 'info') mostrarDiagnostico(tv);

  // Alt+T alterna el modo TV en desarrollo. Es la via para probarlo en un PC
  // sin tocar la URL, y la salida cuando el modo TV esconde la cabecera (donde
  // esta el boton de entrar).
  if (import.meta.env.DEV) {
    addEventListener('keydown', (event) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 't') {
        event.preventDefault();
        toggleTv();
      }
    });
  }
  return tv;
}

/**
 * Entra o sale del modo TV (herramienta de desarrollo). Recarga la pagina: la fuente raiz cambia y con
 * ella las medidas en px del carrusel y la grilla virtualizada, que se
 * calculan una vez. Reutiliza `?tv=1|0`, asi que el resultado es el mismo que
 * escribir la URL a mano.
 */
export function toggleTv() {
  const url = new URL(location.href);
  url.searchParams.set('tv', document.documentElement.classList.contains('tv') ? '0' : '1');
  location.assign(url);
}

/**
 * Factor de la fuente raiz respecto a 16 px. Los componentes que posicionan
 * en px (carrusel y grilla virtualizados) lo usan para crecer con el texto.
 */
export function remScale() {
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return px > 0 ? px / 16 : 1;
}

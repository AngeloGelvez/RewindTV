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
 *
 * La navegacion por flechas (spatialNav.js) funciona SIEMPRE, no solo aqui:
 * un teclado tambien tiene flechas.
 */

const UA_TV =
  /SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|HbbTV|BRAVIA|AFT[A-Z]|CrKey|Android TV|GoogleTV|AndroidTV|Roku|PhilipsTV|VIDAA|Hisense|Viera|DTV|TV Safari/i;

const KEY = 'rewind:tv';

function forced() {
  try {
    const q = new URLSearchParams(location.search).get('tv');
    if (q === '1' || q === '0') localStorage.setItem(KEY, q);
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function isTv() {
  const f = forced();
  if (f === '1') return true;
  if (f === '0') return false;
  return UA_TV.test(navigator.userAgent);
}

export function initTv() {
  const tv = isTv();
  document.documentElement.classList.toggle('tv', tv);
  return tv;
}

/**
 * Factor de la fuente raiz respecto a 16 px. Los componentes que posicionan
 * en px (carrusel y grilla virtualizados) lo usan para crecer con el texto.
 */
export function remScale() {
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return px > 0 ? px / 16 : 1;
}

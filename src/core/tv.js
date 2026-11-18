/** Modo automático y ajustes de la pestaña para probar un televisor. */
const UA_TV = /Smart[ -]?TV|SMARTTV|Tizen|Web0S|webOS[. ]?TV|NetCast|HbbTV|BRAVIA|\bAFT[A-Z0-9]+\b|CrKey|Android[ -]?TV|Google[ -]?TV|Roku|PhilipsTV|VIDAA|Viera|\bDTV\b|TV Safari|\bTV\b|MiTV|MiBOX|Chromecast|SHIELD/i;
const KEY = 'rewind:tv';

export function pareceTv({ ua, toques, ancho, alto }) {
  if (UA_TV.test(ua)) return true;
  // Algunos TCL se identifican como Chrome Mobile y su mando emula un ratón.
  return /Android|\bTCL\b/i.test(ua) && toques === 0 && ancho >= 960 && ancho > alto;
}

function rasgos() {
  return {
    ua: navigator.userAgent,
    toques: navigator.maxTouchPoints,
    ancho: screen.width,
    alto: screen.height,
  };
}

export function isTv() {
  const modo = new URLSearchParams(location.search).get('tv');
  let guardado;
  try {
    // Descarta la preferencia permanente que dejaban las pruebas antiguas.
    localStorage.removeItem(KEY);
  } catch { /* El ajuste de URL funciona incluso sin almacenamiento. */ }
  try {
    if (modo === 'auto') sessionStorage.removeItem(KEY);
    if (modo === '1' || modo === '0') sessionStorage.setItem(KEY, modo);
    guardado = sessionStorage.getItem(KEY);
  } catch { /* Algunos televisores desactivan sessionStorage. */ }
  if (modo === '1' || modo === '0') return modo === '1';
  if (guardado === '1' || guardado === '0') return guardado === '1';
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

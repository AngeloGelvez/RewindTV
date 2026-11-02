/**
 * Tema: dos ejes que se combinan en una sola paleta.
 *
 *   MODO        claro u oscuro. Lo elige la persona; por defecto, el sistema.
 *   FESTIVIDAD  dos colores (`color` y `accent2`) de los que sale el acento.
 *
 * De ahi salen el acento, el texto sobre acento, el acento legible como texto,
 * los halos y las cinco superficies. Se escribe una sola vez en :root y toda
 * la UI cambia sin que ningun componente sepa que existen las festividades.
 *
 * Por que en JS y no con color-mix() en CSS:
 *  1. El contraste se GARANTIZA. Un amarillo de Año Nuevo con texto blanco no
 *     se lee; aqui se elige negro o blanco segun la luminancia real, y el
 *     acento usado como texto se corrige hasta 4.5:1 (WCAG AA) — aclarandolo
 *     en modo oscuro y oscureciendolo en modo claro, que no es lo mismo.
 *  2. Los navegadores de televisores van varias versiones por detras y
 *     color-mix() no existe antes de Chromium 111. Un rgb() plano si.
 *
 * Cuanto color pone la festividad: POCO. El acento manda en lo pequeño
 * (botones, chips, barras, foco) y las superficies solo lo insinuan, con el
 * tinte ya desaturado. Una portada entera teñida de naranja cansa a los dos
 * minutos y hunde el contraste de las fotos, que son el contenido real.
 */

const DEFAULT = { slug: null, color: '#7c5cff', accent2: '#c084fc' };

/* Superficies base por modo. Deben coincidir con tokens.css: esto es lo mismo
   que se ve antes de que arranque el JS. */
const SURFACES = {
  dark: ['#0a0a0c', '#121216', '#1a1a20', '#26262e', '#32323c'],
  light: ['#f2f2f5', '#ffffff', '#f4f4f7', '#e4e4ea', '#d6d6de'],
};

/* Cuanta festividad lleva cada superficie. Bajo y creciente: el fondo de
   pagina casi neutro, los bordes algo mas teñidos. */
const TINT = {
  dark: [0.03, 0.042, 0.055, 0.07, 0.085],
  light: [0.028, 0.012, 0.035, 0.055, 0.07],
};

const MODE_KEY = 'rewind:mode:v1';
const STORE_KEY = 'rewind:theme:v2';

function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c) =>
  '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

/** Mezcla `a` con `b` en proporcion t (0 = solo a, 1 = solo b). */
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const alpha = (c, a) => `rgb(${c.map(Math.round).join(' ')} / ${a})`;

function luminance([r, g, b]) {
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const la = luminance(typeof a === 'string' ? rgb(a) : a);
  const lb = luminance(typeof b === 'string' ? rgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE = [255, 255, 255];
const INK_DARK = [10, 10, 14];

/** Texto (blanco o casi negro) que mejor se lee SOBRE un color de relleno. */
export function inkFor(fill) {
  const c = typeof fill === 'string' ? rgb(fill) : fill;
  return contrast(c, WHITE) >= contrast(c, INK_DARK) ? '#ffffff' : toHex(INK_DARK);
}

/**
 * Oscurece un color hacia el negro de la interfaz. Existe para no escribir
 * color-mix() en los componentes: no llega a los navegadores de television
 * anteriores a Chromium 111, y un degradado roto ahi se ve como un bloque
 * plano.
 */
export function shade(color, t) {
  return toHex(mix(typeof color === 'string' ? rgb(color) : color, INK_DARK, t));
}

/**
 * Le quita saturacion a un color mezclandolo con su propio gris. Es lo que
 * permite teñir una superficie sin que el fondo se vuelva "la pagina naranja":
 * conserva el matiz, pierde la estridencia.
 */
function desaturate(c, t) {
  const y = luminance(c) ** (1 / 2.2) * 255;
  return mix(c, [y, y, y], t);
}

/**
 * Empuja `color` hacia el blanco o hacia el negro —lo que haga falta segun el
 * fondo— hasta alcanzar `min` de contraste. En modo claro el acento hay que
 * oscurecerlo, no aclararlo: es el mismo problema con la solucion invertida.
 */
function readableOn(color, bg, min = 4.5) {
  const destino = luminance(bg) > 0.4 ? INK_DARK : WHITE;
  let c = color;
  for (let t = 0; t <= 1 && contrast(c, bg) < min; t += 0.04) c = mix(color, destino, t);
  return c;
}

/** Modo guardado, o el del sistema si no hay ninguno. */
export function getMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* almacenamiento bloqueado: manda el sistema */
  }
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Calcula todas las variables CSS del tema. Pura: no toca el DOM. */
export function paletteFor(festivity, mode = 'dark') {
  const f = festivity ?? DEFAULT;
  const claro = mode === 'light';
  const a1 = rgb(f.color ?? DEFAULT.color);
  const a2 = rgb(f.accent2 ?? f.color ?? DEFAULT.accent2);

  // El tinte va desaturado; el acento de los rellenos, no.
  const tinte = desaturate(a1, claro ? 0.5 : 0.4);
  const surfaces = SURFACES[mode].map((s, i) => mix(rgb(s), tinte, TINT[mode][i]));

  // El peor caso para texto de acento es la superficie donde se apoya
  // (chips y tarjetas, surface-2), no el fondo de pagina.
  const text = readableOn(a1, surfaces[2]);
  const text2 = readableOn(a2, surfaces[2]);

  const vars = {
    '--fest': toHex(a1),
    '--fest-2': toHex(a2),
    '--fest-ink': inkFor(a1),
    '--fest-text': toHex(text),
    '--fest-text-2': toHex(text2),
    '--fest-soft': alpha(a1, claro ? 0.1 : 0.14),
    '--fest-ring': alpha(text, 0.55),
    '--fest-glow': alpha(a1, claro ? 0.2 : 0.35),
    '--fest-aura': alpha(a2, claro ? 0.07 : 0.09),
    // Translucido de verdad (ver .glass en main.css): si tapa, el desenfoque
    // no se aprecia y la cabecera deja de parecer cristal.
    '--surface-glass': alpha(surfaces[claro ? 1 : 0], claro ? 0.62 : 0.55),
    '--glass-sheen': claro ? 'rgb(255 255 255 / 0.65)' : 'rgb(255 255 255 / 0.07)',
  };
  surfaces.forEach((s, i) => {
    vars[`--color-surface-${i}`] = toHex(s);
  });
  return { slug: f.slug ?? null, mode, vars };
}

function write({ slug, mode, vars }) {
  const root = document.documentElement;
  for (const k in vars) root.style.setProperty(k, vars[k]);
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  if (slug) root.dataset.fest = slug;
  else delete root.dataset.fest;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--color-surface-0']);
}

/* Ultima festividad aplicada: al cambiar de modo hay que recalcular con ella,
   no volver al tema base. */
let actual = null;

/** Aplica la festividad (o el tema base si es null) y lo recuerda. */
export function applyTheme(festivity, mode = getMode()) {
  actual = festivity ?? null;
  const palette = paletteFor(festivity, mode);
  write(palette);
  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ ...palette, festivity: festivity ? { slug: festivity.slug, color: festivity.color, accent2: festivity.accent2 } : null }),
    );
  } catch {
    /* modo privado o almacenamiento bloqueado: solo se pierde el arranque instantaneo */
  }
  return palette;
}

/** Cambia claro <-> oscuro conservando la festividad del dia. */
export function setMode(mode) {
  return applyTheme(actual, mode);
}

export function toggleMode() {
  const siguiente = getMode() === 'dark' ? 'light' : 'dark';
  setMode(siguiente);
  return siguiente;
}

/**
 * Reaplica el ultimo tema guardado de forma sincrona, antes de que llegue el
 * catalogo. Sin esto, en Halloween la app arranca violeta y salta a naranja.
 * El modo ya lo dejo puesto el script en linea de index.html; aqui solo se
 * reconstruye si lo guardado no coincide con el modo activo.
 */
export function restoreTheme() {
  const mode = getMode();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!saved?.vars) return;
    actual = saved.festivity ?? null;
    write(saved.mode === mode ? saved : paletteFor(actual, mode));
  } catch {
    /* sin tema guardado: se queda el base hasta que llegue el catalogo */
  }
}

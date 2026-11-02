/**
 * Imagenes de titulo (portada vertical y fondo apaisado).
 *
 * Los JSON NO guardan la URL completa, guardan el nombre del fichero en TMDB:
 *
 *   "poster": "3Lyc5VqhTqq76vmKUn1an8rlnP7.jpg"
 *   -> https://image.tmdb.org/t/p/w780/3Lyc5VqhTqq76vmKUn1an8rlnP7.jpg
 *
 * Es la misma decision que con las fuentes de video en `embed.js`, y por los
 * mismos dos motivos:
 *
 *  1. PESO. `titles.json` se baja en el arranque. Con 503 titulos, repetir el
 *     prefijo "https://image.tmdb.org/t/p/w780/" en dos campos son ~34 KB de
 *     texto que no dicen nada.
 *  2. EL TAMANO ES UNA DECISION DE LA UI, NO DEL DATO. Cambiar las portadas a
 *     w500 para ahorrar datos, o servirlas desde otro sitio, se hace aqui, no
 *     reescribiendo 503 registros.
 *
 * Una ruta que empieza por "/" o por "http" se respeta tal cual: asi convive
 * una imagen propia en `public/img/` con las de TMDB sin casos especiales.
 */
const TMDB = 'https://image.tmdb.org/t/p/';

/** Ancho pedido por tipo de imagen. Es lo unico que hay que tocar. */
const ANCHO = {
  poster: 'w780',
  backdrop: 'w1280',
  card: 'w500', // tarjeta de catalogo: nunca pasa de ~300 px en pantalla
  still: 'w300', // fotograma de episodio
};

export function imageUrl(valor, tipo = 'poster') {
  if (!valor) return null;
  if (valor.startsWith('http') || valor.startsWith('/')) return valor;
  return `${TMDB}${ANCHO[tipo] ?? ANCHO.poster}/${valor}`;
}

/**
 * Reescribe el ancho de una URL de TMDB ya construida.
 *
 * Existe por un caso concreto: la rejilla de episodios usa el fondo de la
 * serie como respaldo, y ese fondo ya viene en w1280 porque es el que usa el
 * hero. Pedir la version de 300 px para una miniatura ahorra casi todo su peso
 * sin tocar el dato ni duplicar campos.
 */
export function atSize(url, tipo) {
  if (!url) return null;
  const ancho = ANCHO[tipo];
  return ancho && url.startsWith(TMDB) ? url.replace(/\/t\/p\/[^/]+\//, `/t/p/${ancho}/`) : url;
}

/** Dominio al que conviene abrir conexion pronto (ver index.html). */
export const IMAGE_HOST = 'https://image.tmdb.org';

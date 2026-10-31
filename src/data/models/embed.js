/**
 * Resolucion de embeds. El sitio de referencia incrusta un iframe por capitulo;
 * nosotros guardamos solo { provider, id } y construimos la URL aqui.
 *
 * Ventaja de rendimiento: un iframe de terceros carga su propio runtime (cientos
 * de KB) y bloquea el hilo. Por eso el Player monta una *facade*: poster + boton,
 * y el iframe solo se inserta tras el primer click del usuario.
 */
const BUILDERS = {
  okru: (id) => `https://ok.ru/videoembed/${id}`,
  vk: (id) => `https://vk.com/video_ext.php?${id}`,
  dailymotion: (id) => `https://www.dailymotion.com/embed/video/${id}`,
  mp4: (id) => id,
};

export function embedUrl(source) {
  if (!source) return null;
  const build = BUILDERS[source.provider];
  if (!build) throw new Error(`[embed] proveedor desconocido: ${source.provider}`);
  return build(source.id);
}

export const isIframe = (source) => source != null && source.provider !== 'mp4';

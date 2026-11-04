/**
 * Reproductor con FACADE + fallback ordenado de fuentes.
 *
 * El problema que resuelve la facade: un iframe de terceros (ok.ru, vk...)
 * carga cientos de KB de runtime propio y bloquea el hilo ANTES de que el
 * usuario decida ver nada. hls.js pesa parecido. Por eso aqui no se monta nada
 * al entrar: se pinta un poster con un boton, y solo al primer click se inserta
 * el iframe o se importa hls.js. Si el usuario solo venia a leer la sinopsis,
 * no paga ese coste.
 *
 * El fallback es asimetrico a proposito, porque las fuentes no son iguales:
 *
 *  - fichero / HLS: el <video> y hls.js avisan de los errores. El salto a la
 *    siguiente fuente es AUTOMATICO y el usuario no ve nada raro.
 *  - iframe: opaco por origen cruzado. No podemos detectar que el proveedor
 *    pinto "video no disponible", asi que el salto lo pide el usuario con un
 *    boton. Fingir una deteccion automatica aqui seria mentir en la UI.
 *
 * Vive en su propio chunk (ver manualChunks en vite.config.js).
 */
import { el } from '../../core/dom.js';
import { defineComponent } from '../base/Component.js';
import { icon } from '../ui/icons.js';
import { embedUrl, isIframe, isHlsUrl, providerLabel, providerPing } from '../../data/models/embed.js';
import { rank, markOk, markFailed } from '../../data/sourceHealth.js';
import { emit, EVENTS } from '../../core/eventBus.js';

// Cloudflare tarda mas que esto en devolver su error 522, asi que un servicio
// caido se detecta por no contestar a tiempo.
const PLAZO_SONDA = 8000;

export const Player = defineComponent({
  setup({ source, sources, poster, label, autoplay = false }, { onDispose }) {
    const marco = el('div', {
      class: 'relative aspect-video w-full overflow-hidden rounded-card bg-black ring-fest',
    });

    // `sources` es la lista nueva; `source` el formato de una sola fuente.
    const candidatas = sources?.length ? sources : source ? [source] : [];

    let hls = null;
    let arrancado = false;
    let orden = [];
    let indice = 0;
    let sonda = null;

    const caratula = el('button', {
      type: 'button',
      class: 'absolute inset-0 grid place-items-center bg-surface-1 transition hover:bg-surface-2',
      'aria-label': `Reproducir ${label ?? ''}`.trim(),
      'data-autofocus': '',
      onClick: () => arrancar(),
    });

    if (poster) {
      caratula.appendChild(
        el('img', {
          src: poster,
          alt: '',
          'aria-hidden': 'true',
          class: 'absolute inset-0 size-full object-cover opacity-45',
          decoding: 'async',
        }),
      );
    }
    caratula.appendChild(
      el('span', { class: 'relative grid size-16 place-items-center rounded-full bg-[var(--fest)] text-[var(--fest-ink)] shadow-[var(--shadow-pop)]' }, [
        icon('play', 'size-7'),
      ]),
    );
    caratula.appendChild(
      el(
        'span',
        { class: 'absolute bottom-3 left-3 rounded-pill bg-surface-0/80 px-2.5 py-1 text-[11px] text-ink-1' },
        'El reproductor se carga al pulsar',
      ),
    );

    marco.appendChild(caratula);

    function arrancar() {
      if (arrancado) return;
      arrancado = true;
      caratula.remove();
      if (!candidatas.length) {
        mostrarError('Este capitulo no tiene ninguna fuente disponible.');
        return;
      }
      // Se ordena al arrancar, no al construir: para entonces los veredictos
      // guardados ya estan hidratados y una fuente caida no va primera.
      orden = rank(candidatas);
      indice = 0;
      montar();
    }

    /** Cierra lo que haya montado y deja el marco vacio. */
    function limpiarMedia() {
      sonda?.abort();
      sonda = null;
      hls?.destroy();
      hls = null;
      const video = marco.querySelector('video');
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      marco.replaceChildren();
    }

    /**
     * Pasa a la siguiente fuente. `motivo` queda en el veredicto, que es lo que
     * hace que en la proxima visita esta fuente ya no vaya primera.
     */
    function siguiente(motivo) {
      markFailed(orden[indice], motivo);
      limpiarMedia();
      if (indice >= orden.length - 1) {
        const total = orden.length;
        // Sin la palabra "capitulo": el mismo reproductor sirve un canal en
        // vivo, y ahi el mensaje no tenia sentido.
        mostrarError(
          total === 1
            ? 'Esta fuente no responde ahora mismo.'
            : `Ninguna de las ${total} fuentes responde ahora mismo.`,
        );
        return;
      }
      indice++;
      montar();
    }

    function montar() {
      const actual = orden[indice];
      if (isIframe(actual)) montarIframe(actual);
      else montarVideo(actual);
    }

    function montarIframe(actual) {
      marco.appendChild(
        el('iframe', {
          src: embedUrl(actual),
          class: 'absolute inset-0 size-full border-0',
          allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
          allowfullscreen: true,
          referrerpolicy: 'origin',
          loading: 'lazy',
          title: label ?? 'Reproductor',
        }),
      );
      // No hay evento fiable que distinga "cargo" de "el proveedor dice que no
      // existe", asi que la decision la toma quien esta mirando.
      if (indice < orden.length - 1) marco.appendChild(botonOtraFuente());
      vigilarProveedor(actual);
      marco.appendChild(insignia());
    }

    /**
     * Avisa si el servicio del proveedor no contesta, en vez de dejar la
     * pantalla en negro. El iframe ya esta cargando detras: quien funciona no
     * espera nada, y el aviso solo aparece si la sonda falla.
     *
     * `no-cors` no deja leer el codigo de respuesta, asi que solo se distingue
     * "contesta" de "no contesta". Un servicio que contesta y luego no carga el
     * video sigue sin detectarse.
     */
    async function vigilarProveedor(actual) {
      const ping = providerPing(actual);
      if (!ping) return;
      const control = new AbortController();
      sonda = control;
      const plazo = setTimeout(() => control.abort(), PLAZO_SONDA);
      let caido = false;
      try {
        await fetch(ping, {
          mode: 'no-cors',
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: control.signal,
        });
      } catch {
        caido = true;
      } finally {
        clearTimeout(plazo);
      }
      // Otra sonda u otra fuente ocupo su lugar, o la vista ya se cerro.
      if (sonda !== control) return;
      sonda = null;
      if (caido) mostrarAvisoProveedor(actual);
    }

    function mostrarAvisoProveedor(actual) {
      const reintentar = el(
        'button',
        {
          type: 'button',
          class: 'rounded-pill border border-surface-3 px-4 py-1.5 text-xs text-ink-0 hover:border-[var(--fest-text)]',
          onClick: () => {
            limpiarMedia();
            montar();
          },
        },
        'Reintentar',
      );
      // La sonda puede equivocarse (un bloqueador, una red lenta): el aviso no
      // debe impedir ver un video que si esta cargando detras.
      const aviso = el('div', { class: 'absolute inset-0 z-20 grid place-content-center gap-3 bg-surface-1 p-6 text-center', role: 'alert' }, [
        el('p', { class: 'text-sm font-semibold text-ink-0' }, `${providerLabel(actual)} no responde ahora mismo`),
        el('p', { class: 'text-xs text-ink-1' }, 'Puede ser una caida temporal del proveedor del video. Prueba de nuevo en un rato.'),
        el('div', { class: 'flex justify-center gap-2' }, [
          reintentar,
          el(
            'button',
            {
              type: 'button',
              class: 'rounded-pill px-4 py-1.5 text-xs text-ink-1 hover:text-ink-0',
              onClick: () => aviso.remove(),
            },
            'Ver de todos modos',
          ),
        ]),
      ]);
      marco.appendChild(aviso);
      reintentar.focus();
    }

    async function montarVideo(actual) {
      const video = el('video', {
        class: 'absolute inset-0 size-full bg-black',
        controls: true,
        playsinline: true,
        autoplay: true,
        preload: 'metadata',
      });
      marco.appendChild(video);
      marco.appendChild(insignia());

      const url = embedUrl(actual);

      // Primer frame reproducido = la fuente sirve de verdad.
      video.addEventListener('playing', () => markOk(actual), { once: true });
      video.addEventListener('timeupdate', () => {
        emit(EVENTS.MEDIA_PROGRESS, { label, position: video.currentTime });
      });
      video.addEventListener('ended', () => emit(EVENTS.MEDIA_ENDED, { label }));
      // Lo rellena el camino HLS de mas abajo: mientras quede un reintento
      // (la libreria y el reproductor del navegador son dos intentos, no uno),
      // el error no mata la fuente todavia.
      let reintento = null;

      // Este error si es inequivoco: el navegador no pudo con el recurso.
      video.addEventListener('error', () => {
        const code = video.error?.code;
        const motivo = code ? `media error ${code}` : 'media error';
        if (reintento) reintento(motivo);
        else siguiente(motivo);
      });

      // El `kind` lo calcula `createSource`, pero una fuente construida a mano
      // puede no traerlo, y entonces un m3u8 se intentaria reproducir como si
      // fuera un mp4. La extension es la prueba de ultimo recurso.
      const esHls = actual.kind === 'hls' || isHlsUrl(url);

      if (!esHls) {
        video.src = url;
        return;
      }

      /*
       * HLS: DOS CAMINOS, y ninguno gana siempre.
       *
       *   hls.js   descarga el playlist con fetch, asi que necesita CORS, y
       *            a cambio entiende variantes que el navegador rechaza.
       *   nativo   no necesita CORS —un <video> puede pedir lo que quiera—
       *            pero en Chrome solo traga HLS sencillos.
       *
       * Antes solo se intentaba el nativo, porque la condicion era
       * `canPlayType('application/vnd.apple.mpegurl')` y Chrome contesta
       * "maybe": dice que quiza pueda, se le da el playlist y falla con
       * MEDIA_ERR_SRC_NOT_SUPPORTED. De los 28 primeros canales del catalogo,
       * 13 fallaban asi con el stream perfectamente vivo.
       *
       * Ahora se prueban los dos antes de dar la fuente por muerta: primero la
       * libreria y, si avisa de un error fatal, el nativo. Solo cuando los dos
       * fallan se pasa a la siguiente fuente. `Hls.isSupported()` mira si hay
       * Media Source Extensions y no miente; donde no las hay —el Safari del
       * iPhone— el soporte nativo es justamente el bueno.
       */
      const caerANativo = (motivo) => {
        reintento = null; // el nativo es el ultimo intento: si falla, se acabo
        hls?.destroy();
        hls = null;
        console.warn(`[player] ${motivo}: se reintenta con el reproductor del navegador`);
        video.removeAttribute('src');
        video.src = url;
        video.load();
      };
      reintento = caerANativo;

      try {
        const { default: Hls } = await import('hls.js');
        if (!Hls.isSupported()) {
          video.src = url;
          return;
        }
        hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 60 });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          caerANativo(`hls ${data.details ?? data.type}`);
        });
      } catch (err) {
        console.error('[player] hls', err);
        caerANativo('hls no disponible');
      }
    }

    function botonOtraFuente() {
      return el(
        'button',
        {
          type: 'button',
          class:
            'absolute right-3 top-3 z-10 rounded-pill bg-surface-0/85 px-3 py-1.5 text-[11px] text-ink-0 ring-1 ring-surface-3 hover:ring-[var(--fest)]',
          onClick: () => siguiente('descartada por el usuario'),
        },
        'No carga: probar otra fuente',
      );
    }

    /** Solo tiene sentido ensenarla cuando hay de donde elegir. */
    function insignia() {
      if (orden.length < 2) return el('span', { class: 'hidden' });
      return el(
        'span',
        {
          class:
            'absolute bottom-3 left-3 z-10 rounded-pill bg-surface-0/80 px-2.5 py-1 text-[11px] text-ink-1',
        },
        `Fuente ${indice + 1} de ${orden.length} - ${providerLabel(orden[indice])}`,
      );
    }

    function mostrarError(texto) {
      marco.replaceChildren(
        el('div', { class: 'absolute inset-0 grid place-content-center gap-2 p-6 text-center' }, [
          el('p', { class: 'text-sm text-ink-1' }, texto),
          el(
            'button',
            {
              type: 'button',
              class: 'mx-auto rounded-pill border border-surface-3 px-4 py-1.5 text-xs text-ink-0 hover:border-[var(--fest-text)]',
              onClick: () => location.reload(),
            },
            'Reintentar',
          ),
        ]),
      );
    }

    onDispose(() => {
      limpiarMedia();
    });

    if (autoplay) arrancar();

    return { node: marco, play: arrancar };
  },
});

export default Player;

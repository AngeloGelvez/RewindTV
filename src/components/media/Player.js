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
import { embedUrl, isIframe, providerLabel } from '../../data/models/embed.js';
import { rank, markOk, markFailed } from '../../data/sourceHealth.js';
import { emit, EVENTS } from '../../core/eventBus.js';

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
        mostrarError(
          total === 1
            ? 'La fuente de este capitulo no responde.'
            : `Ninguna de las ${total} fuentes de este capitulo responde.`,
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
      marco.appendChild(insignia());
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
      // Este error si es inequivoco: el navegador no pudo con el recurso.
      video.addEventListener('error', () => {
        const code = video.error?.code;
        siguiente(code ? `media error ${code}` : 'media error');
      });

      if (actual.kind !== 'hls' || video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari reproduce HLS de forma nativa: no hace falta la libreria.
        video.src = url;
        return;
      }

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
          siguiente(`hls ${data.details ?? data.type}`);
        });
      } catch (err) {
        console.error('[player] hls', err);
        siguiente('hls no disponible');
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

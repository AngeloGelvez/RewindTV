/**
 * Reproductor con FACADE.
 *
 * El problema que resuelve: un iframe de terceros (ok.ru, dhtpre...) carga
 * cientos de KB de runtime propio y bloquea el hilo ANTES de que el usuario
 * decida ver nada. hls.js pesa parecido.
 *
 * Por eso aqui no se monta nada al entrar: se pinta un poster con un boton, y
 * solo al primer click se inserta el iframe o se importa hls.js. Si el usuario
 * solo venia a leer la sinopsis, no paga ese coste.
 *
 * Vive en su propio chunk (ver manualChunks en vite.config.js).
 */
import { el } from '../../core/dom.js';
import { defineComponent } from '../base/Component.js';
import { icon } from '../ui/icons.js';
import { embedUrl, isIframe } from '../../data/models/embed.js';
import { emit, EVENTS } from '../../core/eventBus.js';

export const Player = defineComponent({
  setup({ source, poster, label, autoplay = false }, { onDispose }) {
    const marco = el('div', {
      class: 'relative aspect-video w-full overflow-hidden rounded-card bg-black ring-fest',
    });

    let hls = null;
    let arrancado = false;

    const caratula = el('button', {
      type: 'button',
      class: 'absolute inset-0 grid place-items-center bg-surface-1 transition hover:bg-surface-2',
      'aria-label': `Reproducir ${label ?? ''}`.trim(),
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
      el('span', { class: 'relative grid size-16 place-items-center rounded-full bg-[var(--fest)] text-white shadow-[var(--shadow-pop)]' }, [
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

    async function arrancar() {
      if (arrancado || !source) return;
      arrancado = true;
      caratula.remove();

      if (isIframe(source)) {
        marco.appendChild(
          el('iframe', {
            src: embedUrl(source),
            class: 'absolute inset-0 size-full border-0',
            allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
            allowfullscreen: true,
            referrerpolicy: 'origin',
            loading: 'lazy',
            title: label ?? 'Reproductor',
          }),
        );
        return;
      }

      const video = el('video', {
        class: 'absolute inset-0 size-full bg-black',
        controls: true,
        playsinline: true,
        autoplay: true,
        preload: 'metadata',
      });
      marco.appendChild(video);

      const url = embedUrl(source);
      video.addEventListener('timeupdate', () => {
        emit(EVENTS.MEDIA_PROGRESS, { label, position: video.currentTime });
      });
      video.addEventListener('ended', () => emit(EVENTS.MEDIA_ENDED, { label }));

      const esHls = /\.m3u8(\?|$)/i.test(url);
      if (!esHls || video.canPlayType('application/vnd.apple.mpegurl')) {
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
          mostrarError('No se pudo cargar este canal. Puede estar caido o fuera de su franja.');
        });
      } catch (err) {
        console.error('[player] hls', err);
        mostrarError('No se pudo iniciar el reproductor.');
      }
    }

    function mostrarError(texto) {
      marco.replaceChildren(
        el('div', { class: 'absolute inset-0 grid place-content-center gap-2 p-6 text-center' }, [
          el('p', { class: 'text-sm text-ink-1' }, texto),
          el(
            'button',
            {
              type: 'button',
              class: 'mx-auto rounded-pill border border-surface-3 px-4 py-1.5 text-xs text-ink-0 hover:border-[var(--fest)]',
              onClick: () => location.reload(),
            },
            'Reintentar',
          ),
        ]),
      );
    }

    onDispose(() => {
      hls?.destroy();
      hls = null;
      marco.querySelector('video')?.pause();
      marco.replaceChildren();
    });

    if (autoplay) arrancar();

    return { node: marco, play: arrancar };
  },
});

export default Player;

import { el } from '../../core/dom.js';
import { defineComponent } from '../base/Component.js';
import { createSource } from '../../data/models/embed.js';
import { Player } from './Player.js';
import { icon } from '../ui/icons.js';

function loadingFrame(message) {
  return el('div', {
    class: 'pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[radial-gradient(ellipse_at_center,var(--fest-soft),transparent_65%)] text-white',
    role: 'status',
  }, el('div', { class: 'grid justify-items-center gap-4' }, [
    el('span', { class: 'relative grid size-16 place-items-center rounded-full border border-white/15 bg-black/50', 'aria-hidden': 'true' }, [
      el('span', { class: 'absolute -inset-1 rounded-full border-2 border-transparent border-t-[var(--fest)] border-r-[var(--fest)] motion-safe:animate-spin' }),
      icon('play', 'size-6'),
    ]),
    el('span', { class: 'text-sm font-medium' }, message),
  ]));
}

export const MoviePlayer = defineComponent({
  setup({ title }, { onDispose }) {
    const node = el('div', { class: 'relative aspect-video w-full overflow-hidden rounded-card bg-black' });
    let player;
    let request;
    let disposed = false;
    let language;
    let retried = false;

    async function open(position = 0) {
      request?.abort();
      const current = new AbortController();
      request = current;
      player?.destroy();
      node.replaceChildren(loadingFrame(position ? 'Reconectando…' : 'Cargando película…'));
      try {
        const base = (import.meta.env.VITE_MOVIE_API_BASE || '').replace(/\/$/, '');
        const api = `${base}/api/movies/${encodeURIComponent(title.id)}/source`;
        const query = language ? `?idioma=${encodeURIComponent(language)}` : '';
        const response = await fetch(`${api}${query}`, { signal: current.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (disposed || current.signal.aborted) return;
        const source = createSource(['mp4', data.url], title.id);
        if (!source) throw new Error('Fuente no válida');
        language = data.idioma;
        player = Player({ source, poster: title.backdrop ?? title.poster, label: title.name,
          autoplay: true, startPosition: position,
          onSourceExpired: (currentPosition) => {
            if (retried) return false;
            retried = true;
            open(currentPosition);
            return true;
          },
        });
        const loading = loadingFrame('Preparando el vídeo…');
        const video = player.node.querySelector('video');
        if (video && video.readyState < 2) {
          video.addEventListener('loadeddata', () => loading.remove(), { once: true });
          video.addEventListener('error', () => loading.remove(), { once: true });
          node.replaceChildren(player.node, loading);
        } else {
          node.replaceChildren(player.node);
        }
      } catch {
        if (disposed || current.signal.aborted) return;
        node.replaceChildren(el('div', { class: 'absolute inset-0 grid place-content-center gap-3 text-center text-white' }, [
          el('p', { role: 'status' }, 'No se pudo cargar la película.'),
          el('button', { type: 'button', class: 'mt-2 underline', onClick: () => {
            retried = false;
            open(position);
          } }, 'Reintentar'),
        ]));
      }
    }

    onDispose(() => { disposed = true; request?.abort(); player?.destroy(); });
    open();
    return { node };
  },
});

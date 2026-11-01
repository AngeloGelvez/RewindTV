/**
 * Imagen diferida con hueco reservado y respaldo si la carga falla.
 *
 * Reservar el tamano antes de cargar es lo que mantiene el CLS en 0: el hueco
 * ya ocupa su sitio, la imagen solo lo rellena.
 *
 * El respaldo importa de verdad aqui: los logos de canal vienen de terceros
 * (imgur, wikimedia...) y algunos ya devuelven 404. Sin esto se veria el icono
 * de imagen rota del navegador.
 */
import { observeIntersection } from '../../patterns/observer.js';
import { write } from '../../core/scheduler.js';

export function hydrateImage(img, { onError } = {}) {
  const src = img.dataset.src;
  if (!src) return;

  const stop = observeIntersection(
    img,
    (entry, observer) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(img);
      write(() => {
        img.src = src;
      });
    },
    { rootMargin: '300px' },
  );

  img.__stopLazy = stop;

  // Un solo par de handlers por nodo; el pool los reutiliza con el resto.
  if (!img.__bound) {
    img.__bound = true;
    img.addEventListener('load', () => {
      img.classList.remove('opacity-0');
      img.__onError = null;
    });
    img.addEventListener('error', () => {
      img.classList.add('opacity-0');
      img.__onError?.();
    });
  }
  img.__onError = onError ?? null;
}

export function resetImage(img) {
  img.__stopLazy?.();
  img.__stopLazy = null;
  img.__onError = null;
  img.removeAttribute('src');
  img.dataset.src = '';
  img.classList.add('opacity-0');
}

/** Iniciales de respaldo cuando no hay imagen: "2 Perros Tontos" -> "2P". */
export function initials(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

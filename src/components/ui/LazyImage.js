/**
 * Imagen diferida. Un solo IntersectionObserver compartido decide cuando
 * asignar el src; antes de eso el hueco ya tiene tamano reservado para que
 * no haya layout shift (CLS = 0).
 */
import { observeIntersection } from '../../patterns/observer.js';
import { write } from '../../core/scheduler.js';

export function hydrateImage(img) {
  const src = img.dataset.src;
  if (!src || img.src.endsWith(src)) return;
  const stop = observeIntersection(
    img,
    (entry, observer) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(img);
      write(() => {
        img.src = src;
        img.classList.remove('opacity-0');
      });
    },
    { rootMargin: '300px' },
  );
  img.__stopLazy = stop;
}

export function resetImage(img) {
  img.__stopLazy?.();
  img.__stopLazy = null;
  img.removeAttribute('src');
  img.dataset.src = '';
  img.classList.add('opacity-0');
}

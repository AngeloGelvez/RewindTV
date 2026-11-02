/**
 * Tarjeta de canal en vivo.
 *
 * El problema real: los logos vienen de terceros y no comparten criterio. Unos
 * son PNG transparentes pensados para fondo claro, otros JPG con su propio
 * fondo blanco. Sobre una superficie oscura, los primeros desaparecen y los
 * segundos aparecen como recuadros blancos sueltos.
 *
 * Solucion: TODOS van sobre la misma placa clara y redonda. Asi el logo
 * transparente se lee, el que ya trae fondo blanco se funde con la placa, y el
 * conjunto parece deliberado en vez de accidental.
 *
 * Formato de ficha y no de miniatura: un canal no tiene fotograma que ensenar
 * —el logo ya es su cara— y en cambio si tiene datos que importan antes de
 * pulsar (pais, genero, calidad, si emite 24/7). Esos datos necesitan lineas
 * de texto, no un rectangulo de imagen.
 *
 * Es un <a> real (ver TitleCard): alcanzable con teclado y con mando.
 */
import { template, resetLayout } from '../../core/dom.js';
import { createPool } from '../../patterns/objectPool.js';
import { hydrateImage, resetImage, initials } from '../ui/LazyImage.js';

const cloneCard = template(`
  <a class="card-surface group flex select-none flex-col justify-between rounded-card border bg-surface-2/60 p-4 transition duration-300 ease-[var(--ease-out-quint)] hairline hover:-translate-y-1 hover:border-[var(--fest-ring)] focus-visible:-translate-y-1" style="--card-h: 104px">
    <div class="flex items-start gap-3.5">
      <span class="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl" style="background: linear-gradient(145deg, #fbfbfd, #e9e9f0)">
        <span class="absolute text-base font-bold text-[#64748b]" aria-hidden="true" data-fallback></span>
        <img class="relative size-full object-contain p-2 opacity-0 transition-opacity duration-300"
             loading="lazy" decoding="async" alt="" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1.5">
          <span class="truncate text-[0.95rem] font-semibold text-ink-0" data-name></span>
          <svg viewBox="0 0 24 24" class="size-3.5 shrink-0" fill="currentColor" style="color: var(--fest-text)" aria-hidden="true" data-check>
            <path d="m12 2 2.4 1.8 3-.2.9 2.9 2.4 1.7-1.1 2.8 1.1 2.8-2.4 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.4-1.7L4.4 13 3.3 10.2l2.4-1.7.9-2.9 3 .2z" opacity=".22"/>
            <path d="m8.5 12.2 2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <span class="clamp-2 pt-1 text-[0.8rem] leading-snug text-ink-2" data-meta></span>
      </span>
    </div>

    <div class="flex items-center gap-1.5 pt-4">
      <span class="inline-flex items-center gap-1.5 rounded-pill bg-live px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
        <span class="size-1.5 animate-pulse rounded-full bg-white" aria-hidden="true"></span>En vivo
      </span>
      <span class="truncate rounded-pill border px-2.5 py-1 text-[11px] font-semibold text-ink-1 hairline" data-tag></span>
      <span class="ml-auto hidden shrink-0 rounded-pill border px-2.5 py-1 text-[11px] font-semibold text-ink-2 hairline" data-q></span>
    </div>
  </a>
`);

export const channelPool = createPool({
  create() {
    const node = cloneCard();
    node.__refs = {
      img: node.querySelector('img'),
      fallback: node.querySelector('[data-fallback]'),
      name: node.querySelector('[data-name]'),
      meta: node.querySelector('[data-meta]'),
      tag: node.querySelector('[data-tag]'),
      q: node.querySelector('[data-q]'),
    };
    return node;
  },
  reset(node) {
    const { img, fallback, name, meta, tag, q } = node.__refs;
    resetImage(img);
    fallback.textContent = '';
    name.textContent = '';
    meta.textContent = '';
    tag.textContent = '';
    q.textContent = '';
    q.classList.add('hidden');
    node.removeAttribute('data-id');
    node.removeAttribute('href');
    node.removeAttribute('aria-label');
    resetLayout(node);
  },
  prime: 10,
  max: 60,
});

const PAIS = {
  mx: 'Mexico', es: 'Espana', co: 'Colombia', ar: 'Argentina', cl: 'Chile',
  pe: 'Peru', us: 'Estados Unidos', ca: 'Canada', it: 'Italia', de: 'Alemania',
  gr: 'Grecia', nl: 'Paises Bajos', pt: 'Portugal', ro: 'Rumania', at: 'Austria',
  bg: 'Bulgaria', gt: 'Guatemala', hn: 'Honduras', sm: 'San Marino', ae: 'Emiratos', sx: 'San Martin',
};

export function renderChannel(channel) {
  const node = channelPool.acquire();
  const { img, fallback, name, meta, tag, q } = node.__refs;

  node.dataset.id = channel.id;
  node.href = `/en-vivo?c=${encodeURIComponent(channel.id)}`;
  fallback.textContent = initials(channel.name);

  img.alt = '';
  img.dataset.src = channel.logo;
  name.textContent = channel.name;

  const pais = PAIS[channel.country] ?? channel.country?.toUpperCase();
  meta.textContent = [pais, channel.genres[0]?.label, channel.always ? 'Emite 24/7' : 'Por franjas']
    .filter(Boolean)
    .join(' · ');

  tag.textContent = channel.category;
  node.setAttribute('aria-label', `${channel.name}, en vivo, ${meta.textContent}`);

  if (channel.quality) {
    q.textContent = channel.quality;
    q.classList.remove('hidden');
  }

  hydrateImage(img);
  return node;
}

export const recycleChannel = (node) => channelPool.release(node);

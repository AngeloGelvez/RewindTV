/** Recomendaciones por hora local a partir de episodios con fuente registrada. */
import { el } from '../core/dom.js';
import { createView } from './_view.js';
import { bootstrap, getTitleById, loadEpisodeDirectory, networks } from '../data/repository.js';
import { atSize, imageUrl } from '../data/models/images.js';
import { clock } from '../utils/format.js';
import { sorteoDelDia } from '../utils/dia.js';

export default async function guideView({ outlet, query }) {
  await bootstrap();
  let day = query.dia === 'manana' ? 'manana' : 'hoy';
  let network = networks().some((n) => n.slug === query.cadena) ? query.cadena : '';
  let directory;
  let mounted = true;
  let timer;
  const list = el('ol', { class: 'max-w-4xl space-y-2' });
  const dateLabel = el('h2', { class: 'text-lg font-semibold capitalize', 'aria-live': 'polite' });
  const status = el('p', { class: 'text-sm text-ink-2', role: 'status' });
  const retry = el('button', { class: 'rounded-pill border px-4 py-2 hairline', onClick: cargar }, 'Reintentar');
  retry.hidden = true;

  function updateUrl() {
    const url = new URL(location.href);
    if (day === 'hoy') url.searchParams.delete('dia');
    else url.searchParams.set('dia', day);
    if (network) url.searchParams.set('cadena', network);
    else url.searchParams.delete('cadena');
    history.replaceState(history.state, '', url);
    pintar();
  }
  function grupo(label, options, selected, change) {
    const buttons = options.map(([value, text]) => el('button', {
      type: 'button', 'aria-pressed': String(selected === value),
      class: 'rounded-pill border px-4 py-2 text-sm hairline aria-pressed:bg-surface-3 aria-pressed:text-[var(--fest-text)]',
      onClick: (event) => {
        buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === event.currentTarget)));
        change(value);
        updateUrl();
      },
    }, text));
    return el('div', { class: 'flex flex-wrap gap-2', role: 'group', 'aria-label': label }, buttons);
  }

  function pintar() {
    clearTimeout(timer);
    const now = new Date();
    const date = new Date(now);
    if (day === 'manana') date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    dateLabel.textContent = date.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!directory) return;

    const candidatas = Object.keys(directory).map(getTitleById).filter(
      (t) => t && (!network || t.network?.slug === network));
    // Una sugerencia no debe llevar a un reproductor con ventanas de anuncios ni
    // a un capitulo caido de Cube: esos solo salen si la cadena no tiene otros.
    const limpias = candidatas.filter((t) => t.adFree);
    const titles = sorteoDelDia(limpias.length ? limpias : candidatas, date);
    const firstHour = day === 'hoy' ? now.getHours() : 0;
    const rows = [];
    const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    for (let hour = firstHour; titles.length && hour < 24; hour++) {
      const title = titles[hour % titles.length];
      const episodes = directory[title.id];
      const [season, number, name, st] = episodes[(dayNumber + hour) % episodes.length];
      const start = new Date(date);
      start.setHours(hour);
      if (start.getHours() !== hour) continue;
      const cover = atSize(title.backdrop ?? title.poster, 'card');
      const art = imageUrl(st, 'still') ?? cover;
      rows.push(el('li', {}, [el('a', {
        href: `/ver/${title.slug}/t${season}/c${number}`,
        class: 'flex items-center gap-3 rounded-card border bg-surface-1 p-3 hairline hover:border-[var(--fest-text)] sm:gap-5',
      }, [
        el('time', { class: 'shrink-0 font-mono text-sm text-[var(--fest-text)]', datetime: start.toISOString() }, clock(start)),
        art ? el('img', { src: art, alt: '', loading: 'lazy', class: 'aspect-video w-16 shrink-0 rounded-lg object-cover sm:w-28',
          onError: (e) => {
            if (cover && e.target.getAttribute('src') !== cover) e.target.src = cover;
            else e.target.hidden = true;
          },
        }) : null,
        el('span', { class: 'min-w-0 space-y-1' }, [
          el('span', { class: 'block text-xs text-ink-2' }, [title.network?.name, title.name].filter(Boolean).join(' · ')),
          el('span', { class: 'block text-sm font-semibold' }, name),
          el('span', { class: 'block text-xs text-ink-1' }, `Temporada ${season} · Episodio ${number}`),
        ]),
      ])]));
    }
    list.replaceChildren(...rows);
    status.textContent = rows.length ? '' : 'No hay episodios disponibles para esta cadena.';
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    timer = setTimeout(pintar, nextHour - now);
  }

  async function cargar() {
    retry.hidden = true;
    status.textContent = 'Cargando episodios…';
    try {
      directory = await loadEpisodeDirectory();
      if (mounted) pintar();
    } catch {
      if (!mounted) return;
      status.textContent = 'No se pudo cargar la guía.';
      retry.hidden = false;
    }
  }

  const node = el('div', { class: 'space-y-5 px-4 py-7 md:px-6 lg:px-8' }, [
    el('header', { class: 'space-y-2' }, [
      el('h1', { class: 'font-display text-3xl font-extrabold md:text-4xl' }, 'Guía de episodios'),
      el('p', { class: 'text-sm text-ink-1' }, 'Un episodio sugerido por hora, en tu horario local. Puedes abrir cualquiera cuando quieras.'),
      el('a', { href: '/en-vivo', class: 'inline-block text-sm text-[var(--fest-text)] underline' }, 'Ver canales en vivo'),
    ]),
    grupo('Día', [['hoy', 'Hoy'], ['manana', 'Mañana']], day, (v) => { day = v; }),
    grupo('Cadena', [['', 'Todas las cadenas'], ...networks().map((n) => [n.slug, n.network.name])], network, (v) => { network = v; }),
    dateLabel, status, retry, list,
  ]);
  const view = createView(node, outlet, () => { mounted = false; clearTimeout(timer); });
  pintar();
  cargar();
  return view;
}

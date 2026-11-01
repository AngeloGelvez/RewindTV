/**
 * Portada.
 *
 * Orden de montaje pensado para el primer pintado:
 *  1. Hero con la festividad del dia (ya resuelta: no espera a nada).
 *  2. Filas del catalogo, que vienen del arranque.
 *  3. Canales en vivo, que se piden aparte y se insertan en su hueco cuando
 *     llegan. La portada nunca espera a los canales para pintarse.
 *
 * La pagina se lee como una pila de PANELES, no como una lista continua de
 * filas: cada bloque tiene su borde y su fondo, y eso es lo que separa una
 * seccion de la siguiente sin necesidad de lineas ni de titulos enormes.
 */
import { el } from '../core/dom.js';
import { createView } from './_view.js';
import { idle } from '../core/scheduler.js';
import { navigate } from '../core/router.js';
import {
  bootstrap, activeFestivity, upcomingFestivity, festivityPicks, festivityCalendar,
  query, getTitleById, networks, loadChannels, getChannels,
} from '../data/repository.js';
import { Hero, applyFestivityTheme } from '../components/media/Hero.js';
import { Carousel } from '../components/media/Carousel.js';
import { renderCard, recycleCard } from '../components/media/TitleCard.js';
import { renderChannel, recycleChannel } from '../components/media/ChannelCard.js';
import { renderNetwork, recycleNetwork } from '../components/media/NetworkCard.js';
import { renderFestivity, recycleFestivity } from '../components/media/FestivityCard.js';
import { initials } from '../components/ui/LazyImage.js';
import { inkFor } from '../core/theme.js';

/* Medidas de tarjeta en funcion del ancho del carril. Un solo sitio donde
   decidir cuantas tarjetas se ven: en un movil de 360 px entra una y media
   —el recorte invita a deslizar— y en un escritorio ancho, seis. */
const ANCHO_TITULO = (w) => (w < 420 ? 216 : w < 700 ? 240 : w < 1100 ? 262 : 282);
const ALTO_TITULO = (w) => Math.round((w * 9) / 16) + 88;
const ANCHO_CANAL = (w) => (w < 420 ? 248 : 300);

export default async function homeView({ outlet }) {
  await bootstrap();

  const festividad = activeFestivity();
  applyFestivityTheme(festividad);

  const picks = festividad ? festivityPicks(festividad.slug) : [];
  const tematicos = [...new Map(picks.map((p) => [p.title.id, p.title])).values()];

  // El hero lleva primero lo de la festividad y detras lo mejor valorado. Hoy
  // Dia de Muertos tiene UN capitulo: sin completar, el carrusel seria una sola
  // diapositiva sin puntos ni rotacion, y la portada parece rota, no sobria.
  const destacados = [...new Map([...tematicos, ...query({ sort: 'score' })].map((t) => [t.id, t])).values()];

  const piezas = [];
  const hero = Hero({
    festivity: festividad,
    items: destacados,
    upcoming: upcomingFestivity(),
  });
  piezas.push(hero);

  const secciones = el('div', { class: 'space-y-6 px-4 pt-6 md:space-y-7 md:px-6 md:pt-8 lg:px-8' });

  const irATitulo = (id) => {
    const t = getTitleById(id);
    if (t) navigate(`/titulo/${t.slug}`);
  };

  /** Fila de titulos del catalogo. */
  const filaTitulos = (title, items, href, action) => {
    if (!items.length) return null;
    const c = Carousel({
      title, items, href, action,
      itemWidth: ANCHO_TITULO,
      itemHeight: ALTO_TITULO,
      render: renderCard,
      recycle: recycleCard,
      onSelect: irATitulo,
    });
    piezas.push(c);
    return c;
  };

  // --- canales en vivo: hueco reservado ------------------------------------
  // Se reserva AHORA el sitio donde iran, aunque todavia no esten. Si se
  // anadieran al final al llegar, la pagina daria un salto justo cuando la
  // persona ya esta leyendo.
  const huecoCanales = el('div');
  secciones.appendChild(huecoCanales);

  // --- pestanas por cadena --------------------------------------------------
  // Las cadenas son la taxonomia que de verdad separa este catalogo: el genero
  // es "animacion" en los 503 titulos, asi que filtrar por genero no filtra.
  const cadenas = networks();
  let filaCadena = null;

  if (cadenas.length > 1) {
    const botones = cadenas.map((entry, n) => {
      const color = entry.network.color;
      const boton = el(
        'button',
        {
          type: 'button',
          role: 'tab',
          class:
            'group flex shrink-0 flex-col items-center gap-2 border-b-2 border-transparent px-2.5 pb-3 pt-1 ' +
            'text-xs font-medium text-ink-2 transition-colors hover:text-ink-0',
          'aria-selected': String(n === 0),
          onClick: () => elegir(n),
        },
        [
          el(
            'span',
            {
              class: 'grid size-9 place-items-center rounded-chip text-[11px] font-extrabold transition',
              style: `background: ${color}; color: ${inkFor(color)}`,
              'aria-hidden': 'true',
            },
            initials(entry.network.name),
          ),
          el('span', { class: 'max-w-[7rem] truncate' }, entry.network.name),
        ],
      );
      return boton;
    });

    const elegir = (n) => {
      for (let i = 0; i < botones.length; i++) {
        const activo = i === n;
        botones[i].setAttribute('aria-selected', String(activo));
        botones[i].style.borderBottomColor = activo ? 'var(--fest)' : 'transparent';
        botones[i].classList.toggle('text-ink-0', activo);
      }
      const entry = cadenas[n];
      filaCadena?.update(entry.titles);
      const rotulo = filaCadena?.node.querySelector('h2');
      if (rotulo) rotulo.textContent = entry.network.name;
    };

    secciones.appendChild(
      el(
        'div',
        {
          class: 'rail border-b pb-0 hairline',
          role: 'tablist',
          'aria-label': 'Cadenas',
        },
        botones,
      ),
    );

    filaCadena = filaTitulos(cadenas[0].network.name, cadenas[0].titles, '/explorar');
    if (filaCadena) secciones.appendChild(filaCadena.node);
    elegir(0);
  }

  // --- fila tematica de la festividad --------------------------------------
  // Con uno o dos capitulos no se monta: el hero ya los esta ensenando, y una
  // fila entera para una sola tarjeta se lee como un hueco, no como una
  // seleccion. Hoy pasa de verdad — Dia de Muertos tiene un capitulo.
  if (tematicos.length > 2) {
    const fila = filaTitulos(
      `${festividad.emoji} ${festividad.label}`,
      tematicos,
      '/explorar',
      el(
        'span',
        {
          class: 'hidden rounded-pill px-2.5 py-1 text-[11px] font-bold sm:inline-block',
          style: 'background: var(--fest-soft); color: var(--fest-text)',
        },
        `${picks.length} capitulos`,
      ),
    );
    if (fila) secciones.appendChild(fila.node);
  }

  const recientes = filaTitulos('Anadido recientemente', query({ sort: 'year-desc' }), '/explorar');
  if (recientes) secciones.appendChild(recientes.node);

  // --- descubre por cadena --------------------------------------------------
  if (cadenas.length) {
    const c = Carousel({
      title: 'Descubre por cadena',
      items: cadenas,
      href: '/explorar',
      itemWidth: 172,
      itemHeight: 208,
      render: renderNetwork,
      recycle: recycleNetwork,
      onSelect: (slug) => navigate(`/explorar?cadena=${encodeURIComponent(slug)}`),
    });
    piezas.push(c);
    secciones.appendChild(c.node);
  }

  // --- calendario de festividades -------------------------------------------
  const calendario = festivityCalendar();
  if (calendario.length) {
    const c = Carousel({
      title: 'Proximas temporadas tematicas',
      items: calendario,
      itemWidth: 204,
      itemHeight: 172,
      render: renderFestivity,
      recycle: recycleFestivity,
      onSelect: () => navigate('/explorar'),
    });
    piezas.push(c);
    secciones.appendChild(c.node);
  }

  const mejor = filaTitulos('Recomendado para ti', query({ sort: 'score' }), '/explorar');
  if (mejor) secciones.appendChild(mejor.node);

  const node = el('div', {}, [hero.node, secciones]);
  const view = createView(node, outlet, () => {
    for (const p of piezas) p.destroy?.();
  });

  // Los canales llegan despues; la portada ya esta en pantalla.
  idle(async () => {
    try {
      await loadChannels();
      const canales = getChannels();
      if (!canales.length) return;
      const c = Carousel({
        title: 'Canales en vivo',
        items: canales,
        href: '/en-vivo',
        itemWidth: ANCHO_CANAL,
        itemHeight: 138,
        render: renderChannel,
        recycle: recycleChannel,
        onSelect: (id) => navigate(`/en-vivo?c=${id}`),
        action: el(
          'span',
          {
            class: 'hidden rounded-pill px-2.5 py-1 text-[11px] font-bold text-ink-1 sm:inline-block',
            style: 'background: var(--fest-soft); color: var(--fest-text)',
          },
          `${canales.length} canales`,
        ),
      });
      piezas.push(c);
      huecoCanales.replaceChildren(c.node);
    } catch (err) {
      console.error('[home] canales', err);
    }
  });

  return view;
}

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
  bootstrap, festivityOnStage, upcomingFestivity, festivityPicks, festivityCalendar,
  query, getTitleById, networks, loadChannelIndex, getFeaturedChannels, getChannel, AVISO_DIAS,
} from '../data/repository.js';
import { Hero, applyFestivityTheme } from '../components/media/Hero.js';
import { Carousel } from '../components/media/Carousel.js';
import { renderCard, recycleCard } from '../components/media/TitleCard.js';
import { renderEpisode, recycleEpisode } from '../components/media/EpisodeCard.js';
import { atSize } from '../data/models/images.js';
import { renderChannel, recycleChannel } from '../components/media/ChannelCard.js';
import { renderNetwork, recycleNetwork, placa } from '../components/media/NetworkCard.js';
import { renderFestivity, recycleFestivity } from '../components/media/FestivityCard.js';

/* Medidas de tarjeta en funcion del ancho del carril. Un solo sitio donde
   decidir cuantas tarjetas se ven: en un movil de 360 px entra una y media
   —el recorte invita a deslizar— y en un escritorio ancho, seis. */
const ANCHO_TITULO = (w) => (w < 420 ? 216 : w < 700 ? 240 : w < 1100 ? 262 : 282);
const ALTO_TITULO = (w) => Math.round((w * 9) / 16) + 88;
const ANCHO_CANAL = (w) => (w < 420 ? 268 : 340);

/**
 * Baraja una copia (Fisher-Yates). Es lo que hace que la portada no reciba
 * siempre al mismo titulo: la seleccion del hero se sortea en cada visita.
 */
function barajar(lista) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export default async function homeView({ outlet }) {
  await bootstrap();

  // La festividad "en cartel": la de hoy, o la que llega en menos de una
  // semana. El tema de color arranca con el aviso, no el dia en punto.
  const cartel = festivityOnStage();
  const festividad = cartel?.festivity ?? null;
  applyFestivityTheme(festividad);

  const picks = festividad ? festivityPicks(festividad.slug) : [];
  const tematicos = [...new Map(picks.map((p) => [p.title.id, p.title])).values()];

  /*
   * Seleccion del hero: un titulo de la festividad mas un sorteo entre los
   * mejor valorados, en orden aleatorio. Dos motivos para no poner el top 5:
   *
   *  - con 503 titulos, un hero fijo ensena siempre los mismos cinco y el
   *    resto del catalogo no existe para quien entra por la portada;
   *  - la gracia de un catalogo retro es tropezarse con algo olvidado.
   *
   * El sorteo es entre los 60 mejor valorados, no entre los 503: variedad, sin
   * que la portada abra con el ultimo de la lista.
   */
  const candidatos = query({ sort: 'score' }).slice(0, 60);
  const sorteados = barajar(candidatos)
    .filter((t) => !tematicos.includes(t))
    .slice(0, 4);
  // Un titulo tematico entra siempre (si lo hay) pero NO siempre el primero:
  // con una sola recomendacion de la festividad —hoy Dia de Muertos tiene un
  // capitulo— el hero abriria con el mismo titulo todas las visitas.
  const tematico = tematicos.length ? barajar(tematicos)[0] : null;
  const destacados = barajar(tematico ? [tematico, ...sorteados] : barajar(candidatos).slice(0, 5));

  const piezas = [];
  const hero = Hero({
    stage: cartel,
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

  // --- especiales de la festividad -----------------------------------------
  /*
   * LA fila de la temporada tematica: los CAPITULOS de la festividad, no las
   * series que los contienen.
   *
   * Es la razon de ser de la portada en diciembre. Antes solo salia una fila de
   * titulos —te dejaba en la puerta de "Los Simpsons", con 638 capitulos, para
   * que buscaras tu el de Navidad— y una franja de tarjetas de festividad, que
   * es un calendario, no contenido. Esto lleva directo al capitulo.
   *
   * Solo existe cuando hay festividad en cartel (activa o a menos de una
   * semana) y con capitulos etiquetados: fuera de temporada no aparece.
   */
  if (picks.length) {
    const titulo = cartel.active
      ? `${festividad.emoji} Especiales de ${festividad.label}`
      : `${festividad.emoji} Preparando ${festividad.label}`;

    const aviso =
      cartel.days === 0
        ? 'hoy'
        : cartel.days === 1
          ? 'manana'
          : cartel.days > 0 && cartel.days <= AVISO_DIAS
            ? `en ${cartel.days} dias`
            : null;

    const c = Carousel({
      title: titulo,
      items: picks,
      itemWidth: (w) => (w < 420 ? 208 : 232),
      itemHeight: (ancho) => Math.round((ancho * 9) / 16) + 104,
      render: (pick) =>
        renderEpisode(
          {
            id: `${pick.title.id}-${pick.season}-${pick.number}`,
            season: pick.season,
            number: pick.number,
            name: pick.name,
            runtime: pick.title.runtime,
          },
          {
            // Sin fotograma propio, el fondo de la serie; ver detail.js.
            still: atSize(pick.title.backdrop, 'still'),
            href: `/ver/${pick.title.slug}/t${pick.season}/c${pick.number}`,
            serie: pick.title.name,
          },
        ),
      recycle: recycleEpisode,
      action: el(
        'span',
        {
          class: 'hidden rounded-pill px-2.5 py-1 text-[11px] font-bold sm:inline-block',
          style: 'background: var(--fest-soft); color: var(--fest-text)',
        },
        aviso ? `${picks.length} capitulos · ${aviso}` : `${picks.length} capitulos`,
      ),
      onSelect: (id) => {
        // El id del capitulo es "<titulo>-<temporada>-<numero>".
        const [titleId, temporada, numero] = id.split('-');
        const t = getTitleById(titleId);
        if (t) navigate(`/ver/${t.slug}/t${temporada}/c${numero}`);
      },
    });
    piezas.push(c);
    secciones.appendChild(c.node);
  }

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
          // Misma placa clara que la tarjeta de cadena: el logo manda y las
          // iniciales quedan debajo por si no carga.
          placa(entry.network, color, { caja: 'size-10 p-1.5', logo: 'max-h-6', texto: 'text-[11px]' }),
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

  // La fila de TITULOS de la festividad desaparecio: la de capitulos de arriba
  // dice lo mismo y lleva al sitio, en vez de dejarte en la puerta de una serie
  // de 638 capitulos para que busques tu el de Navidad.

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
  // Los canales llegan despues; la portada ya esta en pantalla. Solo se piden
  // el indice y los destacados: los ~8.000 canales no se bajan para pintar una
  // fila de 24.
  idle(async () => {
    try {
      const catalogo = await loadChannelIndex();
      const canales = getFeaturedChannels();
      if (!canales.length) return;
      const c = Carousel({
        title: 'Canales en vivo',
        items: canales,
        href: '/en-vivo',
        itemWidth: ANCHO_CANAL,
        itemHeight: 156,
        render: renderChannel,
        recycle: recycleChannel,
        action: el(
          'span',
          {
            class: 'hidden rounded-pill px-2.5 py-1 text-[11px] font-bold text-ink-1 sm:inline-block',
            style: 'background: var(--fest-soft); color: var(--fest-text)',
          },
          `${catalogo.total.toLocaleString('es')} canales`,
        ),
        onSelect: (id) => {
          const canal = getChannel(id);
          navigate(`/en-vivo?c=${encodeURIComponent(id)}${canal ? `&k=${encodeURIComponent(canal.category)}` : ''}`);
        },
      });
      piezas.push(c);
      huecoCanales.replaceChildren(c.node);
    } catch (err) {
      console.error('[home] canales', err);
    }
  });

  return view;
}

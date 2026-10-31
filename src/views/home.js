/**
 * Portada.
 *
 * Orden de montaje pensado para el primer pintado:
 *  1. Hero con la festividad del dia (ya resuelta: no espera a nada).
 *  2. Filas del catalogo, que vienen del arranque.
 *  3. Canales en vivo, que se piden aparte y se insertan cuando llegan.
 *
 * La portada nunca espera a los canales para pintarse.
 */
import { el } from '../core/dom.js';
import { createView } from './_view.js';
import { idle } from '../core/scheduler.js';
import { navigate } from '../core/router.js';
import {
  bootstrap, activeFestivity, upcomingFestivity, festivityPicks,
  query, getTitleById, loadChannels, getChannelsByCategory, channelCategories,
} from '../data/repository.js';
import { Hero, applyFestivityTheme } from '../components/media/Hero.js';
import { Carousel } from '../components/media/Carousel.js';
import { renderCard, recycleCard } from '../components/media/TitleCard.js';
import { renderChannel, recycleChannel } from '../components/media/ChannelCard.js';

const CATEGORIA_LABEL = {
  musica: 'Musica en vivo',
  general: 'Canales generalistas',
  entretenimiento: 'Entretenimiento 24/7',
  deportes: 'Deportes',
};

export default async function homeView({ outlet }) {
  await bootstrap();

  const festividad = activeFestivity();
  applyFestivityTheme(festividad);

  const picks = festividad ? festivityPicks(festividad.slug) : [];
  const destacado = picks[0] ? getTitleById(picks[0].t ?? picks[0].title?.id) ?? picks[0].title : query({ sort: 'score' })[0];

  const piezas = [];
  const hero = Hero({
    festivity: festividad,
    title: destacado,
    upcoming: upcomingFestivity(),
  });
  piezas.push(hero);

  const filas = el('div', { class: 'space-y-10 pt-4' });

  /** Fila de titulos del catalogo. */
  const filaTitulos = (title, items, href) => {
    if (!items.length) return null;
    const c = Carousel({
      title, items, href,
      itemWidth: 170,
      itemHeight: 255,
      render: renderCard,
      recycle: recycleCard,
      onSelect: (id) => {
        const t = getTitleById(id);
        if (t) navigate(`/titulo/${t.slug}`);
      },
    });
    piezas.push(c);
    return c.node;
  };

  // La fila tematica va primero: es la razon de ser de la portada hoy.
  if (picks.length) {
    const titulos = [...new Map(picks.map((p) => [p.title.id, p.title])).values()];
    const fila = filaTitulos(`${festividad.emoji} ${festividad.label}`, titulos, '/explorar');
    if (fila) filas.appendChild(fila);
  }

  const recientes = filaTitulos('Anadido recientemente', query({ sort: 'year-desc' }), '/explorar');
  if (recientes) filas.appendChild(recientes);

  const mejor = filaTitulos('Mejor valorado', query({ sort: 'score' }), '/explorar');
  if (mejor) filas.appendChild(mejor);

  const node = el('div', {}, [hero.node, filas]);
  const view = createView(node, outlet, () => {
    for (const p of piezas) p.destroy?.();
  });

  // Los canales llegan despues; la portada ya esta en pantalla.
  idle(async () => {
    try {
      await loadChannels();
      for (const categoria of channelCategories()) {
        const canales = getChannelsByCategory(categoria);
        if (!canales.length) continue;
        const c = Carousel({
          title: CATEGORIA_LABEL[categoria] ?? categoria,
          items: canales,
          href: '/en-vivo',
          itemWidth: 230,
          itemHeight: 186,
          render: renderChannel,
          recycle: recycleChannel,
          onSelect: (id) => navigate(`/en-vivo?c=${id}`),
        });
        piezas.push(c);
        filas.appendChild(c.node);
      }
    } catch (err) {
      console.error('[home] canales', err);
    }
  });

  return view;
}

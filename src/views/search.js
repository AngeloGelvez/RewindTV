/**
 * Busqueda sobre los indices del repositorio.
 *
 * Dos secciones, porque el buscador promete dos cosas —"series, pelis o
 * canales"— y antes solo cumplia una: escribir "ESPN" con 1.864 canales dentro
 * no devolvia nada.
 *
 * Los canales se piden en idle: su lista son ~500 KB y quien busca "simpsons"
 * no deberia esperarla. Cuando llegan, si hay una busqueda escrita se repite
 * sola para que su seccion aparezca sin volver a teclear.
 */
import { el, delegate, clear } from '../core/dom.js';
import { createView } from './_view.js';
import { write } from '../core/scheduler.js';
import { withBase } from '../core/base.js';
import { navigate } from '../core/router.js';
import { debounce } from '../utils/timing.js';
import { bootstrap, search, searchChannels, getTitleById, loadAllChannels } from '../data/repository.js';
import { renderCard, recycleCard } from '../components/media/TitleCard.js';
import { renderChannel, recycleChannel } from '../components/media/ChannelCard.js';

export default async function searchView({ outlet, query: qs }) {
  await bootstrap();

  let montadas = [];
  let montadasCanal = [];
  let ultimo = qs.q ?? '';

  const grid = el('div', { class: 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4' });
  const gridCanales = el('div', { class: 'grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4' });
  const estado = el('p', { class: 'text-sm text-ink-2' }, 'Escribe al menos dos letras.');

  const rotulo = (texto) =>
    el('h2', { class: 'hidden pb-3 text-[1.0625rem] font-bold tracking-tight' }, texto);
  const tituloTitulos = rotulo('Series y peliculas');
  const tituloCanales = rotulo('Canales en vivo');

  const input = el('input', {
    type: 'search',
    value: qs.q ?? '',
    placeholder: 'Serie, pelicula, cadena o canal...',
    class:
      'w-full max-w-xl rounded-pill border bg-surface-1 px-5 py-3 text-ink-0 placeholder:text-ink-2 hairline focus:border-[var(--fest-text)] focus:outline-none',
    'aria-label': 'Buscar en el catalogo y en los canales',
  });

  /*
   * Los canales se piden la PRIMERA vez que se escribe algo, no al entrar: son
   * ~1,7 MB en trozos y quien llega aqui a mirar no tiene por que bajarlos.
   * Hasta que llegan, la busqueda devuelve solo titulos; al llegar se repite
   * sola. Y no se consulta el indice de canales antes: `searchChannels` se
   * memoiza por termino, y un resultado calculado con la lista a medias se
   * quedaria cacheado incompleto.
   */
  let canalesListos = false;
  let canalesPidiendose = false;

  function pedirCanales() {
    if (canalesListos || canalesPidiendose) return;
    canalesPidiendose = true;
    loadAllChannels()
      .then(() => {
        canalesListos = true;
        if (ultimo.trim().length >= 2) pintar(ultimo);
      })
      .catch((err) => console.error('[buscar] canales', err))
      .finally(() => {
        canalesPidiendose = false;
      });
  }

  function pintar(term) {
    ultimo = term ?? '';
    if (ultimo.trim().length >= 2) pedirCanales();
    const titulos = search(ultimo);
    const canales = canalesListos ? searchChannels(ultimo) : [];

    write(() => {
      for (const n of montadas) recycleCard(n);
      for (const n of montadasCanal) recycleChannel(n);
      montadas = [];
      montadasCanal = [];
      clear(grid);
      clear(gridCanales);
      tituloTitulos.classList.add('hidden');
      tituloCanales.classList.add('hidden');

      if (!ultimo || ultimo.trim().length < 2) {
        estado.textContent = 'Escribe al menos dos letras.';
        return;
      }

      const total = titulos.length + canales.length;
      estado.textContent = total
        ? `${total} resultado(s) para "${ultimo}"`
        : `Sin resultados para "${ultimo}"`;

      // Los rotulos solo salen cuando hay de las dos cosas: con un unico
      // bloque, "Series y peliculas" encima sobra.
      const ambos = titulos.length > 0 && canales.length > 0;

      if (titulos.length) {
        if (ambos) tituloTitulos.classList.remove('hidden');
        const frag = document.createDocumentFragment();
        for (const t of titulos) {
          const n = renderCard(t);
          montadas.push(n);
          frag.appendChild(n);
        }
        grid.appendChild(frag);
      }

      if (canales.length) {
        if (ambos) tituloCanales.classList.remove('hidden');
        const frag = document.createDocumentFragment();
        for (const c of canales) {
          const n = renderChannel(c);
          montadasCanal.push(n);
          frag.appendChild(n);
        }
        gridCanales.appendChild(frag);
      }
    });
  }

  const alEscribir = debounce((event) => {
    const term = event.target.value;
    history.replaceState(null, '', withBase(term ? `/buscar?q=${encodeURIComponent(term)}` : '/buscar'));
    pintar(term);
  }, 180);
  input.addEventListener('input', alEscribir);

  const node = el('div', { class: 'px-4 py-7 md:px-6 md:py-9 lg:px-8' }, [
    el('header', { class: 'mb-6 space-y-4' }, [
      el('h1', { class: 'font-display text-3xl font-extrabold tracking-tight md:text-4xl' }, 'Buscar'),
      input,
      estado,
    ]),
    el('section', {}, [tituloTitulos, grid]),
    el('section', { class: 'pt-8' }, [tituloCanales, gridCanales]),
  ]);

  const quitar = delegate(grid, '[data-id]', 'click', (event, target) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const t = getTitleById(target.dataset.id);
    if (t) navigate(`/titulo/${t.slug}`);
  });

  const quitarCanales = delegate(gridCanales, '[data-id]', 'click', (event, target) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    navigate(`/en-vivo?c=${encodeURIComponent(target.dataset.id)}`);
  });

  if (qs.q) pintar(qs.q);
  write(() => input.focus());

  return createView(node, outlet, () => {
    alEscribir.cancel();
    input.removeEventListener('input', alEscribir);
    quitar();
    quitarCanales();
    for (const n of montadas) recycleCard(n);
    for (const n of montadasCanal) recycleChannel(n);
    montadas = [];
    montadasCanal = [];
  });
}

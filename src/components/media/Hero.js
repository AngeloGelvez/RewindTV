/**
 * Hero de portada: un escaparate a pantalla completa con varios titulos y
 * puntos para pasar de uno a otro.
 *
 * Tres decisiones:
 *
 * 1. UN SOLO NODO para todas las diapositivas. Cambiar de titulo reescribe
 *    textos y la capa de arte, no reconstruye la seccion: ni parpadeo, ni
 *    salto de layout, ni perder el foco del teclado a mitad de rotacion.
 *
 * 2. EL FONDO NO DEPENDE DE QUE HAYA IMAGEN. El catalogo no trae arte todavia,
 *    asi que el lienzo se dibuja con los dos colores de la festividad y, si el
 *    titulo tiene backdrop, se monta encima. Un hero que se apoya solo en una
 *    foto deja un bloque negro cuando falta.
 *
 * 3. EL TEXTO SE APOYA EN UN VELO (.scrim-side), no en la suerte de la imagen.
 *    Con foto clara o con foto oscura, el titulo se lee igual.
 *
 * La rotacion automatica se detiene al pasar el raton, al entrar el foco y
 * con `prefers-reduced-motion`: un carrusel que se mueve mientras intentas
 * leerlo o pulsarlo es una trampa, no una gracia.
 */
import { el } from '../../core/dom.js';
import { defineComponent } from '../base/Component.js';
import { icon } from '../ui/icons.js';
import { hydrateImage, initials } from '../ui/LazyImage.js';
import { applyTheme, inkFor, shade } from '../../core/theme.js';

/** Alias historico: el tema completo vive en core/theme.js. */
export const applyFestivityTheme = applyTheme;

/**
 * Dos minutos entre diapositivas. Siete segundos era un escaparate de tienda:
 * para cuando decides mirar una portada, ya se fue. A dos minutos el hero
 * cambia si te quedas leyendo la portada, y no te quita de delante lo que
 * estabas mirando.
 */
const INTERVALO = 120_000;
const MAX = 5;

/** Dias de antelacion con los que empieza la cuenta atras (ver repository). */
const AVISO = 7;

export const Hero = defineComponent({
  setup({ stage, items = [], upcoming }, { onDispose }) {
    // `stage` es la festividad en cartel: la que corre hoy o la que llega en
    // menos de una semana, con los dias que faltan.
    const festivity = stage?.festivity ?? null;
    const slides = items.filter(Boolean).slice(0, MAX);
    let i = 0;

    // --- lienzo -------------------------------------------------------------
    const arte = el('div', { class: 'absolute inset-0 -z-10' });
    const foto = el('img', {
      class: 'absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-700',
      alt: '',
      'aria-hidden': 'true',
      decoding: 'async',
    });

    const lienzo = el('div', { class: 'absolute inset-0 -z-10 overflow-hidden' }, [
      arte,
      foto,
      // Dos velos, no uno: el lateral sostiene el titulo y el inferior sostiene
      // la firma y los botones. Con portadas reales hay de todo —fondos claros,
      // amarillos, con el personaje justo detras del texto— y uno solo no
      // aguanta los dos casos.
      el('div', { class: 'absolute inset-0 scrim-side' }),
      el('div', { class: 'absolute inset-x-0 bottom-0 h-3/5 scrim opacity-85' }),
      // Remate inferior: funde el hero con la pagina sin una linea dura.
      el('div', {
        class: 'absolute inset-x-0 bottom-0 h-28',
        style: 'background: linear-gradient(to top, var(--color-surface-0), transparent)',
      }),
    ]);

    // --- piezas de texto ----------------------------------------------------
    const insignia = el('span', {
      class: 'inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]',
    });

    const dato = el('span', {
      class: 'inline-flex items-center gap-1.5 rounded-pill chip-glass px-3 py-1.5 text-[11px] font-semibold',
    });

    const titulo = el('h1', {
      class:
        'max-w-[15ch] text-balance font-display text-[2.1rem] font-extrabold leading-[1.03] text-white ' +
        'sm:text-5xl md:text-6xl lg:text-[4.25rem]',
    });

    const bajada = el('p', {
      class: 'hidden max-w-[46ch] text-sm leading-relaxed text-white/80 sm:block md:text-base',
    });

    const avatar = el('span', {
      class: 'grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold',
    });
    const autor = el('span', { class: 'text-sm font-medium text-white/90' });
    const firma = el('div', { class: 'flex items-center gap-2.5' }, [avatar, autor]);

    const ver = el(
      'a',
      {
        // Primer destino del foco con mando: lo natural es darle a OK y ver.
        'data-autofocus': '',
        class:
          'inline-flex items-center gap-2 rounded-pill bg-white px-6 py-3.5 text-sm font-semibold text-[#111115] ' +
          'transition hover:bg-white/90 active:scale-[0.98]',
      },
      [icon('play', 'size-4'), el('span', {}, 'Ver ahora'), icon('chevron', 'size-4 opacity-60')],
    );

    const ficha = el(
      'a',
      {
        class:
          'inline-flex items-center gap-2 rounded-pill border border-white/25 bg-white/10 px-6 py-3.5 text-sm ' +
          'font-medium text-white backdrop-blur-[6px] transition hover:border-white/50',
      },
      [icon('info', 'size-4'), 'Mas informacion'],
    );

    // --- puntos -------------------------------------------------------------
    const puntos = slides.map((t, n) =>
      el('button', {
        type: 'button',
        class: 'h-1.5 rounded-pill transition-all duration-300',
        'aria-label': `Ver ${t.name}`,
        'data-nav-skip': '',
        onClick: () => {
          mostrar(n);
          parar();
        },
      }),
    );

    const navegador =
      puntos.length > 1
        ? el(
            'div',
            { class: 'absolute inset-x-0 bottom-5 flex justify-center gap-2', role: 'tablist', 'aria-label': 'Destacados' },
            puntos,
          )
        : null;

    // --- pintado ------------------------------------------------------------
    function mostrar(n) {
      i = (n + slides.length) % slides.length;
      const t = slides[i];
      if (!t) return;

      const color = t.network?.color ?? 'var(--fest)';

      titulo.textContent = t.name;
      bajada.textContent =
        t.synopsis?.trim() ||
        festivity?.tagline ||
        `${t.year} · ${t.kind === 'serie' ? `${t.seasonCount ?? 1} temporada(s), ${t.episodeCount ?? 0} capitulos` : 'Pelicula'}`;

      avatar.textContent = initials(t.network?.name ?? t.name);
      avatar.style.background = color;
      avatar.style.color = inkFor(t.network?.color ?? '#6e6e80');
      autor.textContent = t.network?.name ?? 'RewindTv';

      ver.href = `/ver/${t.slug}/t1/c1`;
      ficha.href = `/titulo/${t.slug}`;

      dato.replaceChildren(
        icon('eye', 'size-3.5'),
        document.createTextNode(
          t.kind === 'serie' ? `${t.episodeCount ?? 0} capitulos` : `${t.year}`,
        ),
      );

      // El arte: degradado propio por titulo (sale del color de su cadena) con
      // el de la festividad por encima, para que la portada sea una sola cosa.
      //
      // Los dos colores van OSCURECIDOS y el lienzo se mantiene oscuro tambien
      // en modo claro: encima va texto blanco, y un hero que cambia de luz con
      // el modo obligaria a cambiar tambien el color del texto y del velo. Aqui
      // la foto manda, como en cualquier portada de television.
      const base = festivity?.color ?? t.network?.color ?? '#4b4b63';
      arte.style.background =
        `radial-gradient(95% 125% at 10% 6%, ${shade(color, 0.42)}, transparent 62%),` +
        `radial-gradient(75% 95% at 92% 0%, ${shade(base, 0.52)}, transparent 64%),` +
        'linear-gradient(118deg, #16161d, #0a0a0c)';

      const backdrop = t.backdrop ?? null;
      if (backdrop) {
        foto.dataset.src = backdrop;
        hydrateImage(foto);
      } else {
        foto.removeAttribute('src');
        foto.style.opacity = '0';
      }

      for (let p = 0; p < puntos.length; p++) {
        const activo = p === i;
        puntos[p].classList.toggle('w-7', activo);
        puntos[p].classList.toggle('w-1.5', !activo);
        puntos[p].style.background = activo ? '#fff' : 'rgb(255 255 255 / .4)';
        puntos[p].setAttribute('aria-selected', String(activo));
      }
    }

    // --- rotacion -----------------------------------------------------------
    let timer = null;
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function arrancar() {
      if (timer || quieto || slides.length < 2) return;
      timer = setInterval(() => mostrar(i + 1), INTERVALO);
    }
    function parar() {
      clearInterval(timer);
      timer = null;
    }

    /**
     * El rotulo cuenta la festividad en cuatro actos segun lo cerca que este
     * su dia: el nombre a secas mientras dura la temporada, la cuenta atras la
     * ultima semana, "mañana es" la vispera y el saludo el dia en cuestion.
     * Es la misma festividad y el mismo color; solo cambia el texto.
     */
    if (festivity) {
      const dias = stage?.days ?? null;
      insignia.textContent = stage?.active
        ? `${festivity.emoji} ${festivity.greeting}`
        : dias === 1
          ? `${festivity.emoji} Mañana es ${festivity.label}`
          : dias !== null && dias <= AVISO
            ? `${festivity.emoji} Faltan ${dias} dias para ${festivity.label}`
            : `${festivity.emoji} ${festivity.label}`;
      insignia.style.background = 'var(--fest)';
      insignia.style.color = 'var(--fest-ink)';
    } else {
      insignia.textContent = 'Destacado';
      insignia.style.background = 'rgb(255 255 255 / .16)';
      insignia.style.color = '#fff';
    }

    const node = el(
      'section',
      {
        class:
          'relative isolate flex min-h-[26rem] flex-col justify-end overflow-hidden px-4 pb-12 pt-24 ' +
          'sm:min-h-[30rem] md:min-h-[34rem] md:px-10 md:pb-16 lg:min-h-[36rem] lg:px-14',
        'aria-roledescription': 'carrusel',
        'aria-label': 'Destacados',
        onMouseenter: parar,
        onMouseleave: arrancar,
        onFocusin: parar,
      },
      [
        lienzo,
        el('div', { class: 'space-y-5' }, [
          el('div', { class: 'flex flex-wrap items-center gap-2' }, [insignia, dato]),
          titulo,
          firma,
          bajada,
          el('div', { class: 'flex flex-wrap items-center gap-3 pt-1' }, [ver, ficha]),
          !festivity && upcoming
            ? el(
                'p',
                { class: 'pt-1 text-xs text-white/60' },
                `Proxima temporada tematica: ${upcoming.festivity.emoji} ${upcoming.festivity.label}, en ${upcoming.days} dias`,
              )
            : null,
        ]),
        navegador,
      ],
    );

    if (slides.length) mostrar(0);
    arrancar();
    onDispose(parar);

    return { node };
  },
});

export default Hero;

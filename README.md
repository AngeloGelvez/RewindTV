# RewindTv

SPA en JavaScript vanilla (sin framework) + Tailwind, con Vite como bundler.
Catalogo de titulos retro, reproductor y guia de programacion (EPG) en vivo.

## Arranque

```bash
npm install
npm run dev
```

## Por que sin framework

El objetivo declarado es que la app vaya rapida en cualquier equipo. Un
framework nos daria comodidad, pero tambien 40-130 KB de runtime y un
reconciliador generico. Aqui el cuello de botella real es **renderizar miles de
tarjetas**, y eso se resuelve mejor con tres tecnicas concretas: reciclar nodos,
compartir datos repetidos y escribir en el DOM una sola vez por frame.

## Patrones y donde viven

| Patron | Archivo | Que resuelve |
| --- | --- | --- |
| **Flyweight** | `src/patterns/flyweight.js` | Generos, decadas y cadenas se crean UNA vez y se comparten por referencia entre todos los titulos. 10.000 titulos x 3 generos = 30.000 objetos; con flyweight, ~40. |
| **Object Pool** | `src/patterns/objectPool.js` | Los nodos DOM de las tarjetas no se destruyen al salir del viewport: se reciclan. Es lo que permite recorrer 5.000 titulos con ~40 nodos vivos. |
| **Observer** | `src/core/eventBus.js`, `src/patterns/observer.js` | Un solo `IntersectionObserver` / `ResizeObserver` por configuracion para toda la app, no uno por elemento. |
| **Memoize (LRU)** | `src/patterns/memoize.js` | Filtros, orden y busquedas no se recalculan al volver a una vista. |
| **Registry + lazy factory** | `src/patterns/registry.js` | Componentes pesados (Player, EPG) se importan solo cuando se usan. |
| **Repository + Adapter** | `src/data/` | Las vistas no saben de donde vienen los datos. Hoy JSON mock; manana API, cambiando un solo import. |
| **Virtualizacion (windowing)** | `src/components/media/VirtualGrid.js` | Solo las filas visibles existen en el DOM. |
| **Batched read/write** | `src/core/scheduler.js` | Separa medidas de escrituras para evitar layout thrashing; todo se agrupa en un frame. |

Sobre recursividad: deliberadamente **no** hay recursion en el camino caliente
(scroll, render de listas). La recursion profunda en JS consume stack y no se
puede interrumpir a mitad de camino. Para listas grandes se usan bucles e
iteracion por trozos (`scheduler.chunked`), que si pueden ceder el hilo. La
recursion queda reservada para estructuras de arbol acotadas: menus anidados y
el arbol de temporadas/episodios.

## Estructura

```
index.html                  shell estatico, se pinta antes del JS
vite.config.js              alias, code-splitting manual, Tailwind
public/
  data/                     datasets mock (titles, channels, schedule)
  placeholder.svg
src/
  main.js                   bootstrap: shell -> router -> prefetch en idle
  styles/
    tokens.css              design tokens (@theme de Tailwind v4)
    main.css                capa base: contain, content-visibility, motion
  core/                     runtime de la app (chunk "runtime")
    scheduler.js            read/write/idle/chunked
    eventBus.js             Observer global + catalogo de eventos
    store.js                estado por slices, notificacion agrupada
    router.js               History API, un chunk por vista, prefetch en hover
    dom.js                  el(), template(), delegate()
  patterns/                 patrones de rendimiento reutilizables
    flyweight.js objectPool.js memoize.js registry.js observer.js
  data/
    repository.js           indices (byId, bySlug, byGenre, byDecade) + queries
    cache.js                L1 memoria + L2 IndexedDB
    adapters/mockAdapter.js fuente de datos intercambiable
    models/                 title, channel, program, taxonomy (flyweights)
  components/
    base/Component.js       contrato { node, update, destroy }
    ui/                     LazyImage y primitivas
    media/                  TitleCard (pooled), VirtualGrid, Carousel, Player, Epg
    layout/                 AppShell (persistente), Navbar
  views/                    una vista por ruta, cargadas con import() dinamico
  utils/                    format, timing (debounce, rafThrottle)
```

## Rutas

| Ruta | Vista | Chunk |
| --- | --- | --- |
| `/` | home | home |
| `/explorar` | explore | explore |
| `/buscar` | search | search |
| `/titulo/:id` | detail | detail |
| `/ver/:id` | watch | watch + player |
| `/en-vivo` | live | live + player |
| `/guia` | guide | guide |

## Reglas del proyecto

1. **Nada escribe en el DOM fuera de `scheduler.write()`.** Ni un `style.x =`
   suelto en un handler de scroll.
2. **Todo componente devuelve `destroy()`** y libera listeners, observers y
   nodos. Sin esto el scroll filtra memoria.
3. **Lo que se repite se clona, no se construye.** `template()` + pool.
4. **Un listener por contenedor**, nunca uno por item (`dom.delegate`).
5. **Las vistas solo hablan con `repository.js`**, nunca con `fetch`.
6. **Los flyweights son inmutables.** Si hay que mutar algo, no es flyweight.


## Diseno

Dark con tinte violeta —no gris puro: el tinte es lo que separa un dark moderno
de uno plano—, tarjetas redondeadas, Bebas Neue para titulares y Outfit para
texto.

### Acento contextual por festividad

El color de acento vive en la variable CSS `--fest`, que se reescribe en `:root`
segun la festividad del dia. Toda la UI (botones, foco, anillos, badges,
seleccion de texto) se tine sola.

**Ningun componente sabe que existen las festividades**: solo leen `var(--fest)`.
Hoy, 31 de octubre, la app entera esta en naranja Halloween.

### Pantallas

| Ruta | Que hay |
| --- | --- |
| `/` | Hero de la festividad + filas virtualizadas: tematica, recientes, mejor valorado y los canales en vivo por categoria |
| `/explorar` | Filtros de tipo y orden + grilla virtualizada |
| `/titulo/:slug` | Ficha con poster, badge de cadena, tabs de temporada y rejilla de episodios |
| `/ver/:slug/tN/cN` | Reproductor + lista de la temporada con el capitulo activo marcado + Anterior/Siguiente |
| `/en-vivo` | 55 canales verificados, chips por categoria, reproductor HLS |
| `/buscar` | Busqueda con debounce sobre el indice construido en idle |
| `/guia` | Programacion del canal propio |

Cambiar de capitulo **no recarga la pagina**: solo se reemplaza el reproductor y
se mueve la marca de activo. El sitio de referencia hace una recarga completa en
cada "Siguiente".

### El reproductor usa facade

Al entrar a un capitulo **no se carga nada**: se pinta un poster con un boton.
Solo al pulsar se inserta el iframe o se importa hls.js (123 KB gzip, en su
propio chunk). Si venias a leer la sinopsis, no pagas ese coste.

Es lo contrario de lo que hace el sitio de referencia, que monta el iframe de
ok.ru de entrada.

## Peso real

Arranque medido sobre `dist/` con gzip:

```
index.html     0.79 KB
CSS            5.99 KB
runtime        3.84 KB
repository     3.30 KB
app            1.34 KB
-------------------------
TOTAL         15.25 KB gzip
```

Cada vista pesa entre 1 y 2.2 KB gzip y baja solo al visitarla. hls.js (123 KB)
solo baja si pulsas play en un canal.

## Datos

- `npm run data` regenera el indice de festividades (`picks.json`).
- `npm run channels` revalida los 55 canales en vivo.

Detalle completo en [docs/esquema-datos.md](docs/esquema-datos.md) y
[docs/canales.md](docs/canales.md).

## Estado

Funcional: el runtime completo, la capa de datos con festividades, las 7 vistas,
el reproductor con HLS en vivo verificado y 55 canales reales.

Pendiente: la grilla EPG en dos ejes, el historial de "continuar viendo"
(el slice ya existe en el store) y poblar el catalogo de series.

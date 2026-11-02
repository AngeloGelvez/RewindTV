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
    layout/                 AppShell (persistente), Navbar (topbar + barra movil)
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

Interfaz de television moderna: una pila de **paneles** redondeados sobre fondo
casi neutro, tarjetas apaisadas 16:9, cristal con blur suave y el rojo "en
directo" como unico color fijo de marca.

### Tipografia

**Inter** para texto e **Inter Tight** para titulares. Antes los titulares iban
en Bebas Neue: mayusculas condensadas, bonitas en un cartel y malas en una
ficha — a tamano pequeño se cierran, los acentos castellanos se amontonan y un
nombre largo como "Las Sombrias Aventuras de Billy y Mandy" se vuelve un muro.
Inter tiene altura de x grande y cifras claras, que es lo que se lee desde el
sofa y en un movil.

### Modo claro y oscuro

`html[data-theme]`, con el modo del sistema por defecto y un boton en la barra
superior. Se aplica **antes del primer pintado** con un script en linea de
`index.html`: si se dejara al modulo, la pagina arrancaria oscura y saltaria a
clara en el primer frame.

Las dos escalas de superficie viven en `tokens.css` y `theme.js` las recalcula
con la festividad encima. El acento usado como texto se corrige al contraste en
las dos direcciones: **aclarandolo** sobre fondo oscuro y **oscureciendolo**
sobre fondo claro, que no es el mismo calculo.

### Tema por festividad

Cada festividad de `festivities.json` declara dos colores (`color` y
`accent2`). `src/core/theme.js` deriva de ellos la paleta entera y la escribe
en `:root`: acento, texto sobre acento, acento legible, el aura de fondo y las
cinco superficies.

La festividad manda en lo pequeño —botones, chips, barras, foco, logo— y solo
**insinua** las superficies: el tinte va desaturado (se mezcla con su propio
gris) y pesa entre un 1 y un 8 %. Una portada entera teñida de naranja cansa a
los dos minutos y hunde el contraste de las imagenes, que son el contenido
real. En Halloween el sitio se nota naranja; no se vuelve naranja.

**Ningun componente sabe que existen las festividades**: leen `--fest`,
`--fest-text`, `--fest-ink` y las superficies, y nada mas.

Se calcula en JS y no con `color-mix()` por dos motivos:

- **El contraste se garantiza.** El texto sobre un relleno de acento se elige
  blanco o negro segun la luminancia real, y el acento usado como texto se
  corrige hasta llegar a 4.5:1 contra la superficie donde se apoya, en los dos
  modos.
- **Los televisores** van varias versiones de Chromium por detras y
  `color-mix()` no existe antes de la 111.

El ultimo tema se guarda en `localStorage` y se reaplica antes del primer
pintado, para que la app no arranque violeta y salte al color del dia.

### Accesibilidad

- Las tarjetas son `<a href>` reales: se alcanzan con Tab y con el mando,
  Enter funciona solo, Ctrl+clic abre en pestaña nueva y el lector las anuncia
  limpias (lo decorativo va con `aria-hidden`).
- Enlace "Saltar al contenido", rail como `<nav aria-label="Principal">` con
  `aria-current`, buscador con `role="search"`.
- Al navegar (`src/core/a11y.js`): cambia el titulo de la pestaña, una region
  `aria-live` anuncia la pagina, y el foco va al contenido. Al volver Atras,
  regresa a la tarjeta desde la que se entro.
- Chips y pestañas de temporada con `aria-pressed`.
- Grises de texto revisados: el secundario anterior (`#6b6b85`) daba 3.1:1 y
  fallaba AA; el actual da 4.5:1 o mas en todos los temas.
- Respeta `prefers-reduced-motion`, `prefers-contrast: more` y los colores
  forzados de Windows.

### Responsive

Un solo juego de componentes para movil, tablet, escritorio y television:

| Ancho | Que cambia |
| --- | --- |
| < 640 | Solo el simbolo del logo (el buscador necesita el ancho), navegacion en barra inferior al alcance del pulgar, 1,5 tarjetas por fila |
| 640-1024 | Vuelve el nombre escrito y el boton "En vivo" |
| > 1024 | Enlaces con rotulo en la barra superior, hasta 6 tarjetas por fila |
| TV (`html.tv`) | La barra inferior vuelve a ser rail lateral y todo escala con la fuente raiz |

Las filas no usan media queries: `Carousel` y `VirtualGrid` reciben el ancho de
tarjeta como **funcion del ancho disponible**, asi que el numero de columnas y
el alto de fila (16:9 + texto) salen de una medida real, no de un punto de
corte escrito a mano.

### Smart TV

`src/core/spatialNav.js` mueve el foco con las flechas al elemento mas cercano
en esa direccion, midiendo la geometria en cada pulsacion (las filas son
virtualizadas: un mapa de vecinos fijo quedaria obsoleto en el primer scroll).
Funciona tambien con el teclado de un PC.

| Tecla del mando | Accion |
| --- | --- |
| Flechas | Mover el foco |
| OK | Abrir (nativo: los destinos son enlaces y botones) |
| Atras | Volver (codigos 461 de webOS y 10009 de Tizen) |
| Play/Pausa | El video de la pagina |

En un televisor (Tizen, webOS, Android TV, Fire TV, Chromecast, HbbTV...) se
activa `html.tv`: interfaz de 3 metros con la fuente raiz a 1.25vw (24 px a
1920), foco de 4 px, la tarjeta enfocada crece, la fila enfocada se centra y
hay margen de zona segura en los bordes. Para probarlo desde un PC:
`/?tv=1` (se recuerda; `/?tv=0` lo quita).

**Navegadores soportados en TV:** Chromium 88 o superior, que en la practica
son televisores de 2022 en adelante (webOS 22, Tizen 7) y cualquier Android TV
o Fire TV actualizado. Por debajo faltan `aspect-ratio` y `:focus-visible`.

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

El catalogo son **503 series y 29.199 capitulos** importados de un volcado CSV
de lacartoons.com. No se escribio a mano: `scripts/import-lacartoons.mjs` lo
convierte al esquema del proyecto (una fila por capitulo -> `titles.json` +
`episodes/<id>.json`) y de paso valida proveedores, duplicados y filas sin
enlace.

- `node scripts/import-lacartoons.mjs <csv>` reimporta el catalogo (`--dry` solo reporta).
- `npm run data` regenera el indice de festividades (`picks.json`).
- `npm run channels` revalida los 55 canales en vivo.
- `node scripts/check-sources.mjs` sondea las fuentes de los capitulos.

Detalle completo en [docs/esquema-datos.md](docs/esquema-datos.md) y
[docs/canales.md](docs/canales.md).

## Estado

Funcional: el runtime completo, la capa de datos con festividades, las 7 vistas,
el reproductor con HLS en vivo verificado y 55 canales reales.

Pendiente: la grilla EPG en dos ejes, el historial de "continuar viendo"
(el slice ya existe en el store) y poblar el catalogo de series.

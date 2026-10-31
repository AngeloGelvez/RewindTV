# Analisis del sitio de referencia

Hecho sobre el markup que aparece en las dos capturas y en el HTML seleccionado.
No se descargo el catalogo del sitio: lo que sigue es ingenieria inversa de la
**estructura**, que es lo util para disenar la nuestra.

## 1. Stack detectado

| Pista en el HTML | Conclusion |
| --- | --- |
| `/rails/active_storage/representations/proxy/...` | **Ruby on Rails** con Active Storage. Las imagenes se sirven por un proxy de la propia app. |
| `eyJfcmFpbHMiOnsiZGF0YSI6...` (base64) | Las variantes de imagen van firmadas en la URL: `{"format":"jpg","resize_to_limit":[200,200]}`. |
| `href="/serie/capitulo/1?t=1"` | **Server-side rendering clasico**: cada capitulo es una recarga completa de pagina. No es SPA. |
| `<iframe src="https://ok.ru/videoembed/...">` | El video **no es suyo**: lo delegan a ok.ru / VK. Cero coste de almacenamiento y de ancho de banda. |
| `fa fa-chevron-right fa-rotate-90` | Font Awesome completo por iconos. |
| `.episodio-panel { max-height: 706px }` inline | Acordeon JS de la escuela jQuery: anima `max-height` calculado en JS. |

## 2. Modelo de datos implicito

```
Serie
 ├─ nombre, poster, año, rating (0-10, mostrado en estrellas)
 ├─ cadena        -> badge de color (Cartoon Network, Marvel, Otros...)
 ├─ generos
 └─ Temporada (data-temporada-id)
     └─ Capitulo
         ├─ numero, nombre ("El problema de la puerta / Dientes de oro / ...")
         ├─ reseña (campo existe pero viene vacio)
         └─ embed -> iframe de proveedor externo
```

Rutas: `/serie/capitulo/:id?t=:temporada`. El `id` del capitulo es global, y la
temporada viaja como query param — senal de que la relacion temporada-capitulo
se resuelve en el servidor, no en la URL.

## 3. Estructura de la tarjeta

```html
<div class="conjuntos-series">
  <a>
    <div class="serie">            <!-- 225x320, border-radius 20px -->
      <img src="...">              <!-- poster, variante 200x200 -->
      <div class="informacion-serie">
        <h3>2 Perros Tontos</h3>
        <span class="marcador marcador-cartoon">Cartoon Network</span>
        <span class="marcador-anio">1993</span>
        <span>7 ★</span>
      </div>
    </div>
  </a>
</div>
```

La informacion se superpone sobre el poster con un degradado. Es exactamente lo
que ya hace nuestro `TitleCard`, asi que la estructura visual se valida.

## 4. Que vale la pena copiar

1. **Badge de cadena por color.** Da identidad y orienta de un vistazo. Nosotros
   ya lo tenemos, pero como *dato* (`Network.color`) y no como clase CSS: ellos
   necesitan tocar el CSS cada vez que entra una cadena nueva.
2. **Filtros como chips arriba** (Marvel, Otros, Cartoon Network). Simple y
   directo, sin menus desplegables.
3. **Acordeon de temporadas** en la vista de capitulo, con el episodio actual
   marcado. Buena densidad de informacion.
4. **Boton "Siguiente"** encima de la lista: es la accion mas frecuente y la
   tienen a un click, sin scroll.
5. **No alojar video propio.** Decision economica correcta; nosotros mantenemos
   `{ provider, id }` en el dato para no atarnos a uno solo.

## 5. Que NO copiar (y por que)

| Problema | Coste | Nuestra solucion |
| --- | --- | --- |
| **Posters por Active Storage proxy** | Cada miniatura pasa por Rails, sin CDN y re-encodeando. Es el cuello de botella de la portada. | Imagenes estaticas pre-generadas en varios tamanos + `srcset`, servidas por CDN. |
| **Variante 200x200 para una tarjeta de 225x320** | La imagen llega mas pequena que el hueco: se ve borrosa y ademas deforma el aspecto 2:3. | Variantes 2:3 reales (180/360/540 de ancho). |
| **Recarga completa por capitulo** | Cada "Siguiente" vuelve a bajar HTML, CSS, fuentes e iconos. | Navegacion SPA: solo cambia el iframe y la lista marca el nuevo activo. |
| **Iframe de terceros cargado de entrada** | ok.ru mete su propio runtime (cientos de KB) y bloquea el hilo antes de que el usuario decida ver nada. | **Facade pattern**: poster + boton de play; el iframe se inserta tras el primer click. Lo dejo previsto en `src/data/models/embed.js`. |
| **Font Awesome completo** | ~70 KB de fuente por 3 iconos. | Sprite SVG inline con los iconos que usemos. |
| **Acordeon animando `max-height`** | `max-height` dispara layout en cada frame. | `grid-template-rows: 0fr -> 1fr`, que es composite-only. |
| **Todos los episodios en el HTML** | Una serie de 200 capitulos infla el documento inicial. | `loadEpisodes()` diferido, ya implementado. |

## 6. Cambios que esto introduce en nuestro modelo

- `src/data/models/episode.js` — serie → temporada → capitulo, con `source`
  como `{ provider, id }` en vez de URL completa.
- `src/data/models/embed.js` — construye la URL del embed por proveedor y marca
  cuales requieren iframe (para aplicar la facade).
- `Network` ahora lleva `color`.
- `Title` gana `score` (el "7 ★") y `seasonCount` / `episodeCount`, pero **no**
  la lista de episodios: esa se carga al abrir el detalle, con deduplicacion de
  peticiones concurrentes en `repository.loadEpisodes()`.

---

## 7. Segunda captura: de donde sale la lista de episodios

Pregunta: *¿la lista de capitulos viene de un iframe de terceros?*

**No.** Hay que separar dos cosas en esa pagina:

```
section.contenedor-video-recomendaciones
└─ div.container > div.row
   └─ div.serie-video-informacion          <-- HTML propio, servido por Rails
      ├─ h2.subtitulo-linea                    titulo + badge de cadena
      ├─ h3                                    "Episodio 1 de la temporada 1: ..."
      ├─ iframe                            <-- UNICO elemento de terceros
      ├─ div.controles-episodios > a            "Siguiente"
      ├─ div.resena-serie
      └─ div.contenedor-episondios         <-- la lista, tambien HTML propio
         ├─ h4.accordion[data-temporada-id]
         └─ div.episodio-panel[style="max-height: 1085px"]
            └─ ul.listas-de-episodion
               └─ li > a[href="/serie/capitulo/7943?t=1"]
```

La lista esta en `div.contenedor-episondios > div.episodio-panel >
ul.listas-de-episodion`, renderizada por su propio Rails. Lo unico de terceros
es el `<iframe>` del reproductor.

Tres detalles que confirman que es HTML propio:

1. Los `href` son **rutas relativas de su dominio** (`/serie/capitulo/7943?t=1`),
   no URLs externas.
2. El `max-height: 1085px` es **inline y calculado**: lo escribe su JS al medir
   el `<ul>` para animar el acordeon. Un iframe no puede hacer eso.
3. El capitulo activo lleva `class="active"` aplicada en servidor.

### Los ids delatan el tamano del catalogo

| Serie | Capitulo 1 | Siguiente |
| --- | --- | --- |
| 2 Perros Tontos | `/serie/capitulo/1?t=1` | `/serie/capitulo/2?t=1` |
| Bob Esponja | `/serie/capitulo/7943?t=1` | `/serie/capitulo/7944?t=1` |

El id de capitulo es **global y secuencial**, no por serie. Entre ambos hay
7.942 registros, asi que el catalogo real ronda los miles de capitulos. Esto
confirma por que nuestro esquema NO puede meter los episodios en el fichero del
catalogo.

### Usan varios proveedores de video a la vez

| Serie | Embed |
| --- | --- |
| 2 Perros Tontos | `ok.ru/videoembed/1392690399817` |
| Bob Esponja | `dhtpre.com/embed/xzgds6v30wet` |

Dos proveedores distintos, con la URL completa escrita en el HTML. Si uno cae o
cambia de dominio, tienen que reescribir miles de registros. Es exactamente el
motivo por el que nosotros guardamos `["okru", "1392690399817"]` y construimos
la URL en `src/data/models/embed.js`.

### Lo que NO esta en el HTML

No hay rastro de festividades, ni de fechas tematicas, ni de recomendacion por
temporada. Su portada es un orden fijo con filtros por cadena. Esa parte no la
copiamos: es nuestra.

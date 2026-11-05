# Esquema de datos (sin backend)

Toda la "base de datos" son ficheros JSON estaticos en `public/data/`. No hay
servidor de aplicacion: el navegador los pide como cualquier otro asset y un
CDN los cachea. El coste de operacion es cero y la latencia es la de un fichero.

## Reparto de ficheros

El reparto no es estetico, es de rendimiento. La regla: **lo que necesita la
portada se carga al inicio; todo lo demas, bajo demanda.**

| Fichero | Cuando se carga | Tamano esperado |
| --- | --- | --- |
| `titles.json` | al arrancar | ~260 bytes por titulo (487 series = 190 KB reales) |
| `festivities.json` | al arrancar | ~2 KB, fijo |
| `picks.json` | al arrancar | pocos KB — **generado**, no se escribe a mano |
| `episodes/<titleId>.json` | al abrir una serie | ~80 bytes por capitulo |
| `channels.json` + `schedule.json` | al entrar a "En vivo" | pocos KB |

El error que hay que evitar es un `database.json` unico con todo dentro: con 500
series y 20.000 capitulos serian varios MB que el usuario baja para ver una
portada de 20 tarjetas.

## `titles.json`

Catalogo ligero. **No contiene episodios.**

```json
{
  "id": "t1",
  "slug": "2-perros-tontos",
  "name": "2 Perros Tontos",
  "year": 1993,
  "kind": "serie",
  "runtime": 22,
  "seasonCount": 1,
  "episodeCount": 2,
  "score": 7,
  "poster": "3Lyc5VqhTqq76vmKUn1an8rlnP7.jpg",
  "backdrop": "qyW97RT9OFwwQJteSQ1FACQfrBD.jpg",
  "synopsis": "Dos perros callejeros sin nombre...",
  "rating": "TV-Y7",
  "genres": ["comedia", "animacion"],
  "network": "Cartoon Network"
}
```

`poster` (vertical) y `backdrop` (apaisada) guardan el **nombre del fichero
en TMDB**, no la URL. El prefijo y el ancho los pone `src/data/models/images.js`:
w780 para la ficha, w1280 para el hero, w500 para las tarjetas y w300 para las
miniaturas de episodio. Repetir `https://image.tmdb.org/t/p/w780/` en dos
campos por titulo serian ~34 KB de texto en el fichero que se baja al arrancar,
y el ancho es una decision de la interfaz, no del dato. Una ruta que empieza por
`/` o por `http` se respeta tal cual, asi que una imagen propia en `public/img/`
convive con las de TMDB. Un titulo sin portada no lleva el campo: la tarjeta
pinta el color de su cadena con las iniciales.

Las portadas entran con `node scripts/import-portadas.mjs <csv>`, que parchea
`titles.json` sin tocar nada mas. De 504 titulos, 495 tienen portada vertical y
490 apaisada; 27 coincidencias quedaron marcadas para revisar y el script las
lista en cada pasada.

`genres` y `network` son **strings**, no objetos. Al parsear se convierten en
flyweights compartidos (`Genre.get`, `Network.get`): 500 series que digan
`"Cartoon Network"` acaban apuntando al mismo objeto en memoria.

## `episodes/<titleId>.json`

Un fichero por serie. Claves cortas a proposito: con 20.000 capitulos, los
nombres de campo pesan mas que los datos.

```json
{
  "titleId": "t1",
  "seasons": [
    {
      "number": 1,
      "episodes": [
        {
          "n": 1,
          "name": "El problema de la puerta",
          "src": ["okru", "1392690399817"],
          "min": 22,
          "fest": ["halloween"]
        }
      ]
    }
  ]
}
```

| Campo | Significado |
| --- | --- |
| `n` | numero de capitulo dentro de la temporada |
| `src` | `[proveedor, id]` — **nunca la URL completa** |
| `srcs` | lista de tuplas en orden de preferencia (alternativa a `src`) |
| `min` | duracion en minutos (opcional, hereda del titulo) |
| `fest` | festividades a las que pertenece (opcional) |
| `synopsis` | opcional |
| `st` | fotograma del capitulo (nombre de fichero, como las portadas, o URL propia); por ahora solo en `t518` |

El `id` del episodio no se guarda: se deriva (`t1-1-1`). Un campo menos por
cada capitulo.

### Por que `src` es una tupla

En el sitio de referencia el `<iframe>` lleva la URL completa, y ademas usan
**varios proveedores a la vez**: `ok.ru/videoembed/...` en una serie y
`dhtpre.com/embed/...` en otra. Si un proveedor cae o cambia de dominio, hay
que reescribir miles de registros.

Guardando `["okru", "1392690399817"]`, la URL se construye en
`src/data/models/embed.js` y cambiar de proveedor es tocar una funcion.
Proveedores soportados: `okru`, `vk`, `dailymotion`, `rpmvid`, `cubeembed`,
`dhtpre`, `yourupload`, `blogger`, `mp4`.

`rpmvid` y `cubeembed` son el mismo servicio con dos formas de URL (el id va en
el fragmento o en el path). Son dos entradas del registro porque lo que cambia
es como se construye la URL, que es justo lo que el registro guarda.

`blogger` guarda en el id **la query entera**, no solo el token, igual que
`vk`. No es un capricho de formato: el blog embebe
`video.g?token=...&origin=<su dominio>` y ese `origin` viaja hasta el
reproductor de YouTube que `video.g` monta por dentro. Sin el, el reproductor
carga, dice `isPlayable: true` y se queda en buffering con **0 bytes** hasta
rendirse con "Se produjo un error. Vuelve a intentarlo mas tarde".

Eso fue exactamente lo que paso la primera vez: el volcado del blog guardaba
solo `token=...`, se perdio el `origin` y los 34 capitulos daban ese error. La
regla que queda: **replicar el embed del blog tal cual**, parametros incluidos.

La otra leccion es sobre como se comprueba. Desde Node el enlace devuelve el
MP4 (206, `ftypmp42`, 22 minutos) tanto con `origin` como sin el, asi que un
sondeo desde Node daba los 34 por buenos mientras ninguno se veia. Node puede
decir que el video **existe**; que se **reproduce** solo lo dice un navegador.
Por eso `check-sources.mjs` marca `muerta` unicamente cuando la pagina ya no
trae stream, y `indicio` cuando lo trae.

El token caduca y rota, pero no es lo critico: uno del volcado original, de
años atras, sigue devolviendo stream. Aun asi el importador los relee del blog
en cada pasada, que es gratis y evita la duda.

Un proveedor que no este en ese registro **no rompe la vista**: la fuente se
descarta al parsear, el capitulo cae a la siguiente y la consola avisa una vez.

### Varias fuentes por capitulo

Un enlace de tercero se cae solo. Por eso un capitulo puede declarar varias
fuentes y el Player las recorre en orden:

```json
{
  "n": 1,
  "name": "El problema de la puerta",
  "srcs": [
    ["okru", "1392690399817"],
    ["mp4", "https://cdn.ejemplo/cap01.mp4"]
  ]
}
```

`src` (una sola tupla) se sigue aceptando y significa lo mismo que un `srcs`
de un elemento: no hay que reescribir los ficheros que ya estan bien.

El salto entre fuentes no es simetrico, porque la informacion disponible no lo es:

| Tipo | Deteccion de fallo | Quien decide |
| --- | --- | --- |
| `mp4` / HLS | evento `error` del `<video>`, error fatal de hls.js | automatico |
| iframe | **ninguna** — opaco por origen cruzado | el usuario, con un boton |

Un iframe de ok.ru devuelve 200 y dispara `load` aunque pinte "video no
disponible": no hay forma de saberlo desde nuestra pagina. Fingir una
deteccion automatica ahi seria mentir en la UI.

Lo observado se guarda en IndexedDB (`src/data/sourceHealth.js`): en la
siguiente visita una fuente que fallo no va primera. Un fallo caduca a las 12 h
y un acierto a los 7 dias, para que un corte de red no entierre un enlace bueno.

El sondeo de verdad corre en Node, donde no hay origen cruzado:

```bash
node scripts/check-sources.mjs             # solo reporta
node scripts/check-sources.mjs --prune     # borra las fuentes demostradas muertas
node scripts/check-sources.mjs --solo t518 # una sola serie
```

`--solo` importa en la practica: el catalogo entero son 29.000 peticiones y mas
de una hora. Despues de importar una serie, lo que hay que comprobar es esa
serie.

`--prune` solo quita lo que fallo de forma concluyente. El estado HTTP de un
embed queda como `indicio` y nunca se borra: una senal debil no justifica
perder el dato.

## `festivities.json`

Una festividad **no es una fecha, es una regla**. Asi el dataset no caduca:
nada que actualizar cada enero.

```json
{
  "slug": "halloween",
  "label": "Halloween",
  "emoji": "🎃",
  "color": "#ff7518",
  "priority": 90,
  "tagline": "Especiales de terror y episodios embrujados",
  "greeting": "¡Feliz Halloween!",
  "rule": { "type": "fixed-range", "from": "10-18", "to": "10-31", "peak": "10-31" }
}
```

Cuatro tipos de regla:

| Tipo | Forma | Ejemplo |
| --- | --- | --- |
| `fixed-range` | `{ from: "10-18", to: "10-31" }` | Halloween, Navidad, Verano |
| `fixed-day` | `{ month: 2, day: 14, window: 6 }` | San Valentin (6 dias antes) |
| `nth-weekday` | `{ month: 11, weekday: 4, nth: 4 }` | Accion de Gracias (4.º jueves) |
| `easter-offset` | `{ offset: -47, span: 2 }` | Carnaval, Pascua |

`fixed-range` admite cruzar el fin de año: Año Nuevo va de `12-27` a `01-06` y
la resolucion lo detecta sola.

`easter-offset` se apoya en el **computus gregoriano** implementado en
`festivity.js`: calcula el Domingo de Pascua de cualquier año y de ahi derivan
Carnaval (−47 dias), Miercoles de Ceniza (−46) y la propia Pascua.

### Temporada y dia señalado no son lo mismo

Navidad ocupa del 1 al 26 de diciembre —ahi es cuando apetece ver especiales
navideños— pero el dia es el 25. Esa diferencia es la que da el rotulo de la
portada:

| Cuando | Que dice |
| --- | --- |
| Dentro de la temporada, lejos del dia | `🎄 Navidad` |
| A 7 dias o menos | `🎄 Faltan 5 dias para Navidad` |
| La vispera | `🎄 Mañana es Navidad` |
| El dia | `🎄 ¡Feliz Navidad!` |

Las reglas de dia (`fixed-day`, `nth-weekday`, `easter-offset`) ya nombran un
dia. Las de rango lo declaran con `peak`. Una temporada sin `peak` —el verano,
el regreso a clases— no tiene cuenta atras ni saludo: no se felicita el verano.

La cuenta atras se mide SIEMPRE contra el dia, nunca contra el inicio de la
temporada. Accion de Gracias abre la suya tres dias antes; decir "faltan 3
dias" cuando faltan seis seria mentir con precision.

`greeting` va en el dato y no en el codigo porque "Feliz X" no vale para todas:
nadie dice "Feliz Regreso a Clases".

### El calendario es el de quien mira, no el UTC

Todo el calculo va en hora **local**. Yendo en UTC habia un fallo real: a las
23:30 del 31 de octubre en GMT-5 ya era 1 de noviembre en UTC, asi que la
portada dejaba de celebrar Halloween mientras la gente seguia disfrazada. El 25
de diciembre empieza cuando dan las doce en tu reloj.

### Resolucion de hoy

`repository.activeFestivity()` devuelve la festividad del dia. Cuando caen
varias a la vez gana la de mayor `priority`. Ejemplo real comprobado: el
**9 de febrero de 2027** coinciden San Valentin (ventana de 6 dias) y Carnaval
(Pascua 2027 − 47); gana San Valentin por prioridad 70 vs 50.

Si no hay ninguna activa, devuelve `null` y la portada cae al orden normal.
`upcomingFestivity()` da la siguiente y cuantos dias faltan, para un modulo de
"proximamente".

## `picks.json` — generado, no se edita

Es el indice `festividad -> episodios`, y es la pieza que hace viable el
"sin backend".

**El problema:** para armar la fila de Halloween en la portada, el navegador
tendria que saber que capitulos estan etiquetados con `halloween`. Esa
informacion vive dentro de los `episodes/*.json`. Sin indice, habria que bajar
los 500 ficheros al abrir la web.

**La solucion:** `scripts/build-picks.mjs` los recorre una vez en tu maquina y
deja un unico JSON de pocos KB:

```json
{
  "halloween": [
    { "t": "t1", "s": 1, "n": 2, "name": "La casa embrujada" },
    { "t": "t2", "s": 1, "n": 1, "name": "Estatica" }
  ]
}
```

El trabajo pasa del dispositivo del usuario (cada visita) a tu build (una vez).
Se ejecuta solo antes de cada `npm run build` (hook `prebuild`), o a mano:

```bash
npm run data
```

El script ademas valida: avisa de `titleId` que no existen en `titles.json`,
de slugs de festividad no declarados (y falla con exit 1), y lista las
festividades que se quedaron sin contenido.

## Flujo de arranque

```
1. index.html  ->  preload de titles/festivities/picks
2. bootstrap() ->  los tres en paralelo, con cache IndexedDB (2.ª visita: 0 red)
3. Se construyen los indices: byId, bySlug, byGenre, byDecade
4. activeFestivity(new Date())  ->  "halloween"
5. festivityPicks("halloween")  ->  la fila destacada de la portada
```

Comprobado hoy (31 de octubre): `Festividad de hoy: Halloween | proxima: Dia de Muertos`.

Los episodios de una serie solo se piden al abrir su detalle
(`repository.loadEpisodes`), con deduplicacion si dos componentes los piden a
la vez.

## Como anadir contenido

1. Nueva serie -> una entrada en `titles.json` + un `episodes/<id>.json`.
2. Episodio tematico -> anade `"fest": ["navidad"]` a ese capitulo.
3. Festividad nueva -> una entrada en `festivities.json` con su regla.
4. `npm run data` para regenerar el indice.

## El catalogo actual: importado, no escrito a mano

503 de los 504 ficheros de `episodes/` salen de un volcado CSV del
catalogo de lacartoons.com (una fila por capitulo, 29.199 filas) convertido por:

```bash
node scripts/import-lacartoons.mjs <ruta-del-csv>        # escribe
node scripts/import-lacartoons.mjs <ruta-del-csv> --dry  # solo reporta
npm run data                                             # regenera picks.json
```

El script existe en vez de una conversion a mano porque el volcado se va a
repetir: la fuente crece y los enlaces se caen. Ademas valida lo que el CSV no
garantiza.

| | |
| --- | ---: |
| Titulos | 503 |
| Capitulos | 29.199 |
| `titles.json` | 129 KB |
| Capitulos sin fuente usable | 8 |
| Capitulos renumerados | 6 |

Reparto de fuentes: `okru` 15.904, `rpmvid` 9.770, `dhtpre` 1.856,
`sendvid` 1.033, `cubeembed` 379, `yourupload` 249.

Estas cifras son las de la importacion. Despues se elimino Sendvid por sus
anuncios, con 17 series y 3 capitulos sueltos: hoy son **487 titulos y 28.200
capitulos**, y `import-lacartoons.mjs` ya no lo vuelve a traer.

### Las tres decisiones que no son obvias

**Capitulos repetidos.** Seis pares `(serie, temporada, capitulo)` vienen
duplicados con titulos distintos: son dos capitulos reales compartiendo numero.
Si se dejan, el id derivado (`t20-2-1`) colisiona y la vista de detalle pierde
uno. Se corren al final de su temporada, y eso se hace **despues** de leer el
CSV entero: moverlos sobre la marcha le roba el numero a un capitulo que aun no
ha llegado y el desplazamiento se propaga en cascada (19 capitulos movidos en
vez de 6, comprobado).

**Lo que el CSV no trae no se inventa.** No hay duracion por capitulo, ni
sinopsis, ni poster, ni clasificacion por edad: `min` se omite (la UI ya pinta
vacio), `synopsis` queda en blanco, las imagenes van a `/placeholder.svg` — la
tarjeta pinta las iniciales — y el modelo cae a `NR`. Tampoco hay generos: lo
unico afirmable de la fuente entera es que es animacion, asi que todos los
titulos entran con `animacion` y nada mas. Generos finos requieren otra pasada
con una fuente que los tenga.

**Festividades por palabra clave.** El CSV no las trae, pero el titulo del
capitulo las delata ("Especial Del Dia De Accion De Gracias"). Las reglas son
estrictas a proposito — solo el nombre de la fiesta — porque un falso positivo
mete un capitulo cualquiera en la portada de Halloween: un patron amplio como
`/terror|fantasma|monstruo/` daba 632 aciertos, la mayoria basura; el estricto
da 84 reales. Quedan 305 capitulos etiquetados y las once festividades con
contenido.

`openload.co` no esta en el registro de proveedores: el servicio cerro en 2020.
Sus 5 enlaces entran como capitulo sin fuente, no como fuente muerta.

## La segunda fuente: un blog por serie

No todo el catalogo sale de lacartoons. Hay series que solo existen en un blog
dedicado, con una entrada por capitulo y el video alojado en el propio Blogger.
Para esas esta `scripts/import-blogspot.mjs`:

```bash
node scripts/import-blogspot.mjs <ruta-del-csv> <clave-de-serie> --dry
node scripts/import-blogspot.mjs <ruta-del-csv> <clave-de-serie>
npm run data
```

La diferencia con el otro importador manda en todo el diseño: aquel convierte
un catalogo (503 series en un CSV y reescribe `titles.json` entero), este
convierte **una** serie y **parchea** `titles.json`. El CSV no trae nombre de
serie, ni año, ni cadena, porque el blog entero ES la serie: eso vive en el
registro `SERIES` del script, que es ademas la constancia de de donde salio
cada una.

| | |
| --- | ---: |
| Series por esta via | 1 (`t518`, El Show de los Looney Tunes) |
| Capitulos | 34 |
| Capitulos con fotograma | 28 |
| Embeds con la forma del blog | 34 / 34 |
| Tokens que devuelven stream | 34 / 34 |

Es la primera serie del catalogo con `st` (fotograma por capitulo) con datos
reales: el blog publica una imagen por entrada.

### Las tres decisiones de este importador

**El orden es el del blog, no el de emision.** El CSV no trae temporada ni
numero: un blog es una lista de entradas y lo unico que afirma sobre el orden
es la fecha de publicacion. Se numera por fecha ascendente y, dentro del mismo
dia, invirtiendo el orden del CSV (el blog lista de nuevo a viejo, asi que
darle la vuelta restaura el orden en que se publico). Deducir la temporada del
nombre del fichero de la portada (`tlts_212.png`) es tentador, pero el volcado
mezcla tres numeraciones de tres alojamientos y se contradicen: entra todo como
una temporada. El resultado se puede comprobar — el capitulo 1 queda en
"Mejores Amigos", que es el piloto real.

**Una imagen de un host muerto no entra.** Misma decision que `openload.co`:
6 de las 34 portadas estan en `sNN.postimg.org`, que no resuelve desde que
postimg se mudo a postimg.cc. Esos capitulos se quedan sin `st` y caen al fondo
de la serie. Las otras 28 suben a `https`: servimg sirve las mismas imagenes
por TLS y una web HTTPS no carga una imagen `http` — el navegador la bloquea
sin avisar al usuario.

**Un titulo sin `score` queda enterrado.** `build-picks.mjs` ordena cada fila de
festividad por la puntuacion del titulo y corta a 60; sin `score` cuenta como 0.
Comprobado: el especial navideño de esta serie no entraba en la portada de
Navidad hasta ponerle puntuacion. Dejar el campo vacio no es neutral.

### La cache de episodios tambien lleva version

Cambiar la forma de `src` tiene una trampa que no se ve en los JSON: el
adaptador guarda el fichero crudo en IndexedDB, y la clave `episodes:<id>` no
llevaba version (la del catalogo si). Quien ya hubiera abierto la serie seguia
construyendo la URL con el dato viejo durante 24 h, y el reproductor salia en
blanco aunque el fichero del disco ya fuera correcto. Reproducido plantando la
entrada vieja a mano antes de arreglarlo.

Ahora la clave es `episodes:v2:<id>`. **Al cambiar la forma de un campo de
episodios hay que subir `EPISODES_VERSION`** en `src/data/adapters/mockAdapter.js`,
igual que con `CATALOG_KEY`.

Hay un segundo efecto, este sin arreglar todavia, que conviene conocer antes de
dar una serie por rota: **una serie nueva no aparece hasta 24 h despues** para
quien ya habia visitado la web. `catalog:v6` se guarda entero y `loadAll` lo usa
tal cual si existe; no revalida contra la red pese a lo que dice la cabecera de
`cache.js`. Visto en vivo: un Chrome con el catalogo de 22 h daba "No encontrado"
en `/titulo/el-show-de-los-looney-tunes` mientras `titles.json` ya tenia los 504
titulos. Subir `CATALOG_KEY` al publicar contenido nuevo lo resuelve a mano;
revalidar en segundo plano lo resolveria solo.

### Reimportar el catalogo ya no se lleva estas series

`import-lacartoons.mjs` reescribe `titles.json` entero y borra los
`episodes/*.json` que ningun titulo respalda. Tal cual estaba, la siguiente
reimportacion del catalogo habria borrado `t518` y su fichero. Ahora recoge los
titulos que no salen de su CSV y los devuelve intactos al final, y los lista
al terminar (`de otra fuente: 1 (conservados: t518)`).

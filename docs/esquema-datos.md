# Esquema de datos (sin backend)

Toda la "base de datos" son ficheros JSON estaticos en `public/data/`. No hay
servidor de aplicacion: el navegador los pide como cualquier otro asset y un
CDN los cachea. El coste de operacion es cero y la latencia es la de un fichero.

## Reparto de ficheros

El reparto no es estetico, es de rendimiento. La regla: **lo que necesita la
portada se carga al inicio; todo lo demas, bajo demanda.**

| Fichero | Cuando se carga | Tamano esperado |
| --- | --- | --- |
| `titles.json` | al arrancar | ~260 bytes por titulo (503 series = 129 KB reales) |
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
  "poster": "/img/2-perros-tontos.webp",
  "backdrop": "/img/2-perros-tontos-bg.webp",
  "synopsis": "Dos perros callejeros sin nombre...",
  "rating": "TV-Y7",
  "genres": ["comedia", "animacion"],
  "network": "Cartoon Network"
}
```

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
`dhtpre`, `sendvid`, `yourupload`, `mp4`.

`rpmvid` y `cubeembed` son el mismo servicio con dos formas de URL (el id va en
el fragmento o en el path). Son dos entradas del registro porque lo que cambia
es como se construye la URL, que es justo lo que el registro guarda.

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
node scripts/check-sources.mjs           # solo reporta
node scripts/check-sources.mjs --prune   # borra las fuentes demostradas muertas
```

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
  "rule": { "type": "fixed-range", "from": "10-18", "to": "10-31" }
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

`titles.json` y los 503 ficheros de `episodes/` salen de un volcado CSV del
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

# Canales en vivo: auditoria del repo anterior

Origen: https://github.com/AngeloGelvez/site (`app/helpers/db.js`, 1.243 lineas,
205 canales en 4 categorias). Son streams HLS publicos de radio y TV en abierto.

## Resultado de la verificacion

Se pidio cada playlist con timeout de 9 s. Un canal cuenta como **vivo** solo si
responde 200 **y** el cuerpo es un playlist HLS real (`#EXTM3U`). Un 200 que
devuelve HTML es un portal caido redirigiendo, no un stream.

| Categoria | Vivos | Total |
| --- | ---: | ---: |
| music | 20 | 42 |
| general | 19 | 42 |
| entertainment | 21 | 94 |
| sports | 6 | 27 |
| **Total** | **66** | **205** |

**Sobreviven 66 de 205 (32 %).** Deportes es el peor: 6 de 27. Tiene sentido,
son los que mas se mueven de dominio.

### Por que fallan los 139

| Motivo | N.º | Que significa |
| --- | ---: | --- |
| `ENOTFOUND` | 55 | el dominio ya no existe |
| `HTTP 404` | 40 | el dominio vive, la ruta del playlist no |
| `timeout` | 20 | servidor colgado o inalcanzable |
| `HTTP 403` | 6 | bloqueo por region o por referer |
| `HTTP 400` | 4 | la URL necesita parametros que ya no se pasan |
| devuelve HTML | 4 | portal caido redirigiendo |
| `ERR_TLS_CERT_ALTNAME_INVALID` | 3 | certificado que no cubre ese dominio |
| `EAI_AGAIN` | 3 | fallo de DNS |
| `HTTP 401` / `504` | 4 | requiere auth / gateway caido |

## El filtro que casi se nos escapa: mixed content

De los 66 vivos, **11 solo responden por `http://`**. Una web servida por HTTPS
—GitHub Pages lo es— **no puede cargar un stream HTTP**: el navegador lo bloquea
por mixed content, sin excepcion y sin aviso util en la UI.

Reintente los 11 por HTTPS: **solo 1 funciona** (Canal 55 Telemorisco). Los
otros 10 dan `ERR_SSL_WRONG_VERSION_NUMBER` (el puerto no habla TLS) o timeout.

```
66 vivos − 11 solo-HTTP + 1 que sí da HTTPS = 55 canales usables
```

Ese es el numero real. En el sitio anterior esos 11 aparecen en la lista y
simplemente no arrancan al pulsarlos.

## Dataset resultante

`public/data/channels.json`, 50 canales:

| Categoria | N.º |
| --- | ---: |
| entretenimiento | 19 |
| musica | 18 |
| general | 16 |
| deportes | 2 |

Paises mejor representados: us (11), co (8), es (5), cl (5), ca (4), mx (3).

### Normalizacion aplicada

El `groupTitle` original mezclaba cuatro datos en un string:

```
"Movies;Religious ABN Bible Movies (720p) [Not 24/7]"
```

Se descompone en campos:

```json
{
  "id": "abn-bible-movies",
  "name": "ABN Bible Movies",
  "category": "entretenimiento",
  "genres": ["cine", "religioso"],
  "country": "us",
  "quality": "720p",
  "always": false,
  "logo": "https://...",
  "stream": "https://..."
}
```

- `genres` sale del prefijo (`Movies;Religious`), separando los generos reales
  de las palabras que solo repetian la categoria (`Music`, `General`, `Sports`,
  `Entertainment`).
- `country` sale del sufijo del `tvgId` (`51RadioTV.it` -> `it`).
- `quality` sale del `(720p)` final.
- `always: false` viene de `[Not 24/7]`: esos 7 canales emiten por franjas, y la
  UI debe tolerar un playlist vacio sin tratarlo como error.

Un apunte: el etiquetado de origen tiene errores que no corregi porque vienen
del m3u original — "Frecuencia Musical TV" esta marcado como `anime`.

## Segunda remesa: 1.864 canales

A la lista verificada se le sumo un volcado externo de 3.814 lineas
(`canal;grupo;tipo;listas;url;logo`) con `scripts/import-canales.mjs`, que
SUMA sin tocar lo que ya estaba. De esas 3.814 filas entraron 1.853:

| Descartado | N.º | Por que |
| --- | ---: | --- |
| Radio | 1.396 | Esto es un catalogo de television. Una emisora sin imagen en una rejilla de tarjetas con logo es una tarjeta que no hace nada |
| `http://` | 323 | El navegador bloquea mixed content en una web HTTPS, sin aviso util: entrarian solo para fallar al pulsarlas |
| No es HLS | 224 | .mpd (DASH) y ficheros sueltos; un "canal en vivo" que es un mp4 en bucle no es un canal |
| Ya estaban | 18 | Misma URL que uno de los 50 |

169 comparten nombre con otro (una cadena con dos señales) y se numera el id
en vez de pisarlo.

El nombre trae cuatro datos pegados y se parten con las mismas convenciones
que la primera remesa: `Telefe (1080p) [Not 24/7] | AR` da nombre, calidad,
franjas y pais.

Despues de pasar el verificador: **1.864 vivos de 1.903** (39 caidos, casi
todos 403 y 404). La lista final cubre 35 paises.

### La rejilla tuvo que virtualizarse

Con 50 canales, `live.js` pintaba una grilla CSS con todos dentro. Con 1.864
eso son ~20.000 nodos en el DOM, justo lo que el catalogo evita desde el
principio. Ahora usa el mismo `VirtualGrid` del catalogo —generalizado para
aceptar cualquier tarjeta con pool— y mantiene **40-50 tarjetas vivas**
recorriendo los 56.000 px de alto de la lista.

## Dos verificaciones, no una

`check-channels.mjs` corre en Node y comprueba lo que se puede comprobar
desde un servidor: que el playlist responda y que la variante exista. Hay dos
cosas que NO puede ver, y las dos deciden si un canal reproduce de verdad:

| | Que pasa | Quien lo sufre |
| --- | --- | --- |
| **CORS** | hls.js baja el playlist con `fetch`, asi que el origen tiene que mandar `Access-Control-Allow-Origin`. Node no tiene origen: para el siempre pasa | hls.js |
| **Codecs** | Reproducir por MSE exige que el navegador sepa decodificar lo que anuncia el playlist. AC-3 o HEVC son 200 por HTTP y silencio en pantalla | hls.js |

Un canal sin CORS todavia puede salvarse por el reproductor nativo, que no lo
necesita; muere solo el que falla por los dos caminos. Como esa medicion solo
se puede hacer en un navegador, el reparto es:

```bash
node scripts/check-channels.mjs --prune    # servidor: playlist y variante
# la sonda del navegador (esta en la cabecera de marcar-canales.mjs)
node scripts/marcar-canales.mjs ids.json   # marca lo que no reproduce
```

Esto es tambien la respuesta a "este canal da *Esta fuente no responde ahora
mismo*": casi siempre es un origen que no manda CORS y que Chrome tampoco sabe
reproducir de forma nativa. No hay arreglo posible desde una web sin backend
—haria falta un proxy que reenviara el playlist con sus cabeceras.

### Se marcan, no se borran

Los que no reproducen llevan `"webPlayable": false` y un `webReason`. Siguen en
la lista, al final de su categoria, con la tarjeta atenuada y un aviso en lugar
del rotulo "En vivo". Borrarlos quedaria mas limpio, pero esconderia algo que
es verdad —el canal existe y emite— y que deja de ser un problema en cuanto el
origen arregle sus cabeceras o la app se sirva tras un proxy.

El aviso aparece ANTES de pulsar: descubrirlo con un "esta fuente no responde"
suena a averia nuestra, y no lo es.

La marca se quita sola: si en la siguiente pasada el canal responde, el script
borra `webPlayable` de ese registro.

### Lo medido: 1.514 de 1.864

Sonda completa en Chrome sobre los 1.864 canales, 7 minutos:

| Motivo | N.º |
| --- | ---: |
| Sin CORS | 220 |
| El servidor rechaza al navegador (403/404/503) | 87 |
| Codec que el navegador no decodifica | 43 |
| **No reproducen** | **350** (18,8 %) |

De esos 350, el reproductor nativo no salvo **ni uno**: cuando hls.js no puede,
el `<video>` tampoco. Por eso la sonda de dos fases se puede reducir a una.

`scripts/check-web.mjs` hace esa comprobacion desde Node, pidiendo el playlist
con la cabecera `Origin` puesta y mirando si vuelve `Access-Control-Allow-Origin`:

```bash
node scripts/check-web.mjs --write ids.json
node scripts/marcar-canales.mjs ids.json
```

Detecta 234 de los 350, y conviene saber por que se le escapan 116: Chrome
rechaza ademas cadenas de codec mal formadas que `isTypeSupported` no acepta
(`avc1.66.31`, `avc1.420028`), y hay servidores que devuelven 403 solo al
navegador por las cabeceras que este añade y Node no. Para la pasada fina sigue
haciendo falta el navegador; para una revision rapida, el script basta.

## Revalidacion periodica

Los streams publicos se caen constantemente. Hay script permanente:

```bash
npm run channels
```

Reporta cuales siguen vivos, el motivo de cada caida, y avisa de los que
responden por HTTP. Con `--prune` reescribe `channels.json` dejando solo los
vivos y sellando `checkedAt`:

```bash
node scripts/check-channels.mjs --prune
```

Verificado el 2 de noviembre de 2026: **50 / 55 vivos** en la primera lista.
Los cinco caidos se quitaron del fichero.

### El master vivo no basta

El checker daba 55/55 y era enganoso: solo pedia el playlist MAESTRO. Hay
canales que responden 200 con su lista de variantes y devuelven **404 en la
variante**, asi que no reproducen aunque el checker los diera por buenos.
Ahora se comprueba tambien la primera variante, y el numero coincide con lo que
mide el navegador.

Dos reglas que salieron de ahi:

- **El timeout no borra.** `--prune` solo elimina lo demostrado muerto; un
  canal lento o un mal dia del servidor se conserva y se avisa. Perder un canal
  bueno es peor que arrastrar uno dudoso, porque el reproductor ya sabe decir
  que una fuente no responde.
- **15 segundos de espera**, no 9. Con 9, un canal vivo pero lento (1Twente TV)
  salia como caido; con 15 se vio su problema real, que era la variante.

## Tercera remesa: de 1.864 a 7.860, y partida en trozos

Un segundo volcado externo de 10.150 lineas (mismo formato, mismo importador)
sumo **5.996** canales. Descartados: 281 radios, 2.017 por `http://`, 158 que no
son HLS y 1.698 que ya estaban. La deteccion de radio mira ahora tambien el
nombre (`Radio ...`, frecuencias FM), que es donde se escondian las que venian
sin grupo; ninguna de las 223 descartadas por ahi lleva tv, tele o canal.

### De cuatro categorias a diez

Con 8.000 canales, `general` tenia 4.500: una categoria que no divide nada. Son
ahora **generalistas, entretenimiento, noticias, deportes, cine, series,
infantil, musica, documentales y religioso**. Se clasifica por el grupo del CSV
—una sola tabla en `scripts/lib/canales.mjs` que cubre grupos, generos
guardados y categorias anteriores— y, solo si el grupo dice "general" o falta,
por palabras ENTERAS del nombre (`Gol TV` no debe caer en "gol"). Un canal que
dice ser de tres o mas cosas a la vez es entretenimiento: no es de ninguna.

Tambien se reclasifican los 1.864 de antes (433 cambian). Quedan: generalistas
3.353, entretenimiento 896, noticias 890, religioso 558, cine 491, musica 485,
series 345, documentales 344, infantil 299 y deportes 199.

### Un maestro y trozos derivados

| | Donde | Que es |
| --- | --- | --- |
| **Maestro** | `data/channels.json` | La fuente de verdad. Un canal por linea, fuera de `public/`. Lo tocan los scripts |
| **Trozos** | `public/data/channels/*.json` | Lo que sirve la web. Generado, no se versiona |
| **Indice** | `public/data/channels/index.json` | 7 KB: categorias, cuantos hay y 24 destacados |

`scripts/build-channels.mjs` los genera (`predev` y `prebuild` lo hacen solos)
en trozos de ~1.000 canales por categoria: 13 ficheros, **1,7 MB y 370 KB con
gzip**, el mayor de ~225 KB. Es el mismo reparto que `picks.json`: un dato
derivado no se edita a mano. A cada registro se le quita lo que es el valor
por defecto o lo que la interfaz no lee, que con 8.000 registros es un tercio
del peso.

La cache de IndexedDB lleva la **version del indice** como clave: regenerar la
lista invalida los trozos viejos sin tener que acordarse de subir un numero a
mano, que es lo que pasaba con `channels:v4` y se olvidaba.

En la web, cada pantalla pide lo minimo:

- **En vivo**: el indice y el primer trozo; los siguientes cuando la rejilla se
  queda sin canales y el centinela se acerca. Un enlace con `&k=<categoria>`
  carga solo ese trozo.
- **Portada**: solo el indice, con los 24 destacados repartidos por categoria.
- **Buscador**: los trozos, la primera vez que se escribe algo. No antes, y no
  consulta el indice hasta tenerlos todos: la busqueda se memoiza por termino y
  un resultado calculado con la lista a medias se quedaria cacheado incompleto.

### Verificacion de la tercera remesa

Las dos pasadas, en orden:

| Paso | Resultado |
| --- | --- |
| `check-channels.mjs --prune` (servidor) | 7.860 → **7.578**. 282 eliminados (403, 404), 12 conservados por timeout |
| Sonda de navegador (Chrome, 14 min) | **1.945 no reproducen (25,7 %)**: 1.616 sin CORS, 237 por codec, 92 que rechazan al navegador |

Es peor que el 19 % de la remesa anterior, y se nota donde se esperaba: la
mayoria de lo que no va son canales de Pluto TV, MTV y Nickelodeon alojados por
plataformas que no autorizan CORS. Por categoria, series (295 de 345) y cine
(284 de 487) son las mas afectadas; musica (67 de 454) y religioso (49 de 551)
casi no.

Los marcados van al final de su categoria, atenuados y con su aviso, asi que en
cada pestana lo que reproduce sale primero. La marca se quita sola: en esta
pasada 24 canales que estaban marcados volvieron a responder y se desmarcaron.

**El indice no se cachea en IndexedDB.** Se hizo asi al principio (30 minutos) y
una lista nueva tardaba media hora en verse: la cabecera seguia contando los
canales viejos. El indice es lo que dice que version de los trozos toca leer,
asi que son 7 KB que se piden siempre; lo que merece cache son los trozos, y
esos llevan la version del indice en la clave.

## Sobre el tamano del dataset

Antes de partirlo, 1.864 canales eran ~520 KB en un solo fichero y se
sostenia. Con 7.860 ya no: el maestro pesa 2,3 MB. Partir el fichero solo
servia con mas categorias —cuatro dejaban 4.500 en una—, asi que las dos cosas
fueron juntas.

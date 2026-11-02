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

## Sobre el tamano del dataset

1.864 canales son ~520 KB de JSON. Sigue en un solo fichero y de momento se
sostiene: no entra en el arranque —solo lo pide quien abre "En vivo"— y queda
en IndexedDB siete dias, asi que se baja una vez.

El corte natural, si molesta, es por categoria (`channels/musica.json`,
`channels/deportes.json`), igual que con `episodes/<titleId>.json`. Pero hoy
ganaria poco: 1.246 de los 1.864 caen en `general`, asi que el fichero gordo
seguiria siendo gordo. Lo que de verdad hacia falta no era partir el fichero,
sino no pintarlo entero de golpe, y eso ya esta.

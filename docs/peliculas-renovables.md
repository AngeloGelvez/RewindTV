# Películas con fuente renovable

`npm run dev` y `npm run preview` sirven la API de películas desde Vite. Abre Explorar, elige Películas y entra en un título importado. Al abrir la ficha se solicita una fuente nueva. El navegador puede exigir pulsar reproducir si bloquea el inicio automático.

## Producción en un solo servidor

En un alojamiento compatible con Node 22, usar `npm ci --include=dev && npm run build` como comando de compilación y `npm start` para arrancar. Compilar desde la raíz, con el `base` predeterminado `/`, y dejar `VITE_MOVIE_API_BASE` sin configurar. En el alojamiento, establecer `HOST=0.0.0.0` y usar el `PORT` que asigne la plataforma.

Abrir la URL HTTPS de ese despliegue. El mismo servidor entrega `dist/`, abre rutas como `/explorar` y responde a `/api/movies/:id/source`. El frontend utiliza una ruta relativa y el navegador se comunica con un solo origen.

## Frontend separado en GitHub Pages

GitHub Pages publica los archivos del frontend. La ruta `/api/movies/.../source` se ejecuta en un servicio Node separado.

1. En el alojamiento del backend, usar Node 22 y el comando `node server/start.mjs` desde la raíz del repositorio. El servicio necesita `server/` y `data/movie-sources.json`. Configurar `HOST=0.0.0.0`, el `PORT` del alojamiento y `REWINDTV_ORIGIN=https://angelogelvez.github.io`, sin `/RewindTV` ni barra final.
2. Comprobar `GET /api/movies/ps-008514dd7053fffc/source` en el dominio del backend. Con el encabezado `Origin: https://angelogelvez.github.io`, la respuesta debe incluir `Access-Control-Allow-Origin: https://angelogelvez.github.io`. Una respuesta 502 indica que el backend está accesible pero el proveedor no devolvió una fuente vigente.
3. En el repositorio de GitHub, abrir **Settings → Secrets and variables → Actions → Variables** y crear `VITE_MOVIE_API_BASE` con el origen HTTPS del backend. Por ejemplo, `https://api.example.com`. El workflow incorpora esta variable al compilar el frontend.
4. Ejecutar de nuevo **Publicar en GitHub Pages** y abrir una película. La petición debe ir al backend configurado. Si falta la variable, el reproductor muestra que el servicio aún no está configurado.

La API busca el título y el idioma en su catálogo. Consulta al proveedor para que emita una URL nueva y comprueba el manifiesto. El navegador recibe la URL vigente y conserva el minuto de reproducción si necesita renovarla una vez tras un error de autorización. El campo de caducidad es una estimación del proveedor. La reproducción desde otras IP debe verificarse desde el entorno donde se vaya a publicar.

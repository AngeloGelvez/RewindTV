# Películas con fuente renovable

`npm run dev` y `npm run preview` sirven la API de películas desde Vite. Abre Explorar, elige Películas y entra en un título importado. Al abrir la ficha se solicita una fuente nueva. El navegador puede exigir pulsar reproducir si bloquea el inicio automático.

Para GitHub Pages, ejecutar `node server/start.mjs` en un backend Node 22 con el archivo `data/movie-sources.json`. Configurar `HOST`, `PORT` y `REWINDTV_ORIGIN` según el alojamiento. Establecer `VITE_MOVIE_API_BASE` con el origen HTTPS de ese backend antes de compilar el frontend. El backend debe quedar detrás del control de tráfico del alojamiento.

La API busca el título y el idioma en su catálogo. Consulta al proveedor para que emita una URL nueva y comprueba el manifiesto. El navegador recibe la URL vigente y conserva el minuto de reproducción si necesita renovarla una vez tras un error de autorización. El campo de caducidad es una estimación del proveedor. La reproducción desde otras IP debe verificarse desde el entorno donde se vaya a publicar.

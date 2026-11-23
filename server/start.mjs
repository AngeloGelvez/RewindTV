import { createServer } from 'node:http';
import { movieApi } from './movie-api.mjs';

const handler = movieApi({ allowedOrigin: process.env.REWINDTV_ORIGIN });
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
const server = createServer((req, res) => {
  handler(req, res, () => {
    res.writeHead(404).end();
  }).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});
server.listen(port, host, () => console.log(`API de películas en http://${host}:${port}`));

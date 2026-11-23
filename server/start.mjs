import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { movieApi } from './movie-api.mjs';

const handler = movieApi({ allowedOrigin: process.env.REWINDTV_ORIGIN });
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
const dist = fileURLToPath(new URL('../dist', import.meta.url));
const index = resolve(dist, 'index.html');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

async function fileInfo(file) {
  try {
    const info = await stat(file);
    return info.isFile() ? info : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function serveApp(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(404).end();
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return res.writeHead(400).end();
  }
  if (pathname === '/api' || pathname.startsWith('/api/')) return res.writeHead(404).end();
  if (/[\\\u0000]/.test(pathname)) return res.writeHead(400).end();
  let file = pathname === '/' ? index : resolve(dist, `.${pathname}`);
  if (!file.startsWith(dist + sep)) return res.writeHead(404).end();
  let info = await fileInfo(file);
  if (!info && !extname(pathname) && req.headers.accept?.includes('text/html')) {
    file = index;
    info = await fileInfo(file);
  }
  if (!info) return res.writeHead(404).end();
  res.writeHead(200, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  await pipeline(createReadStream(file), res);
}

const server = createServer((req, res) => {
  handler(req, res, () => serveApp(req, res)).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});
server.listen(port, host, () => console.log(`RewindTv en http://${host}:${port}`));

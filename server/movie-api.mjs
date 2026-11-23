import { readFileSync } from 'node:fs';
import { refreshSource } from './refresh-provider.cjs';

export function movieApi({ allowedOrigin, resolveSource = refreshSource } = {}) {
  const catalog = JSON.parse(readFileSync(new URL('../data/movie-sources.json', import.meta.url), 'utf8'));
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    const match = /^\/api\/movies\/(ps-[a-z0-9-]+)\/source$/.exec(url.pathname);
    if (!match) return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (allowedOrigin && req.headers.origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
    }
    const send = (code, body) => { res.statusCode = code; res.end(JSON.stringify(body)); };
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return send(405, { error: 'Método no admitido.' });
    }
    const sources = catalog[match[1]];
    if (!sources?.length) return send(404, { error: 'Película sin fuentes registradas.' });
    const language = url.searchParams.get('idioma');
    const candidates = language ? sources.filter(s => s.idioma_declarado === language) : sources;
    if (!candidates.length) return send(404, { error: 'Idioma no disponible.' });
    const attempts = candidates.length === 1 ? [candidates[0], candidates[0]] : candidates.slice(0, 3);
    for (const source of attempts) {
      try {
        const current = await resolveSource(source);
        return send(200, { url: current.url, idioma: current.idioma_declarado, token: current.token });
      } catch {
        // Otra variante del catálogo puede seguir disponible.
      }
    }
    return send(502, { error: 'No se pudo obtener una fuente vigente. Inténtalo de nuevo.' });
  };
}

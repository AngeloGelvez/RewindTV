/**
 * Subruta donde vive la app: vacia en desarrollo y `/RewindTV` en GitHub Pages.
 *
 * El codigo habla siempre en rutas de la app (`/en-vivo`). Solo dos sitios las
 * traducen: `withBase` al escribir una URL real y `stripBase` al leerla.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export const withBase = (path) => `${BASE}${path}`;

export function stripBase(pathname) {
  if (!BASE || !pathname.startsWith(BASE)) return pathname;
  return pathname.slice(BASE.length) || '/';
}

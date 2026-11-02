/**
 * Sprite de iconos inline. Un solo <svg> oculto con <symbol>, y cada uso es un
 * <use href="#i-home">. El navegador parsea el path UNA vez.
 *
 * Alternativa descartada: Font Awesome completo, que es lo que usa el sitio de
 * referencia: ~70 KB de fuente para tres iconos.
 */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  live: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-2 6 7 4-7 4z',
  guide: 'M4 5h16v3H4zm0 5h16v3H4zm0 5h10v3H4z',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14m6.5 12.5L21 20',
  play: 'M8 5v14l11-7z',
  plus: 'M12 5v14M5 12h14',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18',
  chevron: 'm9 6 6 6-6 6',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 20a2 2 0 0 1-3.4 0',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12m10-2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5',
  tv: 'M4 8h16v12H4zM8 4l4 4 4-4',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  check: 'm5 13 4.5 4.5L19 7.5',
  film: 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4',
  music: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0m10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3M5 11a7 7 0 0 0 14 0M12 18v3',
  sparkle: 'M12 3v6m0 6v6m-6-9H3m18 0h-3M7 7l1.5 1.5M17 17l-1.5-1.5M7 17l1.5-1.5M17 7l-1.5 1.5',
};

let injected = false;

export function installIconSprite() {
  if (injected) return;
  injected = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'none';
  svg.innerHTML = Object.entries(PATHS)
    .map(
      ([name, d]) =>
        `<symbol id="i-${name}" viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>`,
    )
    .join('');
  document.body.prepend(svg);
}

export function icon(name, className = 'size-5') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

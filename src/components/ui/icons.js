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

/**
 * Shell persistente: se monta una sola vez y nunca se vuelve a construir.
 * Las vistas se intercambian dentro del outlet; la navbar no se re-renderiza.
 */
import { el } from '../../core/dom.js';
import { Navbar } from './Navbar.js';

export function mountShell(root) {
  const outlet = el('main', { id: 'outlet', class: 'flex-1' });
  const navbar = Navbar();
  root.replaceChildren(navbar.node, outlet);
  return { outlet, navbar };
}

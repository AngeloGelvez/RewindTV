/**
 * Shell persistente: se monta UNA vez y nunca se reconstruye. Las vistas se
 * intercambian dentro del outlet, asi que navegar no toca la navegacion.
 */
import { el } from '../../core/dom.js';
import { Rail, Topbar } from './Navbar.js';
import { installIconSprite } from '../ui/icons.js';
import { navigate } from '../../core/router.js';

export function mountShell(root) {
  installIconSprite();

  const rail = Rail();
  const topbar = Topbar({
    onSearch: (term) => navigate(`/buscar?q=${encodeURIComponent(term)}`),
  });

  const outlet = el('main', { id: 'outlet', class: 'flex-1 pb-20 md:pb-10' });

  root.className = 'min-h-dvh bg-surface-0 text-ink-0';
  root.replaceChildren(
    rail.node,
    el('div', { class: 'md:pl-16' }, [topbar.node, outlet]),
  );

  return { outlet, rail, topbar };
}

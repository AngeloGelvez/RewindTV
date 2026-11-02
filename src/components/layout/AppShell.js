/**
 * Shell persistente: se monta UNA vez y nunca se reconstruye. Las vistas se
 * intercambian dentro del outlet, asi que navegar no toca la navegacion.
 *
 * Piezas de accesibilidad que viven aqui porque no cambian entre rutas:
 *   - enlace "Saltar al contenido", primera parada del Tab
 *   - <main tabindex="-1">, destino del foco tras cada navegacion
 *   - region aria-live donde core/a11y.js anuncia la pagina nueva
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

  const outlet = el('main', {
    id: 'outlet',
    tabindex: '-1',
    // El hueco de abajo es el alto de la barra movil: sin el, la ultima fila
    // queda debajo de ella y no se puede pulsar.
    class: 'mx-auto w-full max-w-[1600px] flex-1 pb-28 outline-none lg:pb-14',
  });

  const saltar = el(
    'a',
    {
      href: '#outlet',
      // Es para Tab. Con flechas no hace falta: van directas al contenido.
      'data-nav-skip': '',
      // El relleno solo con foco: sobre .sr-only lo agrandaria a 40x24 px.
      class:
        'sr-only z-[60] rounded-pill bg-[var(--fest)] text-sm font-semibold text-[var(--fest-ink)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:px-5 focus:py-3',
      onClick: (event) => {
        event.preventDefault();
        outlet.focus();
      },
    },
    'Saltar al contenido',
  );

  const announcer = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });

  // Sin fondo propio: el aura de la festividad (body::before) se ve detras.
  root.className = 'min-h-dvh text-ink-0';
  root.replaceChildren(
    saltar,
    rail.node,
    el('div', { 'data-content': '' }, [topbar.node, outlet]),
    announcer,
  );

  return { outlet, rail, topbar, announcer };
}

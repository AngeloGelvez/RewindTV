/**
 * Bootstrap. Orden pensado para el primer pintado:
 *  1. Monta el shell (navbar + outlet) -> el usuario ya ve estructura.
 *  2. Arranca el router, que descarga SOLO el chunk de la vista actual.
 *  3. En idle: precarga el catalogo y los chunks de las rutas probables.
 */
import './styles/main.css';
import { mountShell } from './components/layout/AppShell.js';
import { startRouter, prefetch } from './core/router.js';
import { bootstrap, activeFestivity } from './data/repository.js';
import { applyFestivityTheme } from './components/media/Hero.js';
import { idle } from './core/scheduler.js';

const root = document.getElementById('app');
document.getElementById('app-skeleton')?.remove();

const { outlet } = mountShell(root);

// El catalogo se pide en paralelo al chunk de la vista, no en serie.
// El tema de la festividad se aplica en cuanto hay datos, no solo en la
// portada: la ficha y el reproductor tambien quedan tenidos.
const catalogReady = bootstrap().then((r) => {
  applyFestivityTheme(activeFestivity());
  return r;
});

startRouter(outlet).then(() => {
  idle(() => {
    prefetch('/explorar');
    prefetch('/en-vivo');
  });
});

if (import.meta.env.DEV) {
  catalogReady.then(async () => {
    const { Genre, Decade, Network } = await import('./data/models/taxonomy.js');
    const { Festivity } = await import('./data/models/festivity.js');
    const { activeFestivity, upcomingFestivity } = await import('./data/repository.js');
    console.table([Genre.stats(), Decade.stats(), Network.stats(), Festivity.stats()]);
    const hoy = activeFestivity();
    console.log('Festividad de hoy:', hoy ? hoy.label : '(ninguna)', '| proxima:', upcomingFestivity()?.festivity.label);
  });
}

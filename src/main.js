/**
 * Bootstrap. Orden pensado para el primer pintado:
 *  1. Monta el shell (navbar + outlet) -> el usuario ya ve estructura.
 *  2. Arranca el router, que descarga SOLO el chunk de la vista actual.
 *  3. En idle: precarga el catalogo y los chunks de las rutas probables.
 */
import './styles/main.css';
import { mountShell } from './components/layout/AppShell.js';
import { startRouter, prefetch } from './core/router.js';
import { bootstrap } from './data/repository.js';
import { idle } from './core/scheduler.js';

const root = document.getElementById('app');
document.getElementById('app-skeleton')?.remove();

const { outlet } = mountShell(root);

// El catalogo se pide en paralelo al chunk de la vista, no en serie.
const catalogReady = bootstrap();

startRouter(outlet).then(() => {
  idle(() => {
    prefetch('/explorar');
    prefetch('/en-vivo');
  });
});

if (import.meta.env.DEV) {
  catalogReady.then(async () => {
    const { Genre, Decade, Network } = await import('./data/models/taxonomy.js');
    console.table([Genre.stats(), Decade.stats(), Network.stats()]);
  });
}

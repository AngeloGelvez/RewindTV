/**
 * Flyweights de taxonomia. Todo lo que se repite entre titulos vive aqui:
 * generos, decadas y cadenas se comparten por referencia entre miles de items.
 *
 * El Network ademas lleva su color de badge. En el sitio de referencia eso es
 * una clase CSS por cadena (.marcador-cartoon, .marcador-nick...), lo que obliga
 * a tocar el CSS cada vez que entra una cadena nueva. Aqui es un dato.
 */
import { createFlyweightFactory, intern } from '../../patterns/flyweight.js';

export const Genre = createFlyweightFactory(
  'Genre',
  (slug) => ({
    slug: intern(slug),
    label: intern(slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())),
  }),
  (slug) => slug,
);

export const Decade = createFlyweightFactory(
  'Decade',
  (year) => {
    const start = Math.floor(year / 10) * 10;
    return { start, label: `${start}s`, slug: `${start}s` };
  },
  (year) => String(Math.floor(year / 10) * 10),
);

const NETWORK_COLORS = {
  'cartoon-network': '#4a9fd5',
  nickelodeon: '#f57c1f',
  'disney-channel': '#1b55a3',
  'fox-kids': '#d81f26',
  'hanna-barbera': '#7c5cff',
  'warner-channel': '#0d47a1',
  marvel: '#ec1d24',
  otros: '#6e6e80',
};

/**
 * Logos de cadena, servidos desde `public/img/cadenas/`.
 *
 * Son SVG (unos 80 KB entre los siete): el mismo fichero vale para los 24 px
 * de una pestaña y los 36 de una tarjeta, sin versiones por tamano.
 *
 * Los baja `scripts/fetch-logos.mjs`, que es tambien el registro de de donde
 * salio cada uno. No se enlazan a Wikipedia en caliente: si el fichero se
 * renombra o se borra alli, desapareceria de la interfaz sin avisar.
 *
 * Una cadena sin logo no es un problema: los componentes dejan las iniciales
 * debajo, asi que "Otros" —que no es una cadena, es el cajon de sastre— sale
 * con su letra y nada se ve roto.
 */
const NETWORK_LOGOS = {
  'cartoon-network': '/img/cadenas/cartoon-network.svg',
  nickelodeon: '/img/cadenas/nickelodeon.svg',
  'fox-kids': '/img/cadenas/fox-kids.svg',
  'hanna-barbera': '/img/cadenas/hanna-barbera.svg',
  'disney-channel': '/img/cadenas/disney-channel.svg',
  marvel: '/img/cadenas/marvel.svg',
  'warner-channel': '/img/cadenas/warner-channel.svg',
};

export const Network = createFlyweightFactory(
  'Network',
  (name) => {
    const slug = intern(name.toLowerCase().replace(/\s+/g, '-'));
    return {
      name: intern(name),
      slug,
      color: NETWORK_COLORS[slug] ?? NETWORK_COLORS.otros,
      logo: NETWORK_LOGOS[slug] ?? null,
    };
  },
  (name) => name,
);

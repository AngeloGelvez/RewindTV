/**
 * Flyweights de taxonomia. Todo lo que se repite entre titulos vive aqui:
 * generos, decadas y cadenas se comparten por referencia entre miles de items.
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

export const Network = createFlyweightFactory(
  'Network',
  (name) => ({ name: intern(name), slug: intern(name.toLowerCase().replace(/\s+/g, '-')) }),
  (name) => name,
);

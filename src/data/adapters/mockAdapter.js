/**
 * Adaptador mock: lee los JSON de /data. Para pasar a una API real solo hay que
 * escribir otro adaptador con la misma firma `loadAll()` y cambiar el import
 * en repository.js. Las vistas no se enteran.
 */
import { createTitle } from '../models/title.js';
import { createChannel } from '../models/channel.js';
import { createProgram } from '../models/program.js';
import * as cache from '../cache.js';

const CACHE_KEY = 'catalog:v1';

async function fetchJson(path) {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`[mockAdapter] ${path} -> ${res.status}`);
  return res.json();
}

export const adapter = {
  async loadAll() {
    const cached = await cache.get(CACHE_KEY);
    const raw = cached ?? (await loadFromNetwork());
    if (!cached) cache.set(CACHE_KEY, raw);

    const titles = raw.titles.map(createTitle);
    const titleIndex = new Map(titles.map((t) => [t.id, t]));
    return {
      titles,
      channels: raw.channels.map(createChannel),
      programs: raw.programs.map((p) => createProgram(p, titleIndex)),
    };
  },
};

async function loadFromNetwork() {
  const [titles, channels, programs] = await Promise.all([
    fetchJson('/data/titles.json'),
    fetchJson('/data/channels.json'),
    fetchJson('/data/schedule.json'),
  ]);
  return { titles, channels, programs };
}

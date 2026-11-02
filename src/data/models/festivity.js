/**
 * FESTIVIDADES
 * ============
 * Cada episodio puede pertenecer a una o varias festividades ("halloween",
 * "navidad", "dia-de-muertos"...). Al abrir la web se resuelve que festividad
 * cae hoy y la portada arranca con esa seleccion.
 *
 * Las festividades son FLYWEIGHTS: hay ~15 en total y miles de episodios las
 * referencian. Se crean una vez y se comparten por referencia.
 *
 * Una festividad no es una fecha, es una REGLA. Hay cuatro tipos:
 *
 *   fixed-range   { from: "10-01", to: "10-31" }      Halloween, Navidad
 *   fixed-day     { month: 2, day: 14, window: 3 }    San Valentin
 *   nth-weekday   { month: 11, weekday: 4, nth: 4 }   Accion de Gracias
 *   easter-offset { offset: -47 }                     Carnaval, Pascua
 *
 * Asi el dataset no caduca: no hay fechas con año escritas a mano que haya que
 * actualizar cada enero.
 */
import { createFlyweightFactory, intern } from '../../patterns/flyweight.js';

export const Festivity = createFlyweightFactory(
  'Festivity',
  (def) => ({
    slug: intern(def.slug),
    label: def.label,
    emoji: def.emoji ?? '',
    color: def.color ?? '#6e6e80',
    accent2: def.accent2 ?? null,
    priority: def.priority ?? 0,
    rule: def.rule,
    tagline: def.tagline ?? '',
    // Saludo del dia. Viene del dato porque "Feliz X" no sirve para todas:
    // nadie dice "Feliz Regreso a Clases".
    greeting: def.greeting ?? `¡Feliz ${def.label}!`,
  }),
  (def) => def.slug,
);

/**
 * TODO EL CALCULO VA EN HORA LOCAL, no en UTC.
 *
 * Antes iba en UTC y eso producia un fallo real: a las 23:30 del 31 de octubre
 * en GMT-5 ya era 1 de noviembre en UTC, asi que la portada dejaba de celebrar
 * Halloween y pasaba a Dia de Muertos mientras la gente seguia disfrazada. Una
 * festividad es una fecha del calendario de quien mira, no un instante
 * universal: el 25 de diciembre empieza cuando dan las doce en tu reloj.
 */

/**
 * Computus gregoriano (algoritmo anonimo). Devuelve el Domingo de Pascua del
 * año dado. De ahi salen Carnaval (-47), Miercoles de Ceniza (-46) y Pascua (0).
 */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Fecha del n-esimo <weekday> de un mes (weekday: 0=domingo). */
function nthWeekday(year, month, weekday, nth) {
  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + offset + (nth - 1) * 7);
}

const DAY = 86_400_000;

/** Medianoche local del dia de `date`, en milisegundos. */
const medianoche = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Medianoche local de un dia concreto. Sustituye a Date.UTC. */
const dia = (year, month, day) => new Date(year, month, day).getTime();

/**
 * Resuelve la regla de una festividad a un intervalo [inicio, fin] del año dado.
 * El resultado se cachea por `slug:year`: se calcula una vez por sesion.
 */
const resolved = new Map();

export function resolveWindow(festivity, year) {
  const key = `${festivity.slug}:${year}`;
  const hit = resolved.get(key);
  if (hit) return hit;

  const { rule } = festivity;
  let start;
  let end;

  switch (rule.type) {
    case 'fixed-range': {
      const [fm, fd] = rule.from.split('-').map(Number);
      const [tm, td] = rule.to.split('-').map(Number);
      start = dia(year, fm - 1, fd);
      end = dia(year, tm - 1, td) + DAY - 1;
      // Rangos que cruzan el fin de año (ej. 12-20 -> 01-06).
      if (end < start) end = dia(year + 1, tm - 1, td) + DAY - 1;
      break;
    }
    case 'fixed-day': {
      const window = rule.window ?? 0;
      const day = dia(year, rule.month - 1, rule.day);
      start = day - window * DAY;
      end = day + DAY - 1;
      break;
    }
    case 'nth-weekday': {
      const day = medianoche(nthWeekday(year, rule.month, rule.weekday, rule.nth));
      start = day - (rule.window ?? 0) * DAY;
      end = day + DAY - 1;
      break;
    }
    case 'easter-offset': {
      const day = medianoche(easterSunday(year)) + (rule.offset ?? 0) * DAY;
      start = day - (rule.window ?? 0) * DAY;
      end = day + DAY - 1 + (rule.span ?? 0) * DAY;
      break;
    }
    default:
      throw new Error(`[festivity] regla desconocida: ${rule.type}`);
  }

  const value = { start, end };
  resolved.set(key, value);
  return value;
}

/**
 * El DIA señalado, que no es lo mismo que la temporada.
 *
 * Navidad ocupa del 1 al 26 de diciembre —ahi es cuando apetece ver especiales
 * navideños— pero el dia es el 25. Esa diferencia es la que separa "faltan 5
 * dias para Navidad" de "¡Feliz Navidad!".
 *
 * Las reglas de dia (fixed-day, nth-weekday, easter-offset) ya nombran un dia;
 * las de rango lo declaran con `peak`. Una temporada sin dia señalado —el
 * verano, el regreso a clases— devuelve null, y entonces no hay cuenta atras
 * ni saludo: no se felicita el verano.
 */
export function peakDay(festivity, year) {
  const { rule } = festivity;
  switch (rule.type) {
    case 'fixed-day':
      return dia(year, rule.month - 1, rule.day);
    case 'nth-weekday':
      return medianoche(nthWeekday(year, rule.month, rule.weekday, rule.nth));
    case 'easter-offset':
      return medianoche(easterSunday(year)) + (rule.offset ?? 0) * DAY;
    case 'fixed-range': {
      if (!rule.peak) return null;
      const [pm, pd] = rule.peak.split('-').map(Number);
      let pico = dia(year, pm - 1, pd);
      // Año Nuevo: la temporada abre el 27 de diciembre y el dia cae ya en
      // enero del año siguiente.
      if (pico < resolveWindow(festivity, year).start) pico = dia(year + 1, pm - 1, pd);
      return pico;
    }
    default:
      return null;
  }
}

/** Dias hasta el dia señalado: 0 es hoy, null si la festividad no tiene uno. */
export function daysToPeak(festivity, date = new Date()) {
  const now = medianoche(date);
  const year = date.getFullYear();
  let best = null;
  for (const y of [year - 1, year, year + 1]) {
    const pico = peakDay(festivity, y);
    if (pico == null || pico < now) continue;
    const dias = Math.round((pico - now) / DAY);
    if (best === null || dias < best) best = dias;
  }
  return best;
}

export function isActive(festivity, date = new Date()) {
  const now = medianoche(date);
  const year = date.getFullYear();
  // Se prueba tambien el año anterior por los rangos que cruzan enero.
  for (const y of [year, year - 1]) {
    const { start, end } = resolveWindow(festivity, y);
    if (now >= start && now <= end) return true;
  }
  return false;
}

/** Dias que faltan para que empiece (0 si ya esta activa). */
export function daysUntil(festivity, date = new Date()) {
  if (isActive(festivity, date)) return 0;
  const now = medianoche(date);
  const year = date.getFullYear();
  let best = Infinity;
  for (const y of [year, year + 1]) {
    const { start } = resolveWindow(festivity, y);
    if (start >= now) best = Math.min(best, Math.round((start - now) / DAY));
  }
  return best;
}

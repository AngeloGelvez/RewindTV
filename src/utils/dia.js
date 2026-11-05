/**
 * Baraja una lista con la fecha de hoy como semilla: el mismo orden para todos
 * durante el dia, y otro distinto al dia siguiente. Usa la fecha local, igual
 * que las festividades.
 */
export function sorteoDelDia(lista, fecha = new Date()) {
  let semilla = fecha.getFullYear() * 372 + fecha.getMonth() * 31 + fecha.getDate();
  const azar = () => (semilla = (semilla * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

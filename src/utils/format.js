const runtimeFormatter = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });

export function runtime(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${runtimeFormatter.format(m)}m`;
}

const timeFormatter = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
export const clock = (ms) => timeFormatter.format(ms);

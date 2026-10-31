/**
 * Programa de la guia (EPG). La grilla puede tener miles de bloques, asi que
 * el objeto se mantiene plano y apunta al Title/Channel ya existente.
 */
export function createProgram(raw, titleIndex) {
  const startsAt = Date.parse(raw.startsAt);
  return {
    id: raw.id,
    channelId: raw.channelId,
    title: titleIndex.get(raw.titleId) ?? null,
    name: raw.name,
    startsAt,
    endsAt: startsAt + raw.durationMin * 60_000,
    durationMin: raw.durationMin,
  };
}

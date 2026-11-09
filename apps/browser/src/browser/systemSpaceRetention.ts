export const DAY_MS = 24 * 60 * 60 * 1000;
export function retentionCutoff(days: number, now = Date.now()) {
  return Number.isInteger(days) && days > 0 ? now - days * DAY_MS : undefined;
}
export function expiredRecord(timestamp: unknown, cutoff: number | undefined) {
  return (
    cutoff !== undefined &&
    typeof timestamp === 'number' &&
    Number.isFinite(timestamp) &&
    timestamp < cutoff
  );
}

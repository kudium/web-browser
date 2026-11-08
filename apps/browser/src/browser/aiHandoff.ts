export function aiHandoffReason(reason: unknown) {
  if (
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.trim().length > 300
  )
    throw new Error('Explain the required human action in 1–300 characters.');
  return reason.trim();
}

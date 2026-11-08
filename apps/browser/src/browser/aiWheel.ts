export function aiWheel(args: Record<string, unknown>) {
  const deltaX = args.deltaX ?? 0;
  const deltaY = args.deltaY ?? 0;
  if (
    typeof deltaX !== 'number' ||
    typeof deltaY !== 'number' ||
    !Number.isFinite(deltaX) ||
    !Number.isFinite(deltaY) ||
    Math.abs(deltaX) > 2000 ||
    Math.abs(deltaY) > 2000 ||
    (!deltaX && !deltaY)
  )
    throw new Error(
      'Wheel requires a nonzero deltaX or deltaY, each between -2000 and 2000.'
    );
  return { deltaX, deltaY };
}

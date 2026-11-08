export interface AIPoint {
  x: number;
  y: number;
}

/** A complete path, or the original two-endpoint drag format. */
export function aiDrawingPath(args: Record<string, unknown>): AIPoint[] {
  if (args.path === undefined) {
    const points = [
      { x: args.x, y: args.y },
      { x: args.toX, y: args.toY },
    ];
    if (
      points.some(
        (point) =>
          typeof point.x !== 'number' ||
          typeof point.y !== 'number' ||
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          point.x < 0 ||
          point.y < 0
      )
    )
      throw new Error(
        'drag_at requires nonnegative finite x/y and toX/toY coordinates.'
      );
    return points as AIPoint[];
  }
  if (['x', 'y', 'toX', 'toY'].some((field) => args[field] !== undefined))
    throw new Error('Use path or endpoint coordinates, not both.');
  if (
    !Array.isArray(args.path) ||
    args.path.length < 2 ||
    args.path.length > 128
  )
    throw new Error('Drawing path must contain 2–128 points.');
  return args.path.map((point) => {
    if (
      !point ||
      typeof point !== 'object' ||
      Array.isArray(point) ||
      Object.keys(point).some((key) => key !== 'x' && key !== 'y') ||
      typeof point.x !== 'number' ||
      typeof point.y !== 'number' ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.y < 0
    )
      throw new Error(
        'Each drawing point requires only nonnegative finite x/y coordinates.'
      );
    return { x: point.x, y: point.y };
  });
}

/** Include every vertex; bound protocol input to at most 1024 movements. */
export function interpolateAIPath(path: AIPoint[]): AIPoint[] {
  const segmentLimit = Math.min(12, Math.floor(1024 / (path.length - 1)));
  return path.slice(1).flatMap((end, index) => {
    const start = path[index];
    // Explicitly sampled paths already describe their curvature. Avoid eight
    // redundant dispatches for a sub-pixel segment, while retaining the legacy
    // twelve-step interpolation for a two-endpoint drag.
    const steps =
      path.length === 2
        ? 12
        : Math.min(
            segmentLimit,
            Math.max(
              1,
              Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 12)
            )
          );
    return Array.from({ length: steps }, (_, step) => {
      if (step === steps - 1) return { ...end };
      const fraction = (step + 1) / steps;
      return {
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
      };
    });
  });
}

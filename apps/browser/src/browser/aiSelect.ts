export function aiSelectValues(values: unknown): string[] {
  if (
    !Array.isArray(values) ||
    values.length > 100 ||
    values.some((value) => typeof value !== 'string' || value.length > 1000)
  )
    throw new Error(
      'values must contain 0–100 option values, each at most 1000 characters.'
    );
  if (new Set(values).size !== values.length)
    throw new Error('Option values must be unique.');
  return values;
}

export function aiOptionRange(args: Record<string, unknown>) {
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 100;
  if (
    !Number.isInteger(offset) ||
    Number(offset) < 0 ||
    Number(offset) > 50000 ||
    !Number.isInteger(limit) ||
    Number(limit) < 1 ||
    Number(limit) > 200
  )
    throw new Error('Option offset must be 0–50000 and limit 1–200.');
  return { offset: Number(offset), limit: Number(limit) };
}

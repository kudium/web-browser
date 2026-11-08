import { aiURL } from './ai';

export function aiWaitCondition(args: Record<string, unknown>) {
  const timeoutMs = args.timeoutMs ?? 5000;
  if (
    !Number.isInteger(timeoutMs) ||
    Number(timeoutMs) < 100 ||
    Number(timeoutMs) > 30000
  )
    throw new Error('timeoutMs must be between 100 and 30000.');
  if ((args.url === undefined) === (args.label === undefined))
    throw new Error('Supply exactly one of url or label.');
  if (args.url !== undefined)
    return { url: aiURL(args.url), timeoutMs: Number(timeoutMs) };
  if (
    typeof args.label !== 'string' ||
    !args.label.trim() ||
    args.label.length > 180
  )
    throw new Error(
      'A nonempty element label of at most 180 characters is required.'
    );
  return { label: args.label, timeoutMs: Number(timeoutMs) };
}

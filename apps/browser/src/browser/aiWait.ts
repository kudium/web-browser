import { aiURL } from './ai';

export interface AIWaitConditionResult {
  timeoutMs: number;
  url?: string;
  label?: string;
  selector?: string;
  text?: string;
  fn?: string;
  state: 'visible' | 'hidden';
  loadState?: 'load' | 'domcontentloaded' | 'networkidle';
  /** A request URL substring or /pattern/ that must have started since the wait began. */
  request?: string;
}

/**
 * Composable wait: every supplied condition must hold at the same moment.
 * url, label and selector match exactly; text is a page-text substring; fn is
 * a JavaScript expression evaluated in the isolated world; loadState chooses
 * the document readiness the other checks wait behind.
 */
export function aiWaitCondition(
  args: Record<string, unknown>
): AIWaitConditionResult {
  const timeoutMs = args.timeoutMs ?? 5000;
  if (
    !Number.isInteger(timeoutMs) ||
    Number(timeoutMs) < 100 ||
    Number(timeoutMs) > 30000
  )
    throw new Error('timeoutMs must be between 100 and 30000.');
  const result: AIWaitConditionResult = {
    timeoutMs: Number(timeoutMs),
    state: 'visible',
  };
  if (args.url !== undefined) result.url = aiURL(args.url);
  if (args.label !== undefined) {
    if (
      typeof args.label !== 'string' ||
      !args.label.trim() ||
      args.label.length > 180
    )
      throw new Error(
        'A nonempty element label of at most 180 characters is required.'
      );
    result.label = args.label;
  }
  if (args.selector !== undefined) {
    if (
      typeof args.selector !== 'string' ||
      !args.selector.trim() ||
      args.selector.length > 1000
    )
      throw new Error('selector must be 1–1000 characters.');
    result.selector = args.selector;
  }
  if (args.text !== undefined) {
    if (typeof args.text !== 'string' || !args.text.trim() || args.text.length > 1000)
      throw new Error('text must be 1–1000 characters.');
    result.text = args.text;
  }
  if (args.fn !== undefined) {
    if (typeof args.fn !== 'string' || !args.fn.trim() || args.fn.length > 2000)
      throw new Error('fn must be a JavaScript expression of at most 2000 characters.');
    result.fn = args.fn;
  }
  if (args.state !== undefined) {
    if (args.state !== 'visible' && args.state !== 'hidden')
      throw new Error('state must be visible or hidden.');
    if (result.selector === undefined)
      throw new Error('state applies to selector waits.');
    result.state = args.state;
  }
  if (args.loadState !== undefined) {
    if (!['load', 'domcontentloaded', 'networkidle'].includes(String(args.loadState)))
      throw new Error('loadState must be load, domcontentloaded or networkidle.');
    result.loadState = args.loadState as AIWaitConditionResult['loadState'];
  }
  if (args.request !== undefined) {
    if (typeof args.request !== 'string' || !args.request.trim() || args.request.length > 500)
      throw new Error('request must be a URL substring or /pattern/ of at most 500 characters.');
    const pattern = args.request.match(/^\/(.+)\/([a-z]*)$/s);
    if (pattern) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(pattern[1], pattern[2].replace(/[^gimsuy]/g, ''));
      } catch (error) {
        throw new Error(`request is not a valid regular expression: ${(error as Error).message}`);
      }
    }
    result.request = args.request;
  }
  if (
    result.url === undefined &&
    result.label === undefined &&
    result.selector === undefined &&
    result.text === undefined &&
    result.fn === undefined &&
    result.loadState === undefined &&
    result.request === undefined
  )
    throw new Error('Supply at least one of url, label, selector, text, fn, loadState or request.');
  return result;
}

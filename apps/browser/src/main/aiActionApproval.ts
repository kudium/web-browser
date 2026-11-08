import type { WebContents } from 'electron';

/** Hold document/owner identity across a review and up to effect dispatch. */
export async function withAIActionBinding<T>(
  sources: WebContents[],
  current: () => boolean,
  signal: AbortSignal,
  operation: (
    check: () => void,
    retainUntil: (completion: Promise<unknown>) => void
  ) => Promise<T>
): Promise<T> {
  const unique = [...new Set(sources)];
  const urls = unique.map((contents) => contents.getURL());
  let replaced = false;
  const navigation = (
    _event: unknown,
    _url: string,
    inPlace: boolean,
    mainFrame: boolean
  ) => {
    if (mainFrame && !inPlace) replaced = true;
  };
  const invalid = () => {
    replaced = true;
  };
  unique.forEach((contents) => {
    contents.on('did-start-navigation', navigation);
    contents.on('destroyed', invalid);
    contents.on('render-process-gone', invalid);
  });
  const check = () => {
    signal.throwIfAborted();
    if (
      replaced ||
      !current() ||
      unique.some(
        (contents, index) =>
          contents.isDestroyed() || contents.getURL() !== urls[index]
      )
    )
      throw new Error(
        'Page, group or permissions changed during approval. Read the page and request the action again.'
      );
  };
  const retained: Promise<unknown>[] = [];
  const cleanup = () => {
    unique.forEach((contents) => {
      contents.removeListener('did-start-navigation', navigation);
      contents.removeListener('destroyed', invalid);
      contents.removeListener('render-process-gone', invalid);
    });
  };
  try {
    check();
    // The operation explicitly checks immediately before dispatch. Do not
    // check afterward: its authorized effect may itself navigate the page.
    return await operation(check, (completion) => {
      retained.push(completion);
    });
  } finally {
    // A pending website dialog returns a receipt before the native action ends.
    // Keep its original document binding until that bounded action settles.
    if (retained.length)
      Promise.allSettled(retained).then(cleanup).catch(cleanup);
    else cleanup();
  }
}

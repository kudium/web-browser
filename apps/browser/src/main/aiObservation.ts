import type { WebContents } from 'electron';

export const AI_OBSERVATION_TIMEOUT = 15000;

/** Bound read-only page programs without stopping a human-owned navigation. */
export function observeAIPage<T>(
  contents: WebContents,
  signal: AbortSignal,
  read: (executionSignal: AbortSignal) => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const execution = new AbortController();
    let finished = false;
    let timer: ReturnType<typeof setTimeout>;
    let abort: () => void;
    let destroyed: () => void;
    let crashed: () => void;
    let navigating: (
      _event: unknown,
      _url: string,
      _inPlace: boolean,
      mainFrame: boolean
    ) => void;
    const initialURL = contents.getURL();
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      contents.removeListener('destroyed', destroyed);
      contents.removeListener('render-process-gone', crashed);
      contents.removeListener('did-start-navigation', navigating);
    };
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      execution.abort();
      reject(error);
    };
    abort = () => fail(new Error('Stopped. Page observation cancelled.'));
    destroyed = () => fail(new Error('Tab closed during observation.'));
    crashed = () =>
      fail(
        new Error(
          'Page renderer exited during observation. Reload the tab before continuing.'
        )
      );
    navigating = (
      _event: unknown,
      _url: string,
      _inPlace: boolean,
      mainFrame: boolean
    ) => {
      if (mainFrame)
        fail(
          new Error(
            'Page changed during observation. Read the current page again.'
          )
        );
    };
    timer = setTimeout(
      () =>
        fail(
          new Error(
            'Page observation timed out. Read the page again before acting.'
          )
        ),
      AI_OBSERVATION_TIMEOUT
    );
    signal.addEventListener('abort', abort, { once: true });
    contents.once('destroyed', destroyed);
    contents.once('render-process-gone', crashed);
    contents.on('did-start-navigation', navigating);
    if (signal.aborted) {
      abort();
      return;
    }
    if (contents.isDestroyed()) {
      destroyed();
      return;
    }
    // Deferring dispatch also prevents already-cancelled reads from running.
    Promise.resolve()
      .then(() => (finished ? undefined : read(execution.signal)))
      .then((value) => {
        if (finished) return undefined;
        if (contents.getURL() !== initialURL) {
          fail(
            new Error(
              'Page changed during observation. Read the current page again.'
            )
          );
          return undefined;
        }
        finished = true;
        cleanup();
        resolve(value as T);
        return undefined;
      })
      .catch((error) => fail(error));
  });
}

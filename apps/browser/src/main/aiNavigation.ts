import type { WebContents } from 'electron';
import type { AIDialogLifecycle } from './aiDialogs';
import { addRequestRule, RequestRule } from './requestRules';

export interface AINavigationReview {
  (
    request: { url: string; method: string; hasBody: boolean },
    signal: AbortSignal
  ): Promise<void>;
  check?(): void;
  dispose?(): void;
}

const networkURL = (value: string) => {
  const parsed = new URL(value);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw new Error(
      'Navigation destination must be an HTTP(S) URL without credentials.'
    );
  parsed.hash = '';
  return parsed.href;
};

export const AI_NAVIGATION_TIMEOUT = 30000;

export function navigateAIPage(
  contents: WebContents,
  url: string,
  signal: AbortSignal,
  start?: () => void,
  dialogs?: AIDialogLifecycle,
  review?: AINavigationReview
): Promise<{ url: string; title: string }> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let started = false;
    let owned = true;
    let timer: ReturnType<typeof setTimeout>;
    let unsubscribe: (() => void) | undefined;
    let removeRule: (() => void) | undefined;
    const reviewControl = new AbortController();
    let remaining = AI_NAVIGATION_TIMEOUT;
    let armedAt = 0;
    let paused = false;
    let websitePending = false;
    let localReviews = 0;
    let reviewTimer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void;
    let destroyed: () => void;
    let crashed: () => void;
    let navigating: (
      _event: unknown,
      destination: string,
      inPlace: boolean,
      mainFrame: boolean
    ) => void;
    let complete: () => void;
    let loadFailed: (
      _event: unknown,
      code: number,
      description: string,
      failedURL: string,
      mainFrame: boolean
    ) => void;
    let inPage: (
      _event: unknown,
      destination: string,
      mainFrame: boolean
    ) => void;
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(reviewTimer);
      unsubscribe?.();
      reviewControl.abort();
      removeRule?.();
      review?.dispose?.();
      signal.removeEventListener('abort', abort);
      contents.removeListener('destroyed', destroyed);
      contents.removeListener('render-process-gone', crashed);
      contents.removeListener('did-start-navigation', navigating);
      contents.removeListener('did-finish-load', complete);
      contents.removeListener('did-fail-load', loadFailed);
      contents.removeListener('did-navigate-in-page', inPage);
    };
    const fail = (error: Error, stop = false) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (stop && owned && !contents.isDestroyed()) contents.stop();
      reject(error);
    };
    abort = () => fail(new Error('Stopped. Navigation cancelled.'), true);
    destroyed = () => fail(new Error('Tab closed during navigation.'));
    crashed = () =>
      fail(
        new Error(
          'Page renderer exited during navigation. Reload the tab before continuing.'
        )
      );
    complete = () => {
      if (finished || (start && !started)) return;
      finished = true;
      cleanup();
      resolve({ url: contents.getURL(), title: contents.getTitle() });
    };
    loadFailed = (_event, code, description, _failedURL, mainFrame) => {
      if (mainFrame && started)
        fail(new Error(`Navigation failed (${code}): ${description}`));
    };
    inPage = (_event, destination, mainFrame) => {
      if (mainFrame && start && started) {
        started = true;
        complete();
      }
    };
    navigating = (
      _event: unknown,
      destination: string,
      inPlace: boolean,
      mainFrame: boolean
    ) => {
      if (!mainFrame) return;
      if (inPlace && !start) return;
      if (!started && (start || destination === url)) {
        started = true;
        return;
      }
      owned = false;
      fail(new Error('Navigation was replaced. Read the current page again.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    contents.once('destroyed', destroyed);
    contents.once('render-process-gone', crashed);
    contents.on('did-start-navigation', navigating);
    if (start) {
      contents.on('did-finish-load', complete);
      contents.on('did-fail-load', loadFailed);
      contents.on('did-navigate-in-page', inPage);
    }
    const arm = () => {
      armedAt = Date.now();
      timer = setTimeout(
        () =>
          fail(
            new Error('Navigation timed out. Read the page before retrying.'),
            true
          ),
        remaining
      );
    };
    arm();
    const pause = (pending: boolean) => {
      if (finished || pending === paused) return;
      paused = pending;
      if (pending) {
        remaining = Math.max(0, remaining - (Date.now() - armedAt));
        clearTimeout(timer);
      } else arm();
    };
    unsubscribe = dialogs?.onChange((pending) => {
      websitePending = pending;
      pause(pending || localReviews > 0);
    });
    if (signal.aborted) {
      abort();
      return;
    }
    if (contents.isDestroyed()) {
      destroyed();
      return;
    }
    try {
      if (review) {
        const approved = networkURL(url);
        let firstRequest = true;
        let requestCount = 0;
        const rule: RequestRule = (details) => {
          if (
            details.webContentsId !== contents.id ||
            details.resourceType !== 'mainFrame'
          )
            return false;
          if (finished || reviewControl.signal.aborted) return true;
          review.check?.();
          requestCount += 1;
          if (requestCount > 16) {
            fail(
              new Error('Navigation exceeded the 16-request review limit.'),
              true
            );
            return true;
          }
          const destination = networkURL(details.url);
          if (firstRequest && destination === approved) {
            firstRequest = false;
            return false;
          }
          firstRequest = false;
          const release = dialogs?.beginReview?.();
          // Without an outer dialog lease, pause only this navigation deadline.
          const localPause = !release;
          if (localPause) {
            localReviews += 1;
            pause(true);
            if (localReviews === 1)
              reviewTimer = setTimeout(
                () =>
                  fail(
                    new Error('Navigation destination review timed out.'),
                    true
                  ),
                120000
              );
          }
          return Promise.resolve()
            .then(() =>
              review(
                {
                  url: destination,
                  method: details.method,
                  hasBody: !!details.uploadData?.length,
                },
                reviewControl.signal
              )
            )
            .then(() => {
              review.check?.();
              return finished || reviewControl.signal.aborted;
            })
            .catch((error) => {
              fail(
                error instanceof Error ? error : new Error(String(error)),
                true
              );
              return true;
            })
            .finally(() => {
              release?.();
              if (localPause) {
                localReviews -= 1;
                if (!localReviews) clearTimeout(reviewTimer);
                pause(websitePending || localReviews > 0);
              }
            });
        };
        rule.check = (details) => {
          if (
            details.webContentsId === contents.id &&
            details.resourceType === 'mainFrame'
          ) {
            if (reviewControl.signal.aborted) throw new Error('Stopped.');
            review.check?.();
          }
        };
        removeRule = addRequestRule(contents.session, rule);
      }
      if (start) {
        start();
        return;
      }
      contents
        .loadURL(url)
        .then(() => {
          if (finished) return undefined;
          complete();
          return undefined;
        })
        .catch((error) => fail(error));
    } catch (error) {
      fail(error as Error);
    }
  });
}

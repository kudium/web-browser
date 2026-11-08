import type { WebContents } from 'electron';

/** Reserve the initial load until the AI owns its navigation lifecycle. */
export class AINewTabs {
  private pending = new Map<
    string,
    {
      resolve: (contents: WebContents) => void;
      reject: (error: Error) => void;
      cleanup: () => void;
      cancelled: boolean;
    }
  >();

  request(
    id: string,
    signal: AbortSignal,
    send: () => void
  ): Promise<WebContents> {
    return new Promise((resolve, reject) => {
      const cancel = (error: Error) => {
        const entry = this.pending.get(id);
        if (!entry || entry.cancelled) return;
        entry.cancelled = true;
        entry.cleanup();
        reject(error);
        // Keep a window-scoped tombstone: a delayed renderer/extension response
        // must still skip the original load. ready/fail/dispose removes it.
      };
      const abort = () =>
        cancel(
          new Error(
            `Stopped. New tab ${id} was not loaded. List tabs before continuing.`
          )
        );
      const timer = setTimeout(
        () =>
          cancel(
            new Error(
              `New tab ${id} creation timed out. List tabs before retrying.`
            )
          ),
        10000
      );
      this.pending.set(id, {
        resolve,
        reject,
        cancelled: false,
        cleanup: () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
        },
      });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
        this.pending.delete(id);
        return;
      }
      try {
        send();
      } catch (error) {
        this.fail(id, error as Error);
      }
    });
  }

  /** True means the ordinary browser loader must not navigate this tab. */
  ready(id: string, contents: WebContents): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    entry.cleanup();
    if (!entry.cancelled) {
      if (contents.isDestroyed())
        entry.reject(new Error('New tab closed before initialization.'));
      else entry.resolve(contents);
    }
    return true;
  }

  fail(id: string, error: Error) {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    entry.cleanup();
    if (!entry.cancelled) entry.reject(error);
  }

  dispose() {
    [...this.pending.keys()].forEach((id) =>
      this.fail(id, new Error('Browser closed during tab creation.'))
    );
  }
}

/** Approval applies to the original document, including same-URL reloads. */
export function watchAITabDocument(contents?: WebContents) {
  const url = contents?.getURL();
  let replaced = false;
  const navigation = (
    _event: unknown,
    _destination: string,
    _inPlace: boolean,
    mainFrame: boolean
  ) => {
    if (mainFrame) replaced = true;
  };
  const destroyed = () => {
    replaced = true;
  };
  contents?.on('did-start-navigation', navigation);
  contents?.on('destroyed', destroyed);
  contents?.on('render-process-gone', destroyed);
  return {
    changed: () =>
      replaced || !!contents?.isDestroyed() || contents?.getURL() !== url,
    dispose: () => {
      contents?.removeListener('did-start-navigation', navigation);
      contents?.removeListener('destroyed', destroyed);
      contents?.removeListener('render-process-gone', destroyed);
    },
  };
}

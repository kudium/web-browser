import type { WebContents } from 'electron';

/** Keep temporary secrets only for their approved document and bounded lifetime. */
export function createAIPrivateInputLease(options: {
  sources: WebContents[];
  check: () => void;
  revoked: () => void;
  subscribe: (revoked: () => void) => () => void;
  lifetimeMs?: number;
}) {
  const sources = [...new Set(options.sources)];
  const expires = Date.now() + (options.lifetimeMs ?? 15 * 60 * 1000);
  let disposed = false;
  let complete!: () => void;
  const completion = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let unsubscribe = () => {};
  let stopWatching = () => {};
  let timer: ReturnType<typeof setTimeout>;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    stopWatching();
    unsubscribe();
    complete();
  };
  const revoke = () => {
    if (disposed) return;
    try {
      options.revoked();
    } finally {
      dispose();
    }
  };
  const navigating = (
    _event: unknown,
    _url: string,
    _inPage: boolean,
    mainFrame: boolean
  ) => {
    if (mainFrame) revoke();
  };
  sources.forEach((source) => {
    source.on('did-start-navigation', navigating);
    source.on('destroyed', revoke);
    source.on('render-process-gone', revoke);
  });
  stopWatching = () => {
    sources.forEach((source) => {
      source.removeListener('did-start-navigation', navigating);
      source.removeListener('destroyed', revoke);
      source.removeListener('render-process-gone', revoke);
    });
  };
  timer = setTimeout(revoke, options.lifetimeMs ?? 15 * 60 * 1000);
  timer.unref?.();
  unsubscribe = options.subscribe(revoke);
  if (disposed) unsubscribe();
  return {
    expires,
    completion,
    dispose,
    assert: () => {
      if (disposed) throw new Error('Private input expired or was revoked.');
      try {
        options.check();
      } catch (error) {
        revoke();
        throw error;
      }
    },
  };
}

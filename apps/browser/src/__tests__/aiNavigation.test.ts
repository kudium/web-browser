import { EventEmitter } from 'events';
import {
  navigateAIPage,
  AI_NAVIGATION_TIMEOUT,
  AI_NETWORK_IDLE_MS,
  AINavigationReview,
} from '../main/aiNavigation';

/** Resolves to the settled state without waiting for a pending promise. */
const settled = async (promise: Promise<unknown>) => {
  let state = 'pending';
  promise
    .then(
      () => {
        state = 'resolved';
        return undefined;
      },
      () => {
        state = 'rejected';
        return undefined;
      }
    )
    .catch(() => {});
  await Promise.resolve();
  await Promise.resolve();
  return state;
};

function fixture() {
  let complete: () => void = () => {};
  const page = Object.assign(new EventEmitter(), {
    isDestroyed: jest.fn(() => false),
    stop: jest.fn(),
    getURL: jest.fn(() => 'https://site.test/redirected'),
    getTitle: jest.fn(() => 'Loaded'),
    loadURL: jest.fn((url: string) => {
      page.emit('did-start-navigation', {}, url, false, true);
      return new Promise<void>((resolve) => {
        complete = resolve;
      });
    }),
  });
  return { page: page as any, complete: () => complete() };
}
afterEach(() => jest.useRealTimers());

function privateFixture() {
  const result = fixture();
  let request: any;
  result.page.id = 27;
  result.page.session = {
    webRequest: {
      onBeforeRequest: (_filter: unknown, listener: unknown) => {
        request = listener;
      },
    },
  };
  return {
    ...result,
    send: (url: string, webContentsId = 27) => {
      const reply = jest.fn();
      request(
        { url, webContentsId, resourceType: 'mainFrame', method: 'GET' },
        reply
      );
      return reply;
    },
  };
}
it('rejects changed authority on the initial approved request and disposes the lease', async () => {
  const { page, send } = privateFixture();
  let valid = true;
  const review: AINavigationReview = async () => {};
  review.check = () => {
    if (!valid) throw new Error('Revoked');
  };
  review.dispose = jest.fn();
  const control = new AbortController();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    control.signal,
    undefined,
    undefined,
    review
  );
  valid = false;
  expect(send('https://site.test/')).toHaveBeenCalledWith({ cancel: true });
  control.abort();
  await expect(pending).rejects.toThrow('Stopped');
  expect(review.dispose).toHaveBeenCalledTimes(1);
});
it('rechecks after local review cleanup and before the native callback', async () => {
  const { page, send } = privateFixture();
  let valid = true;
  const review: AINavigationReview = async () => {};
  review.check = () => {
    if (!valid) throw new Error('Revoked');
  };
  const control = new AbortController();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    control.signal,
    undefined,
    {
      onChange: () => () => {},
      beginReview: () => () => {
        valid = false;
      },
    },
    review
  );
  send('https://site.test/');
  const redirect = send('https://site.test/changed');
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  expect(redirect).toHaveBeenCalledWith({ cancel: true });
  control.abort();
  await expect(pending).rejects.toThrow('Stopped');
});
it('holds each changed destination and releases pending requests on Stop', async () => {
  const { page, send } = privateFixture();
  const control = new AbortController();
  let accept!: () => void;
  const review = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      })
  );
  const pending = navigateAIPage(
    page,
    'https://site.test/#anchor',
    control.signal,
    undefined,
    undefined,
    review
  );
  expect(send('https://site.test/')).toHaveBeenCalledWith({ cancel: false });
  expect(send('https://other.test/', 28)).toHaveBeenCalledWith({
    cancel: false,
  });
  const redirect = send('https://site.test/changed?secret=yes');
  await Promise.resolve();
  expect(review).toHaveBeenCalledWith(
    {
      url: 'https://site.test/changed?secret=yes',
      method: 'GET',
      hasBody: false,
    },
    expect.anything()
  );
  expect(redirect).not.toHaveBeenCalled();
  control.abort();
  await expect(pending).rejects.toThrow('Stopped');
  expect(redirect).toHaveBeenCalledWith({ cancel: true });
  accept();
  await Promise.resolve();
  expect(redirect).toHaveBeenCalledTimes(1);
});
it('bounds unanswered reviews and composes website dialog pauses', async () => {
  jest.useFakeTimers();
  const { page, send } = privateFixture();
  let change!: (pending: boolean) => void;
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal,
    undefined,
    {
      onChange: (listener) => {
        change = listener;
        return () => {};
      },
    },
    () => new Promise<void>(() => {})
  );
  const failure = pending.catch((error) => error);
  send('https://site.test/');
  const redirect = send('https://site.test/changed');
  change(true);
  change(false);
  await jest.advanceTimersByTimeAsync(30000);
  expect(page.stop).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(90000);
  expect((await failure).message).toContain('review timed out');
  expect(redirect).toHaveBeenCalledWith({ cancel: true });
  expect(jest.getTimerCount()).toBe(0);
});
it('cancels redirect loops after sixteen requests', async () => {
  const { page, send } = privateFixture();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal,
    undefined,
    undefined,
    async () => {}
  );
  const failure = pending.catch((error) => error);
  send('https://site.test/');
  for (let index = 1; index <= 16; index += 1) {
    send(`https://site.test/${index}`);
    // Flush the review promise and its dispatcher completion.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
  expect((await failure).message).toContain('16-request');
});
it('returns the resulting redirected URL and cleans navigation listeners', async () => {
  const { page, complete } = fixture();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal
  );
  complete();
  await expect(pending).resolves.toEqual({
    url: 'https://site.test/redirected',
    title: 'Loaded',
  });
  expect(page.listenerCount('did-start-navigation')).toBe(0);
  expect(page.listenerCount('destroyed')).toBe(0);
  expect(page.stop).not.toHaveBeenCalled();
});
it('stops a stalled load immediately and ignores late completion', async () => {
  const { page, complete } = fixture();
  const control = new AbortController();
  const pending = navigateAIPage(page, 'https://site.test/', control.signal);
  control.abort();
  await expect(pending).rejects.toThrow('Stopped');
  complete();
  expect(page.stop).toHaveBeenCalledTimes(1);
  expect(page.listenerCount('did-start-navigation')).toBe(0);
});
it('does not stop a replacement navigation initiated by the human', async () => {
  const { page } = fixture();
  const control = new AbortController();
  const pending = navigateAIPage(page, 'https://site.test/', control.signal);
  page.emit('did-start-navigation', {}, 'https://other.test/', false, true);
  control.abort();
  await expect(pending).rejects.toThrow('replaced');
  expect(page.stop).not.toHaveBeenCalled();
});
it('bounds an unresponsive load with a deadline', async () => {
  jest.useFakeTimers();
  const { page } = fixture();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal
  );
  const failure = pending.catch((error) => error);
  await jest.advanceTimersByTimeAsync(AI_NAVIGATION_TIMEOUT);
  expect((await failure).message).toContain('timed out');
  expect(page.stop).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
it('does not start loading after cancellation', async () => {
  const { page } = fixture();
  const control = new AbortController();
  control.abort();
  await expect(
    navigateAIPage(page, 'https://site.test/', control.signal)
  ).rejects.toThrow('Stopped');
  expect(page.loadURL).not.toHaveBeenCalled();
});

it('waits for a native reload to finish and releases lifecycle listeners', async () => {
  const { page } = fixture();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal,
    () => {
      page.emit('did-start-navigation', {}, 'https://site.test/', false, true);
    }
  );
  page.emit('did-finish-load');
  await expect(pending).resolves.toEqual({
    url: 'https://site.test/redirected',
    title: 'Loaded',
  });
  expect(page.loadURL).not.toHaveBeenCalled();
  expect(page.listenerCount('did-finish-load')).toBe(0);
});
it('completes same-document history navigation without waiting for a load event', async () => {
  const { page } = fixture();
  page.getURL.mockReturnValue('https://site.test/#earlier');
  const pending = navigateAIPage(
    page,
    'https://site.test/#earlier',
    new AbortController().signal,
    () => {
      page.emit(
        'did-start-navigation',
        {},
        'https://site.test/#earlier',
        true,
        true
      );
      page.emit('did-navigate-in-page', {}, 'https://site.test/#earlier', true);
    }
  );
  await expect(pending).resolves.toHaveProperty(
    'url',
    'https://site.test/#earlier'
  );
});
it('cancels native reload and ignores late browser events', async () => {
  const { page } = fixture();
  const control = new AbortController();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    control.signal,
    () => {
      page.emit('did-start-navigation', {}, 'https://site.test/', false, true);
    }
  );
  control.abort();
  await expect(pending).rejects.toThrow('Stopped');
  page.emit('did-finish-load');
  expect(page.stop).toHaveBeenCalledTimes(1);
  expect(page.listenerCount('did-finish-load')).toBe(0);
});
it('reports native load failure and removes pending listeners', async () => {
  const { page } = fixture();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal,
    () => {
      page.emit('did-start-navigation', {}, 'https://site.test/', false, true);
    }
  );
  page.emit(
    'did-fail-load',
    {},
    -105,
    'NAME_NOT_RESOLVED',
    'https://site.test/',
    true
  );
  await expect(pending).rejects.toThrow('NAME_NOT_RESOLVED');
  expect(page.listenerCount('did-fail-load')).toBe(0);
});

it('accepts the initial destination chosen by Chromium history skipping', async () => {
  const { page } = fixture();
  const pending = navigateAIPage(
    page,
    'https://site.test/#skipped',
    new AbortController().signal,
    () => {
      page.emit(
        'did-start-navigation',
        {},
        'https://site.test/redirected',
        false,
        true
      );
      page.emit('did-finish-load');
    }
  );
  await expect(pending).resolves.toHaveProperty(
    'url',
    'https://site.test/redirected'
  );
});

it('pauses the navigation deadline during dialogs and resumes only its remaining budget', async () => {
  jest.useFakeTimers();
  const { page } = fixture();
  let change: (pending: boolean) => void = () => {};
  const unsubscribe = jest.fn();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal,
    undefined,
    {
      onChange: (listener) => {
        change = listener;
        return unsubscribe;
      },
    }
  );
  const failure = pending.catch((error) => error);
  await jest.advanceTimersByTimeAsync(10000);
  change(true);
  await jest.advanceTimersByTimeAsync(60000);
  expect(page.stop).not.toHaveBeenCalled();
  change(false);
  await jest.advanceTimersByTimeAsync(19999);
  expect(page.stop).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect((await failure).message).toContain('timed out');
  expect(page.stop).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('releases a paused dialog subscription without stopping a replacement load', async () => {
  jest.useFakeTimers();
  const { page } = fixture();
  const control = new AbortController();
  let change: (pending: boolean) => void = () => {};
  const unsubscribe = jest.fn();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    control.signal,
    undefined,
    {
      onChange: (listener) => {
        change = listener;
        return unsubscribe;
      },
    }
  );
  change(true);
  page.emit('did-start-navigation', {}, 'https://human.test/', false, true);
  control.abort();
  await expect(pending).rejects.toThrow('replaced');
  change(false);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(page.stop).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it('rejects renderer exit immediately without stopping a later replacement load', async () => {
  jest.useFakeTimers();
  const { page, complete } = fixture();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal
  );
  page.emit('render-process-gone', {}, { reason: 'crashed' });
  await expect(pending).rejects.toThrow('renderer exited');
  complete();
  page.emit('did-finish-load');
  expect(page.stop).not.toHaveBeenCalled();
  expect(page.listenerCount('render-process-gone')).toBe(0);
  expect(page.listenerCount('did-start-navigation')).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

it('returns at main-frame commit before the load finishes when asked', async () => {
  const { page, complete } = fixture();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal,
    undefined,
    undefined,
    undefined,
    'commit'
  );
  expect(await settled(pending)).toBe('pending');
  page.emit('did-navigate', {}, 'https://site.test/redirected', 200, 'OK');
  await expect(pending).resolves.toEqual({
    url: 'https://site.test/redirected',
    title: 'Loaded',
  });
  expect(page.listenerCount('did-navigate')).toBe(0);
  expect(page.listenerCount('dom-ready')).toBe(0);
  expect(page.stop).not.toHaveBeenCalled();
  complete();
});

it('returns at DOMContentLoaded when asked and ignores commit', async () => {
  const { page } = fixture();
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal,
    undefined,
    undefined,
    undefined,
    'domcontentloaded'
  );
  page.emit('did-navigate', {}, 'https://site.test/', 200, 'OK');
  expect(await settled(pending)).toBe('pending');
  page.emit('dom-ready', {});
  await expect(pending).resolves.toMatchObject({ title: 'Loaded' });
});

it('waits for a quiet network gap after load for networkidle', async () => {
  jest.useFakeTimers();
  const { page, complete } = privateFixture();
  const observed = (resourceType: string) => {
    const reply = jest.fn();
    (page.session.webRequest as any).listener?.(
      { url: 'https://site.test/x', webContentsId: 27, resourceType, method: 'GET' },
      reply
    );
    return reply;
  };
  const original = page.session.webRequest.onBeforeRequest;
  page.session.webRequest.onBeforeRequest = (filter: unknown, listener: any) => {
    (page.session.webRequest as any).listener = listener;
    original(filter, listener);
  };
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal,
    undefined,
    undefined,
    undefined,
    'networkidle'
  );
  complete();
  await jest.advanceTimersByTimeAsync(AI_NETWORK_IDLE_MS - 100);
  expect(await settled(pending)).toBe('pending');
  expect(observed('script')).toHaveBeenCalledWith({ cancel: false });
  await jest.advanceTimersByTimeAsync(AI_NETWORK_IDLE_MS - 100);
  expect(await settled(pending)).toBe('pending');
  // Long-lived connections never settle and must not restart the gap.
  expect(observed('webSocket')).toHaveBeenCalledWith({ cancel: false });
  await jest.advanceTimersByTimeAsync(100);
  await expect(pending).resolves.toMatchObject({ title: 'Loaded' });
});

it('bounds networkidle by the navigation deadline', async () => {
  jest.useFakeTimers();
  const { page, complete } = privateFixture();
  let listener: any;
  const original = page.session.webRequest.onBeforeRequest;
  page.session.webRequest.onBeforeRequest = (filter: unknown, handler: any) => {
    listener = handler;
    original(filter, handler);
  };
  const pending = navigateAIPage(
    page,
    'https://site.test/',
    new AbortController().signal,
    undefined,
    undefined,
    undefined,
    'networkidle'
  );
  const outcome = pending.then(
    () => 'resolved',
    (error: Error) => error.message
  );
  complete();
  for (let elapsed = 0; elapsed < AI_NAVIGATION_TIMEOUT; elapsed += 200) {
    listener(
      { url: 'https://site.test/poll', webContentsId: 27, resourceType: 'xhr', method: 'GET' },
      jest.fn()
    );
    await jest.advanceTimersByTimeAsync(200);
  }
  await expect(outcome).resolves.toContain('Navigation timed out');
  expect(page.stop).toHaveBeenCalled();
});

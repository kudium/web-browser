import { EventEmitter } from 'events';
import { AIDialogs, AIDepartureBlockedError } from '../main/aiDialogs';

beforeAll(() => {
  Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
    configurable: true,
    value() {
      if (this.aborted) throw new Error('Stopped.');
    },
  });
});
afterAll(() => {
  delete (AbortSignal.prototype as any).throwIfAborted;
});

function page() {
  let attached = false;
  return Object.assign(new EventEmitter(), {
    debugger: Object.assign(new EventEmitter(), {
      isAttached: () => attached,
      attach: () => {
        attached = true;
      },
      detach: () => {
        attached = false;
      },
      sendCommand: jest.fn().mockResolvedValue({}),
    }),
    isDestroyed: () => false,
  }) as any;
}
const event = {
  dialogType: 'confirm',
  messageText: 'Continue?',
  defaultPromptText: '',
  frame: { url: 'https://fixture.test' },
};

it('keeps local review and website dialog pauses independent', async () => {
  jest.useFakeTimers();
  try {
    const contents = page();
    const dialogs = new AIDialogs();
    const control = new AbortController();
    let release!: () => void;
    let aborted = false;
    const changes: boolean[] = [];
    const pending = dialogs.perform(
      contents,
      control.signal,
      async (signal, lifecycle) => {
        lifecycle.onChange((value) => changes.push(value));
        await new Promise((resolve) => {
          setTimeout(resolve, 10000);
        });
        release = lifecycle.beginReview!();
        contents.emit('-run-dialog', event, () => {});
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve('Stopped');
          });
        });
      },
      { actionTimeoutMs: 30000 }
    );
    await jest.advanceTimersByTimeAsync(10000);
    const receipt: any = await pending;
    release();
    await jest.advanceTimersByTimeAsync(40000);
    expect(aborted).toBe(false);
    const resumed = dialogs
      .respond(contents, receipt.dialog.id, true, '', control.signal)
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(30000);
    expect(await resumed).toEqual(
      expect.objectContaining({ message: 'Stopped.' })
    );
    expect(changes).toEqual([true, true, false]);
  } finally {
    jest.useRealTimers();
  }
});

it('resumes the remaining action budget after a local review', async () => {
  jest.useFakeTimers();
  try {
    const contents = page();
    let release!: () => void;
    const pending = new AIDialogs()
      .perform(
        contents,
        new AbortController().signal,
        async (_signal, lifecycle) => {
          await new Promise((resolve) => {
            setTimeout(resolve, 10000);
          });
          release = lifecycle.beginReview!();
          return new Promise(() => {});
        },
        { actionTimeoutMs: 30000 }
      )
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(10000);
    await jest.advanceTimersByTimeAsync(40000);
    release();
    await jest.advanceTimersByTimeAsync(19999);
    expect(contents.debugger.isAttached()).toBe(true);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual(
      expect.objectContaining({ message: 'Stopped.' })
    );
    expect(contents.debugger.isAttached()).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

it('captures a native callback, resumes its action and restores normal handlers', async () => {
  const contents = page();
  const normal = jest.fn();
  contents.on('-run-dialog', normal);
  const dialogs = new AIDialogs();
  const source = new AbortController();
  const receipt: any = await dialogs.perform(
    contents,
    source.signal,
    async () =>
      new Promise((resolve) => {
        contents.emit('-run-dialog', event, (accept: boolean) =>
          resolve({ accepted: accept })
        );
      })
  );
  expect(receipt).toMatchObject({
    pending: true,
    mayHaveEffects: true,
    dialog: { type: 'confirm', message: 'Continue?' },
  });
  expect(normal).not.toHaveBeenCalled();
  expect(dialogs.busy()).toBe(true);
  await expect(
    dialogs.respond(contents, receipt.dialog.id, true, '', source.signal)
  ).resolves.toEqual({ accepted: true });
  expect(dialogs.busy()).toBe(false);
  expect(contents.debugger.isAttached()).toBe(false);
  expect(contents.listeners('-run-dialog')).toEqual([normal]);
  expect(contents.listenerCount('-cancel-dialogs')).toBe(0);
});

it('keeps sequential dialogs in the same action and rejects stale IDs', async () => {
  const contents = page();
  const dialogs = new AIDialogs();
  const source = new AbortController();
  const first: any = await dialogs.perform(
    contents,
    source.signal,
    async () =>
      new Promise((resolve) => {
        contents.emit('-run-dialog', event, () => {
          contents.emit(
            '-run-dialog',
            { ...event, dialogType: 'prompt' },
            (_accept: boolean, text: string) => resolve(text)
          );
        });
      })
  );
  const second: any = await dialogs.respond(
    contents,
    first.dialog.id,
    true,
    '',
    source.signal
  );
  expect(second.dialog.id).not.toBe(first.dialog.id);
  await expect(
    dialogs.respond(contents, first.dialog.id, true, '', source.signal)
  ).rejects.toThrow('changed');
  await expect(
    dialogs.respond(contents, second.dialog.id, true, 'Answer', source.signal)
  ).resolves.toBe('Answer');
});

it.each(['stop', 'source', 'native'])(
  'dismisses a pending callback and releases its lease on %s cancellation',
  async (kind) => {
    const contents = page();
    const normal = jest.fn();
    contents.on('-run-dialog', normal);
    const dialogs = new AIDialogs();
    const source = new AbortController();
    const reply = jest.fn();
    await dialogs.perform(
      contents,
      source.signal,
      async () =>
        new Promise(() => {
          contents.emit('-run-dialog', event, reply);
        })
    );
    if (kind === 'stop') await dialogs.stop();
    if (kind === 'source') source.abort();
    if (kind === 'native') contents.emit('-cancel-dialogs');
    // Allow the cancelled protocol race to finish restoring native handlers.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(reply).toHaveBeenCalledWith(false, '');
    expect(dialogs.busy()).toBe(false);
    expect(contents.debugger.isAttached()).toBe(false);
    expect(contents.listeners('-run-dialog')).toEqual([normal]);
  }
);

it('cleans handlers when the tab already has an unrelated debugger', async () => {
  const contents = page();
  contents.debugger.attach();
  const normal = jest.fn();
  contents.on('-run-dialog', normal);
  const dialogs = new AIDialogs();
  await expect(
    dialogs.perform(contents, new AbortController().signal, async () => true)
  ).rejects.toThrow('being debugged');
  expect(dialogs.busy()).toBe(false);
  expect(contents.debugger.isAttached()).toBe(true);
  expect(contents.listeners('-run-dialog')).toEqual([normal]);
});

it('dismisses native dialogs when the outer lease deadline expires first', async () => {
  jest.useFakeTimers();
  try {
    const contents = page();
    const normal = jest.fn();
    contents.on('-run-dialog', normal);
    const dialogs = new AIDialogs();
    const source = new AbortController();
    const reply = jest.fn();
    let open: (() => void) | undefined;
    const pending = dialogs.perform(
      contents,
      source.signal,
      async () =>
        new Promise(() => {
          open = () => contents.emit('-run-dialog', event, reply);
        })
    );
    await Promise.resolve();
    jest.advanceTimersByTime(5000);
    open!();
    await pending;
    await jest.advanceTimersByTimeAsync(115000);
    expect(reply).toHaveBeenCalledWith(false, '');
    expect(dialogs.busy()).toBe(false);
    expect(contents.listeners('-run-dialog')).toEqual([normal]);
  } finally {
    jest.useRealTimers();
  }
});

it('ignores ordinary native dialog-state resets when no dialog is pending', async () => {
  const contents = page();
  const dialogs = new AIDialogs();
  await expect(
    dialogs.perform(
      contents,
      new AbortController().signal,
      async (signal) => {
        contents.emit('-cancel-dialogs');
        expect(signal.aborted).toBe(false);
        return 'Loaded';
      },
      { actionTimeoutMs: 30000 }
    )
  ).resolves.toBe('Loaded');
});

it('authorizes one beforeunload event only for the approved source page', async () => {
  const contents = page();
  contents.getURL = jest.fn(() => 'https://fixture.test/editor');
  const dialogs = new AIDialogs();
  const allow = jest.fn();
  const second = jest.fn();
  await dialogs.perform(
    contents,
    new AbortController().signal,
    async () => {
      contents.emit('will-prevent-unload', { preventDefault: allow });
      contents.emit('will-prevent-unload', { preventDefault: second });
    },
    { departure: { url: 'https://fixture.test/editor', approved: true } }
  );
  expect(allow).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(contents.listenerCount('will-prevent-unload')).toBe(0);
  const replaced = jest.fn();
  await dialogs.perform(
    contents,
    new AbortController().signal,
    async () => {
      contents.getURL.mockReturnValue('https://human.test');
      contents.emit('will-prevent-unload', { preventDefault: replaced });
    },
    { departure: { url: 'https://fixture.test/editor', approved: true } }
  );
  expect(replaced).not.toHaveBeenCalled();
});

it('runs a navigation lease without attaching a page protocol session', async () => {
  const contents = page();
  const attach = jest.spyOn(contents.debugger, 'attach');
  const dialogs = new AIDialogs();
  await expect(
    dialogs.perform(contents, new AbortController().signal, async () => 'navigated', {
      protocol: false,
    })
  ).resolves.toBe('navigated');
  expect(attach).not.toHaveBeenCalled();
  expect(dialogs.busy()).toBe(false);
  await expect(
    dialogs.perform(contents, new AbortController().signal, async () => 'clicked')
  ).resolves.toBe('clicked');
  expect(attach).toHaveBeenCalledTimes(1);
});

it('ends an unapproved departure as soon as the page blocks leaving', async () => {
  const contents = page();
  contents.getURL = jest.fn(() => 'https://fixture.test/editor');
  const dialogs = new AIDialogs();
  const keep = jest.fn();
  const pending = dialogs.perform(
    contents,
    new AbortController().signal,
    (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(new Error('Stopped. Navigation cancelled.'))
        );
        contents.emit('will-prevent-unload', { preventDefault: keep });
      }),
    { departure: { url: 'https://fixture.test/editor', approved: false } }
  );
  await expect(pending).rejects.toBeInstanceOf(AIDepartureBlockedError);
  await expect(pending).rejects.toMatchObject({
    url: 'https://fixture.test/editor',
  });
  expect(keep).not.toHaveBeenCalled();
  expect(contents.listenerCount('will-prevent-unload')).toBe(0);
  expect(dialogs.busy()).toBe(false);
});

it('ignores a blocked unload on another page and reports the real failure', async () => {
  const contents = page();
  contents.getURL = jest.fn(() => 'https://human.test');
  const dialogs = new AIDialogs();
  await expect(
    dialogs.perform(
      contents,
      new AbortController().signal,
      async () => {
        contents.emit('will-prevent-unload', { preventDefault: jest.fn() });
        throw new Error('Navigation failed (-3): ERR_ABORTED');
      },
      { departure: { url: 'https://fixture.test/editor', approved: false } }
    )
  ).rejects.toThrow('Navigation failed (-3): ERR_ABORTED');
});

/** @jest-environment node */
import { EventEmitter } from 'events';
import type { WebContents } from 'electron';
import { withAIActionBinding } from '../main/aiActionApproval';

function page() {
  const events = new EventEmitter();
  return Object.assign(events, {
    getURL: jest.fn(() => 'https://fixture.example/'),
    isDestroyed: jest.fn(() => false),
  });
}

const eventNames = ['did-start-navigation', 'destroyed', 'render-process-gone'];

it.each(['did-start-navigation', 'destroyed', 'render-process-gone'])(
  'rejects %s during review even when the URL stays the same',
  async (event) => {
    const source = page();
    let effects = 0;
    await expect(
      withAIActionBinding(
        [source as unknown as WebContents],
        () => true,
        new AbortController().signal,
        async (check) => {
          source.emit(event, {}, source.getURL(), false, true);
          check();
          effects += 1;
        }
      )
    ).rejects.toThrow('changed during approval');
    expect(effects).toBe(0);
    eventNames.forEach((name) => expect(source.listenerCount(name)).toBe(0));
  }
);

it('rechecks owner/scope/access after review and before delayed dispatch', async () => {
  const source = page();
  let current = true;
  await expect(
    withAIActionBinding(
      [source as unknown as WebContents],
      () => current,
      new AbortController().signal,
      async (check) => {
        check();
        await Promise.resolve();
        current = false;
        check();
      }
    )
  ).rejects.toThrow('permissions changed');
});

it('binds the host as well as the target and removes duplicate listeners', async () => {
  const host = page();
  const source = page();
  await expect(
    withAIActionBinding(
      [host, source, source] as unknown as WebContents[],
      () => true,
      new AbortController().signal,
      async (check) => {
        expect(source.listenerCount('destroyed')).toBe(1);
        host.isDestroyed.mockReturnValue(true);
        check();
      }
    )
  ).rejects.toThrow('changed during approval');
  [host, source].forEach((item) => {
    eventNames.forEach((name) => expect(item.listenerCount(name)).toBe(0));
  });
});

it.each(['stop', 'url', 'declined'])(
  'rejects %s with listener cleanup',
  async (condition) => {
    const source = page();
    const controller = new AbortController();
    await expect(
      withAIActionBinding(
        [source as unknown as WebContents],
        () => true,
        controller.signal,
        async (check) => {
          if (condition === 'stop') controller.abort(new Error('Stopped'));
          if (condition === 'url')
            source.getURL.mockReturnValue('https://other.example/');
          if (condition === 'declined') throw new Error('Declined');
          check();
        }
      )
    ).rejects.toThrow();
    eventNames.forEach((name) => expect(source.listenerCount(name)).toBe(0));
  }
);

it('allows the reviewed action to navigate after its final dispatch check', async () => {
  const source = page();
  await expect(
    withAIActionBinding(
      [source as unknown as WebContents],
      () => true,
      new AbortController().signal,
      async (check) => {
        source.emit('did-start-navigation', {}, '#part', true, true);
        source.emit('did-start-navigation', {}, '/child', false, false);
        check();
        source.emit('did-start-navigation', {}, '/approved', false, true);
        return 'dispatched';
      }
    )
  ).resolves.toBe('dispatched');
  eventNames.forEach((name) => expect(source.listenerCount(name)).toBe(0));
});

it('retains the original document across a pending dialog receipt', async () => {
  const source = page();
  let complete!: () => void;
  const completion = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let dispatchCheck!: () => void;
  await withAIActionBinding(
    [source as unknown as WebContents],
    () => true,
    new AbortController().signal,
    async (check, retainUntil) => {
      dispatchCheck = check;
      retainUntil(completion);
      return { pending: true };
    }
  );
  expect(source.listenerCount('did-start-navigation')).toBe(1);
  source.emit('did-start-navigation', {}, source.getURL(), false, true);
  expect(dispatchCheck).toThrow('changed during approval');
  complete();
  await completion;
  await Promise.resolve();
  eventNames.forEach((name) => expect(source.listenerCount(name)).toBe(0));
});

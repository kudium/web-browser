import type { WebContents } from 'electron';
import { EventEmitter } from 'events';
import { AINewTabs, watchAITabDocument } from '../main/aiTabs';

const contents = () => ({ isDestroyed: () => false } as WebContents);
afterEach(() => jest.useRealTimers());

it('reserves initial navigation until extension initialization is ready', async () => {
  const tabs = new AINewTabs();
  const control = new AbortController();
  const send = jest.fn();
  const pending = tabs.request('one', control.signal, send);
  const page = contents();
  expect(send).toHaveBeenCalledTimes(1);
  expect(tabs.ready('one', page)).toBe(true);
  await expect(pending).resolves.toBe(page);
  expect(tabs.ready('one', page)).toBe(false);
  expect(tabs.ready('human', page)).toBe(false);
});

it('rejects Stop promptly and suppresses a late initial load', async () => {
  const tabs = new AINewTabs();
  const control = new AbortController();
  const pending = tabs.request('late', control.signal, () => {});
  control.abort();
  await expect(pending).rejects.toThrow('Stopped');
  expect(tabs.ready('late', contents())).toBe(true);
  expect(tabs.ready('late', contents())).toBe(false);
});

it('does not dispatch already cancelled requests', async () => {
  const tabs = new AINewTabs();
  const control = new AbortController();
  control.abort();
  const send = jest.fn();
  await expect(tabs.request('cancelled', control.signal, send)).rejects.toThrow(
    'Stopped'
  );
  expect(send).not.toHaveBeenCalled();
  tabs.dispose();
});

it('times out missing creation without allowing a late load and permits recovery', async () => {
  jest.useFakeTimers();
  const tabs = new AINewTabs();
  const control = new AbortController();
  const pending = tabs.request('slow', control.signal, () => {});
  // Attach rejection handling before advancing the fake creation deadline.
  const failure = pending.catch((error) => error);
  jest.advanceTimersByTime(10000);
  expect((await failure).message).toContain('timed out');
  expect(tabs.ready('slow', contents())).toBe(true);
  const next = tabs.request('next', control.signal, () => {});
  const page = contents();
  tabs.ready('next', page);
  await expect(next).resolves.toBe(page);
});

it('rejects initialization failures, closed tabs and window disposal', async () => {
  const tabs = new AINewTabs();
  const control = new AbortController();
  const failed = tabs.request('failed', control.signal, () => {});
  tabs.fail('failed', new Error('Extension failed'));
  await expect(failed).rejects.toThrow('Extension failed');
  const closed = tabs.request('closed', control.signal, () => {});
  tabs.ready('closed', { isDestroyed: () => true } as WebContents);
  await expect(closed).rejects.toThrow('closed');
  const disposed = tabs.request('disposed', control.signal, () => {});
  tabs.dispose();
  await expect(disposed).rejects.toThrow('Browser closed');
  expect(tabs.ready('disposed', contents())).toBe(false);
});

it('invalidates document approval on same-URL replacement but not child-frame navigation', () => {
  const page = Object.assign(new EventEmitter(), {
    getURL: () => 'https://fixture.test/',
    isDestroyed: () => false,
  }) as any;
  const document = watchAITabDocument(page);
  expect(document.changed()).toBe(false);
  page.emit('did-start-navigation', {}, 'https://child.test', false, false);
  expect(document.changed()).toBe(false);
  page.emit('did-start-navigation', {}, 'https://fixture.test/', false, true);
  expect(document.changed()).toBe(true);
  document.dispose();
  expect(page.listenerCount('did-start-navigation')).toBe(0);
  expect(page.listenerCount('destroyed')).toBe(0);
});

it('invalidates document approval on destruction or a silent URL change', () => {
  let url = 'https://fixture.test/';
  const page = Object.assign(new EventEmitter(), {
    getURL: () => url,
    isDestroyed: () => false,
  }) as any;
  const first = watchAITabDocument(page);
  url = 'https://human.test/';
  expect(first.changed()).toBe(true);
  first.dispose();
  const second = watchAITabDocument(page);
  page.emit('destroyed');
  expect(second.changed()).toBe(true);
  second.dispose();
});

it('invalidates approval on renderer exit even when WebContents and URL survive', () => {
  const page = Object.assign(new EventEmitter(), {
    getURL: () => 'https://fixture.test/',
    isDestroyed: () => false,
  }) as any;
  const document = watchAITabDocument(page);
  page.emit('render-process-gone', {}, { reason: 'crashed' });
  expect(document.changed()).toBe(true);
  document.dispose();
  expect(page.listenerCount('render-process-gone')).toBe(0);
});

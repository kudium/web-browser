/** @jest-environment node */
import { EventEmitter } from 'events';
import type { WebContents } from 'electron';
import { createAIPrivateInputLease } from '../main/aiPrivateInputLease';

function fixture(lifetimeMs = 1000) {
  const source = new EventEmitter();
  let authRevoked!: () => void;
  const unsubscribe = jest.fn();
  const revoked = jest.fn();
  const check = jest.fn();
  const lease = createAIPrivateInputLease({
    sources: [source, source] as unknown as WebContents[],
    check,
    revoked,
    subscribe: (listener) => {
      authRevoked = listener;
      return unsubscribe;
    },
    lifetimeMs,
  });
  return { source, lease, revoked, check, unsubscribe, authRevoked };
}

afterEach(() => jest.useRealTimers());

it.each([
  'navigation',
  'same-document navigation',
  'destroyed',
  'render-process-gone',
])('revokes %s and releases retained listeners once', async (event) => {
  const { source, lease, revoked, unsubscribe } = fixture();
  expect(source.listenerCount('did-start-navigation')).toBe(1);
  if (event.includes('navigation'))
    source.emit(
      'did-start-navigation',
      {},
      'https://fixture.test/',
      event.startsWith('same'),
      true
    );
  else source.emit(event);
  await lease.completion;
  expect(revoked).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(source.eventNames()).toEqual([]);
  expect(lease.assert).toThrow('expired or was revoked');
  lease.dispose();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it('expires and disposes without requiring another request', async () => {
  jest.useFakeTimers();
  const { lease, revoked, unsubscribe } = fixture();
  jest.advanceTimersByTime(999);
  lease.assert();
  expect(revoked).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  await lease.completion;
  expect(revoked).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('rejects an owner change on reuse and releases the stored capability', () => {
  const { lease, check, revoked } = fixture();
  check.mockImplementation(() => {
    throw new Error('owner changed');
  });
  expect(lease.assert).toThrow('owner changed');
  expect(revoked).toHaveBeenCalledTimes(1);
});

it('releases on auth revocation and ignores child-frame navigation', async () => {
  const { source, lease, authRevoked, revoked } = fixture();
  source.emit(
    'did-start-navigation',
    {},
    'https://fixture.test/',
    false,
    false
  );
  lease.assert();
  expect(revoked).not.toHaveBeenCalled();
  authRevoked();
  await lease.completion;
  expect(revoked).toHaveBeenCalledTimes(1);
});

it('consumption disposes without invoking revocation or leaking a timer', async () => {
  jest.useFakeTimers();
  const { source, lease, revoked, unsubscribe } = fixture();
  lease.assert();
  lease.dispose();
  await lease.completion;
  expect(revoked).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(source.eventNames()).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
});

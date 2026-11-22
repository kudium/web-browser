/** @jest-environment node */
import { ActivityStore } from '../main/activityStore';
import { AIInputAttention } from '../main/aiInputAttention';
import type { BrowserActivity } from '../browser/activity';

it('alerts once per question and marks the matching alert read on answer or cancellation', () => {
  let saved: BrowserActivity[] = [];
  const created = jest.fn();
  const store = new ActivityStore({
    load: () => saved,
    save: (entries) => {
      saved = entries;
    },
    created,
  });
  const attention = new AIInputAttention(() => store);
  attention.begin('first', { groupId: 'group-a', scope: 'group-a' });
  attention.begin('first', { groupId: 'group-a', scope: 'group-a' });
  expect(created).toHaveBeenCalledTimes(1);
  expect(store.list()[0]).toMatchObject({
    source: 'ai',
    groupId: 'group-a',
    asRead: false,
    title: 'AI needs your reply',
  });
  attention.finish('stale');
  expect(store.list()[0].asRead).toBe(false);
  attention.finish('first');
  expect(store.list()[0].asRead).toBe(true);
  attention.begin('second', {});
  expect(created).toHaveBeenCalledTimes(2);
  attention.finish('second');
  expect(store.list().every((entry) => entry.asRead)).toBe(true);
});

it('keeps feedback usable when activity storage cannot create or resolve an alert', () => {
  const create = jest.fn(() => {
    throw new Error('Storage unavailable');
  });
  const read = jest.fn(() => {
    throw new Error('Storage unavailable');
  });
  const attention = new AIInputAttention(() => ({ create, read }));
  expect(() => attention.begin('one', {})).not.toThrow();
  expect(() => attention.finish('one')).not.toThrow();
});

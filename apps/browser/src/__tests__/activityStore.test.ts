/** @jest-environment node */
/* Unsafe URL fixtures verify rejection. */
/* eslint-disable no-script-url */
import { ActivityStore } from '../main/activityStore';
import { validateActivity } from '../browser/activity';
import type { BrowserActivity } from '../browser/activity';

function fixture() {
  let saved: BrowserActivity[] = [];
  const persistence = {
    load: () => saved,
    save: jest.fn((entries: BrowserActivity[]) => {
      saved = entries;
    }),
  };
  return { persistence, store: new ActivityStore(persistence, () => 1234) };
}
test('persists unread events, links and source metadata and marks only chosen events read', () => {
  const { store, persistence } = fixture();
  const note = store.create(
    { title: 'Research ready', noteId: 'note-1' },
    { source: 'ai', scope: 'group-a' }
  );
  const hook = store.create(
    { title: 'Hooks completed', url: 'https://example.com' },
    { source: 'hook' },
    true
  );
  expect(note.deepLink).toBe(`#kudiumbrowser-activity-${note.id}`);
  expect(new ActivityStore(persistence).list()).toEqual([
    expect.objectContaining({ id: hook.id, asRead: true }),
    expect.objectContaining({
      noteId: 'note-1',
      asRead: false,
      createdAt: 1234,
    }),
  ]);
  store.read(note.id);
  expect(store.list().every((entry) => entry.asRead)).toBe(true);
});
test('failed writes preserve the timeline and returned lists cannot mutate it', () => {
  const { store, persistence } = fixture();
  store.create({ title: 'Saved' }, { source: 'ai' });
  store.list()[0].title = 'Changed outside';
  persistence.save.mockImplementationOnce(() => {
    throw new Error('Disk full');
  });
  expect(() => store.create({ title: 'Lost' }, { source: 'hook' })).toThrow(
    'Disk full'
  );
  expect(store.list()).toHaveLength(1);
  expect(store.list()[0].title).toBe('Saved');
});
test('bounds history and bulk read preserves hidden group events', () => {
  const { store } = fixture();
  for (let index = 0; index < 1002; index += 1)
    store.create({ title: String(index) }, { source: 'hook' });
  expect(store.list()).toHaveLength(1000);
  const first = store.list()[0];
  store.read([first.id]);
  expect(store.list()[0].asRead).toBe(true);
  expect(store.list()[1].asRead).toBe(false);
});
test.each([
  'javascript:alert(1)',
  'file:///tmp/test',
  'https://user:pass@example.com',
])('rejects unsafe action URL %s', (url) => {
  expect(() => validateActivity({ title: 'Action', url })).toThrow();
});
test('rejects unbounded and unsupported activity fields', () => {
  expect(() => validateActivity({ title: 'x'.repeat(121) })).toThrow();
  expect(() =>
    validateActivity({ title: 'Event', message: 'x'.repeat(2001) })
  ).toThrow();
  expect(() => validateActivity({ title: 'Event', source: 'ai' })).toThrow();
});

test('deletion persists only the chosen removal and preserves entries on write failure', () => {
  const { store, persistence } = fixture();
  const first = store.create({ title: 'First' }, { source: 'ai' });
  const second = store.create({ title: 'Second' }, { source: 'hook' });
  persistence.save.mockImplementationOnce(() => { throw new Error('Disk full'); });
  expect(() => store.delete(first.id)).toThrow('Disk full');
  expect(store.list()).toHaveLength(2);
  store.delete(first.id);
  expect(new ActivityStore(persistence).list().map(entry => entry.id)).toEqual([second.id]);
});

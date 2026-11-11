import { createDeveloperPagesStore } from '../browser/developerPagesStore';

it('shares hook metadata with every subscriber and isolates groups', async () => {
  const pages = [
    {
      id: 'one',
      name: 'Page',
      url: 'https://example.com',
      hasHooks: true,
      enabled: true,
      status: 'success' as const,
    },
  ];
  const store = createDeveloperPagesStore(async () => pages);
  const first = jest.fn();
  const second = jest.fn();
  const stop = store.subscribe('group', first);
  store.subscribe('group', second);
  await store.refresh('group');
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot('group').pages).toEqual(pages);
  expect(store.getSnapshot('other').pages).toEqual([]);
  stop();
  await store.refresh('group');
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
});
it('ignores older requests and clears inaccessible metadata on failure', async () => {
  let finish: (value: any) => void = () => {};
  const load = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error('Locked'));
  const store = createDeveloperPagesStore(load);
  const older = store.refresh('one');
  await store.refresh('one');
  finish([{ id: 'stale' }]);
  await older;
  expect(store.getSnapshot('one').pages).toEqual([]);
  await store.refresh('one');
  expect(store.getSnapshot('one').error).toEqual(new Error('Locked'));
});

import { createDeveloperProjectStore } from '../browser/developerProjectStore';

const linked = { name: 'Example', path: '/example', available: true };
it('shares project changes, watches once and ignores requests overtaken by linking', async () => {
  let changed = () => {};
  let finish: (value: typeof linked | null) => void = () => {};
  const load = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValue(linked);
  const stop = jest.fn();
  const watch = jest.fn((refresh) => {
    changed = refresh;
    return stop;
  });
  const store = createDeveloperProjectStore(load, watch);
  const first = jest.fn();
  const second = jest.fn();
  const offFirst = store.subscribe('one', first);
  const offSecond = store.subscribe('one', second);
  expect(load).toHaveBeenCalledTimes(1);
  expect(watch).toHaveBeenCalledTimes(1);
  store.set('one', linked);
  finish(null);
  await Promise.resolve();
  expect(store.getSnapshot('one').project).toEqual(linked);
  load.mockResolvedValue(null);
  changed();
  await Promise.resolve();
  expect(store.getSnapshot('one').project).toBeNull();
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledTimes(2);
  offFirst();
  offSecond();
  expect(stop).toHaveBeenCalledTimes(1);
});

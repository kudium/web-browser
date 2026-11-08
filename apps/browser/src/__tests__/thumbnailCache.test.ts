import { ThumbnailCache } from '../main/thumbnailCache';

it('evicts the least recently used icon and deduplicates concurrent generation', async () => {
  const cache = new ThumbnailCache(2);
  const load = jest.fn(async () => 'icon');
  const first = cache.get('a', load);
  expect(cache.get('a', load)).toBe(first);
  await first;
  await cache.get('b', load);
  await cache.get('a', load);
  await cache.get('c', load);
  expect(load).toHaveBeenCalledTimes(3);
  await cache.get('b', load);
  expect(load).toHaveBeenCalledTimes(4);
});

it.each(['clear', 'delete'] as const)(
  'invalidates in-flight results on %s and permits a fresh request',
  async (action) => {
    const cache = new ThumbnailCache();
    let complete!: (data: string) => void;
    const old = cache.get(
      'a',
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    await Promise.resolve();
    if (action === 'clear') cache.clear();
    else cache.delete('a');
    const fresh = jest.fn(async () => 'new');
    expect(await cache.get('a', fresh)).toBe('new');
    complete('old');
    expect(await old).toBe('old');
    expect(await cache.get('a', fresh)).toBe('new');
    expect(fresh).toHaveBeenCalledTimes(1);
  }
);

it('does not cache failed or unavailable icons', async () => {
  const cache = new ThumbnailCache();
  const load = jest
    .fn()
    .mockRejectedValueOnce(new Error('missing'))
    .mockResolvedValueOnce(null)
    .mockResolvedValue('icon');
  expect(await cache.get('a', load)).toBeNull();
  expect(await cache.get('a', load)).toBeNull();
  expect(await cache.get('a', load)).toBe('icon');
  expect(load).toHaveBeenCalledTimes(3);
});

it('bounds active generation to four and rejects excess pending IDs', async () => {
  const cache = new ThumbnailCache(5);
  const releases: Array<(value: string) => void> = [];
  const load = jest.fn(
    () =>
      new Promise<string>((resolve) => {
        releases.push(resolve);
      })
  );
  const requests = ['a', 'b', 'c', 'd', 'e'].map((id) => cache.get(id, load));
  expect(await cache.get('excess', load)).toBeNull();
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(4);
  releases[0]('first');
  await requests[0];
  expect(load).toHaveBeenCalledTimes(5);
  releases.slice(1).forEach((release) => release('rest'));
  await Promise.all(requests);
});

it('skips invalidated queued generation before it can read or decode', async () => {
  const cache = new ThumbnailCache();
  const releases: Array<(value: string) => void> = [];
  const load = () =>
    new Promise<string>((resolve) => {
      releases.push(resolve);
    });
  const active = ['a', 'b', 'c', 'd'].map((id) => cache.get(id, load));
  const queued = jest.fn(async () => 'obsolete');
  const request = cache.get('e', queued);
  await Promise.resolve();
  cache.clear();
  expect(await request).toBeNull();
  expect(queued).not.toHaveBeenCalled();
  releases.forEach((release) => release('active'));
  await Promise.all(active);
});

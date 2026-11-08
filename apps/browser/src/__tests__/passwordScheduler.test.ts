import { PasswordSyncScheduler } from '../main/sync/passwordScheduler';

const login = {
  title: 'Example',
  origin: 'https://example.com',
  username: 'user',
  password: 'secret',
};

test('uploads changes while unlocked, skips unchanged data, and resumes after locking', async () => {
  const scheduler = new PasswordSyncScheduler();
  let unlocked = false;
  let items = [login];
  const read = jest.fn(() => items);
  const upload = jest.fn(async () => {});
  const options = { read, upload, current: () => unlocked };
  await scheduler.tick(options);
  expect(read).not.toHaveBeenCalled();
  unlocked = true;
  await scheduler.tick(options);
  await scheduler.tick(options);
  expect(upload).toHaveBeenCalledTimes(1);
  unlocked = false;
  items = [{ ...login, password: 'updated' }];
  await scheduler.tick(options);
  expect(upload).toHaveBeenCalledTimes(1);
  unlocked = true;
  await scheduler.tick(options);
  expect(upload).toHaveBeenCalledTimes(2);
  scheduler.reset();
  await scheduler.tick(options);
  expect(upload).toHaveBeenCalledTimes(3);
});

test('guards in-flight uploads after locking or opting out and retries failures', async () => {
  const scheduler = new PasswordSyncScheduler();
  let allowed = true;
  let guard: () => boolean = () => false;
  let release: () => void = () => {};
  const upload = jest.fn(async (_items, current) => {
    guard = current;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const options = { read: () => [login], upload, current: () => allowed };
  const pending = scheduler.tick(options);
  await scheduler.tick(options);
  expect(upload).toHaveBeenCalledTimes(1);
  allowed = false;
  expect(guard()).toBe(false);
  allowed = true;
  scheduler.reset();
  expect(guard()).toBe(false);
  release();
  await pending;
  upload.mockRejectedValueOnce(new Error('offline'));
  await expect(scheduler.tick(options)).rejects.toThrow('offline');
  upload.mockImplementation(async () => {});
  await scheduler.tick(options);
  expect(upload).toHaveBeenCalledTimes(3);
});

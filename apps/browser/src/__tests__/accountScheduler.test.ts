import { AccountSyncScheduler } from '../main/sync/accountScheduler';

test('remote checks slow down while active and idle', () => {
  const schedule = new AccountSyncScheduler();
  schedule.start(1000);
  expect(schedule.due(31000, false)).toBe(false);
  expect(schedule.due(121000, false)).toBe(true);
  expect(schedule.due(121000, true)).toBe(false);
  expect(schedule.due(601000, true)).toBe(true);
});

test('local changes debounce, cannot starve, and survive changes during an upload', () => {
  const schedule = new AccountSyncScheduler();
  schedule.start(1000);
  schedule.changed(2000);
  expect(schedule.due(3999, true)).toBe(false);
  schedule.changed(3000);
  expect(schedule.due(4999, true)).toBe(false);
  expect(schedule.due(5000, true)).toBe(true);
  const revision = schedule.start(5000);
  schedule.changed(6000);
  schedule.finished(revision, true);
  expect(schedule.due(8000, true)).toBe(true);
  for (let now = 7000; now <= 12000; now += 1000) schedule.changed(now);
  expect(schedule.due(12000, true)).toBe(true);
  schedule.finished(schedule.start(12000), true);
  expect(schedule.due(15000, false)).toBe(false);
});

test('focus and resume are throttled and never bypass failure backoff', () => {
  const schedule = new AccountSyncScheduler();
  schedule.start(1000);
  schedule.wake(2000);
  expect(schedule.due(2000, false)).toBe(false);
  schedule.wake(61000);
  expect(schedule.due(61000, true)).toBe(true);
  expect(schedule.due(61000, true, 121000)).toBe(false);
  expect(schedule.due(121000, true, 121000)).toBe(true);
});

import path from 'path';
import {
  parseDownloadRecords,
  parseDownloadRetrySource,
} from '../main/downloadRecords';

const valid = {
  id: 'one',
  name: 'file.txt',
  path: path.resolve('file.txt'),
  mime: 'text/plain',
  startedAt: 1,
  receivedBytes: 10,
  totalBytes: 10,
  state: 'completed',
};
it('keeps validated siblings and their identity while rejecting duplicate or malformed records', () => {
  const parsed = parseDownloadRecords([
    null,
    valid,
    { ...valid, path: path.resolve('other.txt') },
    { ...valid, id: 'relative', path: '../outside' },
    { ...valid, id: 'bad-size', totalBytes: Infinity },
    { ...valid, id: 'bad-path', path: `${valid.path}\0` },
  ]);
  expect(parsed.damaged).toBe(true);
  expect(parsed.records).toHaveLength(1);
  expect(parsed.records[0]).toMatchObject(valid);
  expect(parseDownloadRecords({ records: [valid] })).toEqual({
    damaged: true,
    records: [],
  });
  expect(
    parseDownloadRecords([{ ...valid, state: 'progressing', paused: true }])
      .records[0],
  ).toMatchObject({ id: 'one', state: 'interrupted', paused: false });
});

it('preserves a healthy record while marking repaired optional fields for recovery', () => {
  const parsed = parseDownloadRecords([
    { ...valid, endedAt: 'invalid', paused: 'invalid', totalBytes: -1 },
  ]);
  expect(parsed.damaged).toBe(true);
  expect(parsed.records[0]).toMatchObject({
    id: 'one',
    endedAt: undefined,
    paused: false,
    totalBytes: 0,
  });
});

it('validates saved retry destinations and strips malformed metadata without losing history', () => {
  const source = { url: 'https://example.test/file#fragment', profile: 'work' };
  expect(parseDownloadRetrySource(source)).toEqual({
    url: 'https://example.test/file',
    profile: 'work',
  });
  for (const url of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:password@example.test/',
    'https://example.test/\n',
  ]) {
    expect(parseDownloadRetrySource({ ...source, url })).toBeUndefined();
  }
  expect(
    parseDownloadRetrySource({ ...source, profile: '../outside' }),
  ).toBeUndefined();
  expect(parseDownloadRetrySource({ url: source.url })).toBeUndefined();
  expect(parseDownloadRetrySource({ url: source.url }, true)).toEqual({
    url: 'https://example.test/file',
  });
  const parsed = parseDownloadRecords([
    { ...valid, state: 'progressing', retrySource: source },
    {
      ...valid,
      id: 'bad-retry',
      retrySource: { ...source, url: 'file:///bad' },
    },
  ]);
  expect(parsed.damaged).toBe(true);
  expect(parsed.records).toHaveLength(2);
  expect(parsed.records[0]).toMatchObject({
    state: 'interrupted',
    retrySource: { url: 'https://example.test/file', profile: 'work' },
  });
  expect(parsed.records[1].retrySource).toBeUndefined();
});

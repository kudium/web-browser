import path from 'path';
import { parseDownloadRecords } from '../main/downloadRecords';

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
      .records[0]
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

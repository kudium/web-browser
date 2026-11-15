import { expect, test } from 'bun:test';
import { boundedChangePage } from '../src/sync';
test('large encrypted chunks are paged below the desktop response limit without losing order', () => {
  const rows = [{revision:1,envelope:{ciphertext:'A'.repeat(7*1024*1024)}},{revision:2,envelope:{ciphertext:'B'.repeat(7*1024*1024)}},{revision:3,envelope:null}];
  expect(boundedChangePage(rows,20).map(row=>row.revision)).toEqual([1]);
  expect(boundedChangePage(rows.slice(1),20).map(row=>row.revision)).toEqual([2,3]);
  expect(boundedChangePage(rows.slice(1),1).map(row=>row.revision)).toEqual([2]);
});

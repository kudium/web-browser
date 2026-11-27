/** @jest-environment node */
import {
  upsertSuggestion,
  listSuggestions,
  runSuggestion,
  removeSuggestions,
  suggestionResult,
} from '../main/hookSuggestions';
import type { WebContents, BrowserWindow } from 'electron';
jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
const source = {
  id: 22,
  isDestroyed: () => false,
  send: jest.fn(),
} as unknown as WebContents;
const owner = {} as BrowserWindow;
let authorized = true;
const binding = {
  source,
  owner,
  token: 'token',
  hookId: 'hook',
  hookName: 'Example',
  groupId: 'a',
  authorized: () => authorized,
};
beforeEach(() => {
  authorized = true;
  removeSuggestions(source);
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-26T12:00:00Z'));
  (source.send as jest.Mock).mockClear();
});
afterEach(() => {
  removeSuggestions(source);
  jest.useRealTimers();
});
const input = { key: 'review', title: 'Review page', actionId: 'review' };
test('upsert deduplicates and keeps suggestions scoped to the owner and approved hook', () => {
  upsertSuggestion(binding, input);
  upsertSuggestion(binding, { ...input, title: 'Updated' });
  expect(listSuggestions(owner, 'a')).toHaveLength(1);
  expect(listSuggestions(owner, 'a')[0].title).toBe('Updated');
  expect(listSuggestions(owner, 'b')).toHaveLength(0);
  expect(listSuggestions({} as BrowserWindow, 'a')).toHaveLength(0);
  authorized = false;
  expect(listSuggestions(owner, 'a')).toHaveLength(0);
});
test('expiry and cleanup remove available actions', () => {
  upsertSuggestion(binding, input);
  jest.advanceTimersByTime(3600001);
  expect(listSuggestions(owner, 'a')).toHaveLength(0);
  upsertSuggestion(binding, input);
  removeSuggestions(source);
  expect(listSuggestions(owner, 'a')).toHaveLength(0);
});
test('successful runs require a matching response and remove the item', async () => {
  const { id } = upsertSuggestion(binding, input);
  const result = runSuggestion(owner, id, 'a');
  const request = (source.send as jest.Mock).mock.calls[0][1];
  expect(() =>
    suggestionResult(source, 'wrong', 'hook', { requestId: request.requestId }),
  ).toThrow();
  suggestionResult(source, 'token', 'hook', { requestId: request.requestId });
  await result;
  expect(listSuggestions(owner, 'a')).toHaveLength(0);
});
test('failed and timed out actions remain queued for retry', async () => {
  const { id } = upsertSuggestion(binding, input);
  const result = runSuggestion(owner, id, 'a');
  const request = (source.send as jest.Mock).mock.calls[0][1];
  suggestionResult(source, 'token', 'hook', {
    requestId: request.requestId,
    error: 'Failed',
  });
  await expect(result).rejects.toThrow('Failed');
  expect(listSuggestions(owner, 'a')).toHaveLength(1);
  const timeout = runSuggestion(owner, id, 'a');
  const assertion = expect(timeout).rejects.toThrow('timed out');
  jest.advanceTimersByTime(10000);
  await assertion;
  expect(listSuggestions(owner, 'a')).toHaveLength(1);
});

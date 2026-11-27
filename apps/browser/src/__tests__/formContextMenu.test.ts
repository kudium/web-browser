import type { WebContents } from 'electron';
import { formContextStateAtPoint, readFormContextState } from '../main/formContextMenu';

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
it('stops at the clicked populated field without scanning other inputs', () => {
  document.body.innerHTML = '<input value="example"><input value="other">';
  const fields = document.querySelectorAll('input');
  fields[0].getClientRects = () => [{}] as any;
  const otherLayout = jest.spyOn(fields[1], 'getClientRects');
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => fields[0] });
  expect(formContextStateAtPoint(0, 0)).toEqual({ hasValue: true, formHasValues: true });
  expect(otherLayout).not.toHaveBeenCalled();
});
it('skips geometry reads for empty fields and stops at the first eligible value', () => {
  document.body.innerHTML = '<form><input><input value="example"><input value="other"></form>';
  const fields = document.querySelectorAll('input');
  const emptyLayout = jest.spyOn(fields[0], 'getClientRects');
  const otherLayout = jest.spyOn(fields[2], 'getClientRects');
  fields[1].getClientRects = () => [{}] as any;
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => fields[0] });
  expect(formContextStateAtPoint(0, 0)).toEqual({ hasValue: false, formHasValues: true });
  expect(emptyLayout).not.toHaveBeenCalled(); expect(otherLayout).not.toHaveBeenCalled();
});
it('releases the context menu after 60ms even if the renderer never answers', async () => {
  jest.useFakeTimers();
  const contents = { isDestroyed: () => false, executeJavaScriptInIsolatedWorld: jest.fn(() => new Promise(() => {})) } as unknown as WebContents;
  const result = readFormContextState(contents, 0, 0);
  jest.advanceTimersByTime(60);
  await expect(result).resolves.toEqual({ hasValue: false, formHasValues: false });
  expect(contents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
it('clears the deadline after a fast response and falls back safely after failure', async () => {
  jest.useFakeTimers();
  const execute = jest.fn().mockResolvedValueOnce({ hasValue: true, formHasValues: true }).mockRejectedValueOnce(new Error('Renderer unavailable'));
  const contents = { isDestroyed: () => false, executeJavaScriptInIsolatedWorld: execute } as unknown as WebContents;
  await expect(readFormContextState(contents, 0, 0)).resolves.toEqual({ hasValue: true, formHasValues: true });
  expect(jest.getTimerCount()).toBe(0);
  await expect(readFormContextState(contents, 0, 0)).resolves.toEqual({ hasValue: false, formHasValues: false });
  expect(jest.getTimerCount()).toBe(0);
});

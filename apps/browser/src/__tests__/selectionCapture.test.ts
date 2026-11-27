/** @jest-environment node */
import { captureSelectedText } from '../main/selectionCapture';
import type { WebContents } from 'electron';
test('a hung capture returns at its deadline and does not wait for a busy page', async () => {
  jest.useFakeTimers();
  try {
    const execute=jest.fn(()=>new Promise(()=>{}));
    const pending=captureSelectedText({isDestroyed:()=>false,executeJavaScriptInIsolatedWorld:execute} as unknown as WebContents,'Selected');
    await jest.advanceTimersByTimeAsync(100);
    expect(await pending).toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  } finally {jest.useRealTimers();}
});
test('rejects a changed selection returned by the page', async () => {
  const contents={isDestroyed:()=>false,executeJavaScriptInIsolatedWorld:async()=>({text:'Other',markdown:'Other'})} as unknown as WebContents;
  expect(await captureSelectedText(contents,'Selected')).toBeUndefined();
});

import { WebContents } from 'electron';

/** Fail closed: editors, embedded frames and unload handlers remain resident. */
export async function inspectDiscardCandidate(
  contents: WebContents
): Promise<{ x: number; y: number } | undefined> {
  if (contents.debugger.isAttached()) return undefined;
  try {
    contents.debugger.attach('1.3');
    const command = (method: string, params: Record<string, unknown>) =>
      new Promise<any>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Discard inspection timed out')),
          3000
        );
        contents.debugger
          .sendCommand(method, params)
          .then(resolve, reject)
          .finally(() => clearTimeout(timer))
          .catch(() => {});
      });
    const { result: windowObject } = await command('Runtime.evaluate', {
      expression: 'window',
    });
    if (!windowObject.objectId) return undefined;
    const { listeners } = await command('DOMDebugger.getEventListeners', {
      objectId: windowObject.objectId,
    });
    if (
      listeners.some(
        (listener: { type: string }) => listener.type === 'beforeunload'
      )
    )
      return undefined;
    const { result, exceptionDetails } = await command('Runtime.evaluate', {
      expression: `(() => {
        if (window.onbeforeunload || document.querySelector('input, textarea, select, [contenteditable]:not([contenteditable="false"]), iframe, frame, canvas')) return null;
        if (Array.from(document.querySelectorAll('audio, video')).some(media => !media.paused && !media.ended)) return null;
        return {x: window.scrollX, y: window.scrollY};
      })()`,
      returnByValue: true,
    });
    if (
      exceptionDetails ||
      !result.value ||
      !Number.isFinite(result.value.x) ||
      !Number.isFinite(result.value.y)
    )
      return undefined;
    return result.value;
  } catch {
    return undefined;
  } finally {
    // Never detach an existing debugger: only our own attachment reaches here.
    if (contents.debugger.isAttached()) contents.debugger.detach();
  }
}

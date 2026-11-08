import type { WebContents } from 'electron';

export const AI_PROTOCOL_TIMEOUT = 15000;
export type AIProtocolSend = (
  method: string,
  parameters?: Record<string, unknown>,
  sessionId?: string
) => Promise<any>;
export interface AIPointerActivity {
  x: number;
  y: number;
  type: string;
}
const pointerObservers = new WeakMap<
  WebContents,
  Set<(point: AIPointerActivity) => void>
>();

/** Presentation only: observe trusted AI input, never website events. */
export function observeAIPointer(
  contents: WebContents,
  observer: (point: AIPointerActivity) => void
) {
  const observers = pointerObservers.get(contents) || new Set();
  observers.add(observer);
  pointerObservers.set(contents, observers);
  return () => {
    observers.delete(observer);
  };
}

export function reportAIPointer(
  contents: WebContents,
  parameters: Record<string, unknown>
) {
  if (!Number.isFinite(parameters.x) || !Number.isFinite(parameters.y)) return;
  pointerObservers.get(contents)?.forEach((observer) => {
    try {
      observer({
        x: Number(parameters.x),
        y: Number(parameters.y),
        type: String(parameters.type),
      });
    } catch {
      /* Presentation must never interrupt browser input. */
    }
  });
}

const sessions = new WeakMap<
  WebContents,
  { signal: AbortSignal; send: AIProtocolSend }
>();
const cleanups = new WeakMap<WebContents, Promise<void>>();

/** Abort the controller first, then await its bounded pointer/debugger cleanup. */
export function settleAIProtocol(contents: WebContents): Promise<void> {
  return cleanups.get(contents) ?? Promise.resolve();
}

// Own one short-lived session; never detach a replacement debugger.
export async function withAIProtocol<T>(
  contents: WebContents,
  signal: AbortSignal,
  execute: (
    send: (
      method: string,
      parameters?: Record<string, unknown>,
      sessionId?: string
    ) => Promise<any>
  ) => Promise<T>,
  options: { timeoutMs?: number } = {}
): Promise<T> {
  signal.throwIfAborted();
  const shared = sessions.get(contents);
  if (shared && shared.signal === signal) return execute(shared.send);
  if (contents.debugger.isAttached())
    throw new Error(
      'This tab is being debugged. Close its debugger before protocol actions.'
    );
  contents.debugger.attach('1.3');
  let owned = true;
  let pressed: Record<string, unknown> | undefined;
  let pressedSession: string | undefined;
  const heldKeys = new Map<
    string,
    { parameters: Record<string, unknown>; sessionId?: string }
  >();
  const keyIdentity = (
    parameters: Record<string, unknown>,
    sessionId?: string
  ) =>
    JSON.stringify([
      sessionId,
      parameters.code || parameters.key,
      parameters.windowsVirtualKeyCode,
      parameters.nativeVirtualKeyCode,
      parameters.location,
    ]);
  let rejectSession: (reason: Error) => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectSession = reject;
  });
  let interceptingDrag = false;
  let interceptSession: string | undefined;
  let detached = false;
  let detaching: Promise<void> | undefined;
  const detach = (): Promise<void> => {
    if (detaching) return detaching;
    if (!owned) return Promise.resolve();
    owned = false;
    const cleanup: Promise<unknown>[] = [];
    const cleanupCommand = (
      method: string,
      parameters?: Record<string, unknown>,
      sessionId?: string
    ) => {
      try {
        return contents.debugger.sendCommand(method, parameters, sessionId);
      } catch (error) {
        return Promise.reject(error);
      }
    };

    if (
      (pressed || interceptingDrag || heldKeys.size) &&
      !contents.isDestroyed() &&
      contents.debugger.isAttached()
    ) {
      if (interceptingDrag && pressed)
        cleanup.push(
          cleanupCommand(
            'Input.dispatchDragEvent',
            {
              type: 'dragCancel',
              x: pressed.x,
              y: pressed.y,
              data: { items: [], dragOperationsMask: 0 },
            },
            pressedSession
          )
        );
      if (pressed || interceptingDrag)
        cleanup.push(
          cleanupCommand(
            'Input.cancelDragging',
            undefined,
            interceptingDrag ? interceptSession : pressedSession
          )
        );
      if (interceptingDrag)
        cleanup.push(
          cleanupCommand(
            'Input.setInterceptDrags',
            { enabled: false },
            interceptSession
          )
        );
      if (pressed)
        cleanup.push(
          cleanupCommand(
            'Input.dispatchMouseEvent',
            {
              ...pressed,
              type: 'mouseReleased',
              buttons: 0,
              clickCount: 0,
            },
            pressedSession
          )
        );
      pressed = undefined;
      // Release only keys owned by this session; never replay text or commands.
      Array.from(heldKeys.values())
        .reverse()
        .forEach((key) => {
          cleanup.push(
            cleanupCommand(
              'Input.dispatchKeyEvent',
              key.parameters,
              key.sessionId
            )
          );
        });
      heldKeys.clear();
    }
    const finish = () => {
      if (
        !detached &&
        !contents.isDestroyed() &&
        contents.debugger.isAttached()
      )
        contents.debugger.detach();
    };
    if (!cleanup.length) {
      finish();
      return Promise.resolve();
    }
    detaching = (async () => {
      let timer!: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([
          Promise.allSettled(cleanup),
          new Promise((resolve) => {
            timer = setTimeout(resolve, 250);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        finish();
      }
    })();
    cleanups.set(contents, detaching);
    const completed = detaching;
    completed
      .finally(() => {
        if (cleanups.get(contents) === completed) cleanups.delete(contents);
      })
      .catch(() => {});
    return detaching;
  };
  const onDetached = () => {
    detached = true;
    if (!owned) return;
    owned = false;
    rejectSession(new Error('Browser protocol session disconnected.'));
  };
  const abort = () => {
    detach().catch(() => {});
    rejectSession(new Error('Stopped.'));
  };
  const timer = setTimeout(() => {
    detach().catch(() => {});
    rejectSession(new Error('Browser protocol action timed out.'));
  }, options.timeoutMs ?? AI_PROTOCOL_TIMEOUT);
  contents.debugger.on('detach', onDetached);
  signal.addEventListener('abort', abort, { once: true });
  const check = () => {
    signal.throwIfAborted();
    if (!owned) throw new Error('Browser protocol session ended.');
  };
  try {
    if (signal.aborted) abort();
    const send: AIProtocolSend = async (method, parameters, sessionId) => {
      check();
      if (
        method === 'Input.dispatchKeyEvent' &&
        parameters &&
        ['keyDown', 'rawKeyDown'].includes(String(parameters.type))
      ) {
        const identity = keyIdentity(parameters, sessionId);
        if (!heldKeys.has(identity) && heldKeys.size >= 64)
          throw new Error('Too many held browser keys.');
        const release: Record<string, unknown> = {
          type: 'keyUp',
          modifiers: 0,
        };
        [
          'key',
          'code',
          'windowsVirtualKeyCode',
          'nativeVirtualKeyCode',
          'location',
          'isKeypad',
        ].forEach((field) => {
          if (parameters[field] !== undefined)
            release[field] = parameters[field];
        });
        // Track before dispatch: Stop can arrive while acknowledgement is pending.
        heldKeys.set(identity, { parameters: release, sessionId });
      }
      if (
        method === 'Input.dispatchMouseEvent' &&
        parameters?.type === 'mousePressed'
      ) {
        pressedSession = sessionId;
        pressed = {
          x: parameters.x,
          y: parameters.y,
          button: parameters.button,
        };
      }
      if (method === 'Input.setInterceptDrags') {
        if (parameters?.enabled === true) {
          interceptingDrag = true;
          interceptSession = sessionId;
        } else if (!pressed) interceptingDrag = false;
      }
      if (
        !sessionId &&
        (method === 'Input.dispatchMouseEvent' ||
          method === 'Input.dispatchDragEvent')
      )
        reportAIPointer(contents, parameters || {});
      const result = await contents.debugger.sendCommand(
        method,
        parameters,
        sessionId
      );
      if (method === 'Input.dispatchKeyEvent' && parameters?.type === 'keyUp')
        heldKeys.delete(keyIdentity(parameters, sessionId));
      if (
        method === 'Input.dispatchMouseEvent' &&
        parameters?.type === 'mouseReleased'
      )
        pressed = undefined;
      check();
      return result;
    };
    sessions.set(contents, { signal, send });
    const work = Promise.resolve().then(() => {
      check();
      return execute(send);
    });
    return await Promise.race([work, cancelled]);
  } finally {
    if (sessions.get(contents)?.signal === signal) sessions.delete(contents);
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    await detach();
    contents.debugger.removeListener('detach', onDetached);
  }
}

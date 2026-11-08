import type { WebContents } from 'electron';
import type { AIProtocolSend } from './aiProtocol';
import type { AIDialogLifecycle } from './aiDialogs';

/** Capture Chromium's actual drag data instead of manufacturing DOM drag events. */
export async function interceptAIHTMLDrag(
  contents: WebContents,
  send: AIProtocolSend,
  signal: AbortSignal,
  trigger: () => Promise<void>,
  drop: (data: Record<string, unknown>) => Promise<void>,
  lifecycle?: AIDialogLifecycle
) {
  let triggered = false;
  let captured = false;
  let invalid = false;
  let resolveData!: (data: Record<string, unknown>) => void;
  let rejectData!: (error: Error) => void;
  const data = new Promise<Record<string, unknown>>((resolve, reject) => {
    resolveData = resolve;
    rejectData = reject;
  });
  data.catch(() => {});
  const events = (_event: unknown, method: string, params: any) => {
    if (method !== 'Input.dragIntercepted') return;
    if (!triggered || captured) {
      invalid = true;
      rejectData(new Error('Native drag changed. Read before retrying.'));
      return;
    }
    captured = true;
    if (
      !Array.isArray(params.data?.items) ||
      params.data.items.length > 100 ||
      JSON.stringify(params.data).length > 1024 * 1024 ||
      params.data.files?.length
    )
      rejectData(
        new Error(
          'Native drag payload is unsupported or exceeds its limit. External file dragging requires separate file approval.'
        )
      );
    else resolveData(params.data);
  };
  let rejectStopped!: (error: Error) => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    rejectStopped = reject;
  });
  stopped.catch(() => {});
  const abort = () => {
    const error = new Error('Stopped.');
    rejectData(error);
    rejectStopped(error);
  };
  let timer!: ReturnType<typeof setTimeout>;
  let remaining = 5000;
  let started = Date.now();
  const arm = () => {
    started = Date.now();
    timer = setTimeout(
      () =>
        rejectData(
          new Error(
            'HTML drag did not start. Earlier effects may have occurred; read before retrying.'
          )
        ),
      remaining
    );
  };
  arm();
  const disposeLifecycle = lifecycle?.onChange((pending) => {
    clearTimeout(timer);
    if (pending) remaining = Math.max(0, remaining - (Date.now() - started));
    else if (!captured) arm();
  });
  contents.debugger.on('message', events);
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    await Promise.race([
      send('Input.setInterceptDrags', { enabled: true }),
      stopped,
    ]);
    triggered = true;
    await Promise.race([trigger(), stopped]);
    const payload = await data;
    clearTimeout(timer);
    signal.throwIfAborted();
    if (invalid) throw new Error('Native drag changed. Read before retrying.');
    await Promise.race([drop(payload), stopped]);
  } finally {
    clearTimeout(timer);
    disposeLifecycle?.();
    signal.removeEventListener('abort', abort);
    contents.debugger.removeListener('message', events);
    await send('Input.cancelDragging').catch(() => {});
    await send('Input.setInterceptDrags', { enabled: false }).catch(() => {});
  }
}

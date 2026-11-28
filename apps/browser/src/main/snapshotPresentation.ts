import { randomUUID } from 'crypto';
import type { BrowserWindow, WebContentsView } from 'electron';
import type { BrowserSnapshot } from '../browser/contracts';

/** Capture every docked surface at its own bounds, without stretching the page
 * into an inspector's slot. All frames retain the owning tab's access scope. */
export async function captureNativeViewSnapshots(
  id: string,
  sources: { view: WebContentsView; surface?: 'devtools' }[],
  options: {
    bounds?: Omit<BrowserSnapshot, 'id' | 'image'>;
    previewOnly?: boolean;
    /** A mirrored page is painted into this window's slot, not its owner's coordinates. */
    useSlotBounds?: boolean;
  } = {},
): Promise<BrowserSnapshot[]> {
  const frames = await Promise.all(
    sources.map(async ({ view, surface }) => {
      try {
        if (
          view.webContents.isDestroyed() ||
          (view.getVisible && !view.getVisible() && !options.previewOnly)
        )
          return undefined;
        const bounds = options.useSlotBounds
          ? options.bounds
          : (view.getBounds?.() ?? options.bounds);
        if (!bounds) return undefined;
        const capture = await withinSnapshotDeadline(
          view.webContents.capturePage(),
          80,
        );
        if (!capture || view.webContents.isDestroyed()) return undefined;
        return {
          id,
          surface,
          ...bounds,
          previewOnly: options.previewOnly,
          image: (options.previewOnly
            ? capture.resize({ width: 480 })
            : capture
          ).toDataURL(),
        };
      } catch {
        return undefined;
      }
    }),
  );
  return frames.filter((frame): frame is NonNullable<typeof frame> => !!frame);
}

/** An unresponsive page or renderer must not hold an overlay reveal indefinitely. */
export function withinSnapshotDeadline<T>(
  work: Promise<T>,
  milliseconds?: number,
): Promise<T | undefined> {
  if (milliseconds === undefined) return work;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), milliseconds);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Keep the live view until React has decoded and painted its replacement. */
export async function presentSnapshots(
  window: BrowserWindow,
  frames: BrowserSnapshot[],
  options?: { selector: string; publish: (frames: BrowserSnapshot[]) => void },
  deadlineMs?: number,
) {
  if (window.isDestroyed()) return;
  const presentationId = randomUUID();
  const presented = frames.map((frame) => ({ ...frame, presentationId }));
  if (options) options.publish(presented);
  else window.webContents.send('browser-snapshots', presented);
  const count = frames.filter((frame) => !frame.previewOnly).length;
  if (!count) return;
  await withinSnapshotDeadline(
    window.webContents
      .executeJavaScript(
        `new Promise(resolve => {
    let finished = false, decoding = false;
    const finish = () => { if (finished) return; finished = true; observer.disconnect(); clearTimeout(timeout); resolve(); };
    const check = () => {
      if (decoding || finished) return;
      const images = [...document.querySelectorAll(${JSON.stringify(options?.selector || '.browser-snapshot')})].filter(image => image.dataset.presentationId === ${JSON.stringify(
        presentationId,
      )});
      if (images.length < ${count}) return;
      decoding = true;
      Promise.all(images.map(image => image.decode().catch(() => {}))).then(() => requestAnimationFrame(${deadlineMs === undefined ? '() => requestAnimationFrame(finish)' : 'finish'}));
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['src', 'data-presentation-id']});
    const timeout = setTimeout(finish, ${deadlineMs ?? 2000});
    check();
  })`,
      )
      .catch(() => {}),
    deadlineMs,
  );
}

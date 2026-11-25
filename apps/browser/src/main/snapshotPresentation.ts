import { randomUUID } from 'crypto';
import type { BrowserWindow } from 'electron';
import type { BrowserSnapshot } from '../browser/contracts';

/** Keep the live view until React has decoded and painted its replacement. */
export async function presentSnapshots(
  window: BrowserWindow,
  frames: BrowserSnapshot[],
  options?: { selector: string; publish: (frames: BrowserSnapshot[]) => void }
) {
  if (window.isDestroyed()) return;
  const presentationId = randomUUID();
  const presented = frames.map((frame) => ({ ...frame, presentationId }));
  if (options) options.publish(presented);
  else window.webContents.send('browser-snapshots', presented);
  const count = frames.filter((frame) => !frame.previewOnly).length;
  if (!count) return;
  await window.webContents
    .executeJavaScript(
      `new Promise(resolve => {
    let finished = false, decoding = false;
    const finish = () => { if (finished) return; finished = true; observer.disconnect(); clearTimeout(timeout); resolve(); };
    const check = () => {
      if (decoding || finished) return;
      const images = [...document.querySelectorAll(${JSON.stringify(options?.selector || '.browser-snapshot')})].filter(image => image.dataset.presentationId === ${JSON.stringify(
        presentationId
      )});
      if (images.length < ${count}) return;
      decoding = true;
      Promise.all(images.map(image => image.decode().catch(() => {}))).then(() => requestAnimationFrame(() => requestAnimationFrame(finish)));
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['src', 'data-presentation-id']});
    const timeout = setTimeout(finish, 2000);
    check();
  })`
    )
    .catch(() => {});
}

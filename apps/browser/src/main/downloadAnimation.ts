import { BrowserWindow, screen, WebContents } from 'electron';

/** A non-interactive native overlay can cross the webpage and browser chrome. */
export async function animateDownload(
  contents: WebContents,
  pointer = screen.getCursorScreenPoint()
) {
  const owner = BrowserWindow.getAllWindows().find(
    (window) =>
      window.webContents === contents ||
      window.contentView.children.some(
        (view) => 'webContents' in view && view.webContents === contents
      )
  );
  if (!owner || owner.isDestroyed() || !owner.isFocused()) return;
  // Allow the download notification to render the footer button first.
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
  if (owner.isDestroyed()) return;
  const target = await owner.webContents.executeJavaScript(`(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const button = document.querySelector('.space-downloads-button') || document.querySelector('.system-space-button');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, primary: getComputedStyle(button).getPropertyValue('--kudium-primary').trim() };
  })()`);
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y))
    return;
  const bounds = owner.getContentBounds();
  const x = pointer.x - bounds.x;
  const y = pointer.y - bounds.y;
  if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return;
  const overlay = new BrowserWindow({
    ...bounds,
    parent: owner,
    frame: false,
    transparent: true,
    show: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.setIgnoreMouseEvents(true);
  const primary = /^#[0-9a-f]{6}$/i.test(target.primary || '')
    ? target.primary
    : '#5aaca8';
  const dx = target.x - x;
  const dy = target.y - y;
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden"><div id="flight" style="position:absolute;left:${
    x - 18
  }px;top:${
    y - 18
  }px;width:36px;height:36px;border-radius:50%;background:${primary};color:white;display:grid;place-items:center;box-shadow:0 3px 14px #0005"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/></svg></div><div id="ripple" style="position:absolute;left:${
    target.x - 16
  }px;top:${
    target.y - 16
  }px;width:32px;height:32px;border:2px solid ${primary};border-radius:50%;box-sizing:border-box;opacity:0"></div></body></html>`;
  overlay.once('ready-to-show', () => {
    if (owner.isDestroyed()) {
      overlay.destroy();
      return;
    }
    overlay.showInactive();
    overlay.webContents
      .executeJavaScript(
        `
      document.getElementById('flight').animate([
        { transform:'translate(0,0) scale(1)', opacity:1, offset:0 },
        { transform:'translate(${dx * 0.35}px,${
          dy * 0.25 - 55
        }px) scale(1.05)', opacity:1, offset:.35 },
        { transform:'translate(${dx}px,${
          dy - 28
        }px) scale(.65,1.1)', opacity:1, offset:.82 },
        { transform:'translate(${dx}px,${dy}px) scale(.65,.3)', opacity:.8, offset:.94 },
        { transform:'translate(${dx}px,${dy}px) scale(.15)', opacity:0, offset:1 }
      ], { duration:1100, easing:'cubic-bezier(.3,.05,.4,1)', fill:'forwards' });
      document.getElementById('ripple').animate([
        { transform:'scale(.45)',opacity:0 },
        { transform:'scale(.8)',opacity:.8,offset:.15 },
        { transform:'scale(1.7)',opacity:0 }
      ], { duration:450,delay:1000,fill:'forwards' });
    `
      )
      .catch(() => {});
    setTimeout(() => {
      if (!overlay.isDestroyed()) overlay.destroy();
    }, 1550);
  });
  await overlay
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .catch(() => {
      if (!overlay.isDestroyed()) overlay.destroy();
    });
}

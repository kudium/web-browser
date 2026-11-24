import { usesNativeGlass, nativeGlassSurfaceTokens } from './nativeGlass';
import { BrowserWindow, nativeTheme } from 'electron';

export type AppToast = {
  id: string;
  title: string;
  message: string;
  type?: 'info' | 'warn' | 'success' | 'error';
  tone?: 'info' | 'success' | 'warning' | 'error';
  durationMs?: number;
  onDismiss?: () => void | Promise<void>;
  action?: { label: string; run: () => void | Promise<void> };
};

type ToastEntry = { id: string; dismiss: (user?: boolean) => void; update: () => void; height: number; ready: boolean; window: BrowserWindow };
const ownerCleanup = new Map<number, () => void>();
const active = new Map<number, ToastEntry[]>();
const refresh = (owner: BrowserWindow) => active.get(owner.id)?.forEach(entry => entry.update());
const dismissAll = (owner: BrowserWindow, user = false) => [...(active.get(owner.id) || [])].forEach(entry => entry.dismiss(user));
export function dismissAppToast(id: string) {
  for (const stack of active.values()) stack.find(entry => entry.id === id)?.dismiss();
}
/** A small native overlay remains above WebContentsViews without hiding them. */
export async function showAppToast(owner: BrowserWindow, toast: AppToast) {
  if (owner.isDestroyed()) return;
  const tone = toast.type === 'warn' ? 'warning' : toast.type || toast.tone || 'info';
  if (!toast.id || toast.title.length > 120 || toast.message.length > 500)
    throw new Error('Invalid toast');
  active.get(owner.id)?.find(entry => entry.id === toast.id)?.dismiss();
  const window = new BrowserWindow({
    parent: owner, show: false, frame: false, transparent: true,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, hasShadow: true,
    backgroundColor: '#00000000',
    ...(process.platform === 'darwin' && {
      vibrancy: usesNativeGlass() ? ('popover' as const) : undefined,
      visualEffectState: 'followWindow' as const,
    }),
    width: 340, height: 100,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const defaultDuration = toast.action ? 10000 : 5000;
  const duration = toast.durationMs === undefined ? defaultDuration : Math.max(100, Math.min(toast.durationMs, 60000));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  const dismiss = (user = false) => {
    if (window.isDestroyed()) return;
    window.destroy();
    if (user && toast.onDismiss) void Promise.resolve().then(toast.onDismiss).catch(() => {});
  };
  const entry: ToastEntry = { id: toast.id, dismiss, update: () => {}, height: 100, ready: false, window };
  const entries = active.get(owner.id) || [];
  entries.push(entry);
  active.set(owner.id, entries);
  const position = () => {
    if (window.isDestroyed() || owner.isDestroyed() || !entry.ready) return;
    const bounds = owner.getContentBounds();
    const stack = active.get(owner.id) || [];
    const index = stack.indexOf(entry);
    const preceding = stack.slice(0, index);
    const offset = preceding.reduce((sum, item) => sum + item.height + 8, 0);
    const width = Math.min(340, Math.max(180, bounds.width - 48));
    const fits = index < 3 && preceding.every(item => item.ready) &&
      (index === 0 || 52 + offset + entry.height <= bounds.height - 24);
    window.setBounds({ x: Math.round(bounds.x + bounds.width - width - 32), y: bounds.y + 52 + offset, width, height: entry.height });
    void window.webContents.executeJavaScript(`document.querySelector('.dismiss-all').hidden=${!(index === 0 && stack.length > 1)};undefined`).catch(() => {});
    if (!fits || !owner.isVisible() || owner.isMinimized()) { window.hide(); return; }
    window.showInactive();
    if (!started) {
      started = true;
      void window.webContents.executeJavaScript(`document.body.style.setProperty('--toast-duration',${JSON.stringify(`${duration}ms`)});document.body.classList.add('counting');undefined`).catch(() => {});
      timer = setTimeout(dismiss, duration);
      timer.unref();
    }
  };
  entry.update = position;
  if (!ownerCleanup.has(owner.id)) {
    const layout = () => refresh(owner);
    const hide = () => active.get(owner.id)?.forEach(item => { if (!item.window.isDestroyed()) item.window.hide(); });
    const close = () => dismissAll(owner);
    owner.on('move', layout); owner.on('resize', layout);
    owner.on('hide', hide); owner.on('minimize', hide);
    owner.on('show', layout); owner.on('restore', layout);
    owner.once('closed', close);
    ownerCleanup.set(owner.id, () => {
      owner.removeListener('move', layout); owner.removeListener('resize', layout);
      owner.removeListener('hide', hide); owner.removeListener('minimize', hide);
      owner.removeListener('show', layout); owner.removeListener('restore', layout);
      owner.removeListener('closed', close);
      ownerCleanup.delete(owner.id);
    });
  }
  window.once('closed', () => {
    clearTimeout(timer);
    const stack = active.get(owner.id);
    if (stack) {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      if (!stack.length) { active.delete(owner.id); ownerCleanup.get(owner.id)?.(); }
      else refresh(owner);
    }
  });
  let actionUsed = false;
  window.webContents.on('console-message', (event) => {
    if (event.message === 'kudium-toast-dismiss-all') { dismissAll(owner, true); return; }
    if (event.message === 'kudium-toast-dismiss') { dismiss(true); return; }
    if (event.message !== 'kudium-toast-action' || actionUsed || !toast.action) return;
    actionUsed = true;
    const run = toast.action.run;
    dismiss();
    void Promise.resolve().then(run).catch(() => {});
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'none'"><style>
${nativeGlassSurfaceTokens}
html,body{margin:0;background:transparent;overflow:hidden;border-radius:12px}body{padding:6px;box-sizing:border-box;font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
#toast{position:relative;display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:12px;background:#fafafa;color:#202124;border:0;box-shadow:0 3px 8px #0002}body.dark #toast{background:#29292c;color:#f5f5f5;}
body.glass #toast{background:#ffffff0f;box-shadow:0 2px 7px #0000000d}body.dark.glass #toast{background:#18181a14;box-shadow:0 2px 7px #00000014}
@media(prefers-reduced-transparency:reduce),(prefers-contrast:more){body.glass #toast{background:#fafafa;backdrop-filter:none;-webkit-backdrop-filter:none}body.dark.glass #toast{background:#29292c}}
#icon{display:grid;place-items:center;flex:0 0 16px;color:#727780}#icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}body[data-tone=info] #icon{color:#588cdc}body[data-tone=warning] #icon{color:#b77b10}body[data-tone=error] #icon{color:#d45049}body[data-tone=success] #icon{color:#3b9860}
.copy{padding-right:12px;flex:1;min-width:0;overflow-wrap:anywhere}.title-row{display:flex;align-items:center;gap:6px;min-height:18px}#title{font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dismiss-all{width:auto;height:18px;flex:none;border-radius:5px;padding:0 5px;font:inherit;font-size:10px;opacity:.75}.dismiss-all[hidden]{display:none}#message{opacity:.78;font-size:11px;line-height:1.35}.action{display:inline-block;width:auto;height:24px;margin-top:6px;padding:0 8px;border:0;border-radius:6px;background:#8881;font:inherit;font-weight:500}.action[hidden]{display:none}button{position:relative;display:grid;place-items:center;flex:0 0 26px;width:26px;height:26px;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer;padding:0}button:hover{background:#8882}button:focus-visible{outline:2px solid #5a91ed}
.dismiss{position:absolute;top:-6px;right:-6px;background:#fafafa;border:0;box-shadow:0 1px 4px #0002}body.dark .dismiss{background:#29292c;}body.glass .dismiss{background:#ffffff18}body.dark.glass .dismiss{background:#28282a26}
@media(prefers-reduced-transparency:reduce),(prefers-contrast:more){body.glass .dismiss{background:#fafafa}body.dark.glass .dismiss{background:#29292c}}
.dismiss .countdown{position:absolute;inset:2px;width:22px;height:22px;pointer-events:none;transform:rotate(-90deg)}.countdown circle{fill:none;stroke:currentColor;stroke-width:1}.countdown .track{opacity:.08}.countdown .remaining{opacity:.4;stroke-dasharray:1;stroke-dashoffset:0;stroke-linecap:round}body.counting .remaining{animation:toast-countdown var(--toast-duration) linear forwards}@keyframes toast-countdown{to{stroke-dashoffset:1}}@media(prefers-reduced-motion:reduce){body.counting .remaining{animation-timing-function:steps(20,end)}}
</style><div id="toast" role="status" aria-live="polite"><span id="icon" aria-hidden="true">!</span><div class="copy"><div class="title-row"><div id="title"></div><button class="dismiss-all" hidden aria-label="Dismiss all notifications">Dismiss all</button></div><div id="message"></div><button class="action" hidden></button></div><button class="dismiss" aria-label="Dismiss notification" title="Dismiss notification"><svg class="countdown" viewBox="0 0 24 24" aria-hidden="true"><circle class="track" cx="12" cy="12" r="10"/><circle class="remaining" cx="12" cy="12" r="10" pathLength="1"/></svg><svg class="close-mark" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m3 3 6 6m0-6-6 6"/></svg></button></div>`;
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (window.isDestroyed() || owner.isDestroyed()) return;
    position();
    const height = await window.webContents.executeJavaScript(`(()=>{
      document.body.className=${JSON.stringify([nativeTheme.shouldUseDarkColors ? 'dark' : '', usesNativeGlass() ? 'glass' : ''].filter(Boolean).join(' '))};
      document.body.dataset.tone=${JSON.stringify(tone)};
      document.getElementById('title').textContent=${JSON.stringify(toast.title)};
      document.getElementById('message').textContent=${JSON.stringify(toast.message)};
      document.getElementById('icon').innerHTML=${JSON.stringify('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/>' + (tone === 'success' ? '<path d="m8 12 3 3 5-6"/>' : tone === 'info' ? '<path d="M12 11v6m0-10h.01"/>' : '<path d="M12 7v6m0 3h.01"/>') + '</svg>')};
      const action=document.querySelector('.action');
      action.hidden=${JSON.stringify(!toast.action)};
      action.textContent=${JSON.stringify(toast.action?.label || '')};
      action.addEventListener('click',()=>console.info('kudium-toast-action'));
      document.querySelector('.dismiss-all').addEventListener('click',()=>console.info('kudium-toast-dismiss-all'));
      document.querySelector('.dismiss').addEventListener('click',()=>console.info('kudium-toast-dismiss'));
      document.addEventListener('keydown',event=>{if(event.key==='Escape')console.info('kudium-toast-dismiss')});
      return Math.ceil(document.getElementById('toast').getBoundingClientRect().height)+12;
    })()`);
    if (window.isDestroyed() || owner.isDestroyed()) return;
    entry.height = height;
    entry.ready = true;
    refresh(owner);
  } catch {
    dismiss();
  }
}

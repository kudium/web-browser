import { BrowserWindow, screen } from 'electron';
import { onWindowClosed } from './windowLifecycle';
import type { NativeTooltipRequest } from '../browser/nativeUi';
import { usesNativeGlass } from './nativeGlass';

const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'"><style>
html,body{margin:0;background:transparent;overflow:hidden;border-radius:10px}
body{width:320px;padding:6px;box-sizing:border-box;font:12px/18px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
#hint{display:inline-block;box-sizing:border-box;max-width:288px;overflow-wrap:anywhere;padding:6px 10px;border:1px solid #0002;border-radius:7px;background:#f7f7f7;color:#202124;box-shadow:0 2px 5px #0003}
body.dark #hint{background:#303033;color:#f5f5f5;border-color:#ffffff20}
body.footer{padding:0;border-radius:4px}
body.footer #hint{display:block;width:max-content;font-size:11px;line-height:16px;padding:2px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:4px;background:#dce6f0;color:#394c62;border-color:#607b9926;box-shadow:none}
body.dark.footer #hint{background:#c8d6e5;color:#293f58;border-color:#607b9926}
/* One translucent surface; no separate native material around the URL. */
body.glass #hint{background:#dce6f0f0}
body.dark.glass #hint{background:#c8d6e5f0}
@media(prefers-reduced-transparency:reduce),(prefers-contrast:more){body.glass #hint{background:#dce6f0;color:#293f58}body.dark.glass #hint{background:#c8d6e5;color:#20344d}}
</style><div id="hint"></div>`;

export function validateTooltip(value: NativeTooltipRequest, labelLimit = 300) {
  if (!value || typeof value.id !== 'string' || value.id.length > 100)
    throw new Error('Invalid tooltip');
  if (value.label === undefined) return;
  const { anchor } = value;
  if (
    typeof value.label !== 'string' ||
    value.label.length > labelLimit ||
    !anchor ||
    ![anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isFinite) ||
    anchor.width < 0 ||
    anchor.height < 0 ||
    (value.dark !== undefined && typeof value.dark !== 'boolean')
  )
    throw new Error('Invalid tooltip');
}

/**
 * A mouse-transparent child window stays above native pages without replacing
 * them.
 */
export class NativeTooltip {
  private window?: BrowserWindow;

  private ready?: Promise<void>;

  private id?: string;

  private version = 0;


  constructor(private owner: BrowserWindow) {
    ['blur', 'move', 'resize', 'hide', 'minimize'].forEach((event) => {
      owner.on(event as 'blur', this.hide);
    });
    owner.webContents.on('did-start-navigation', this.hide);
    onWindowClosed(owner, () => {
      this.hide();
      if (this.window && !this.window.isDestroyed()) this.window.destroy();
    });
  }

  hide = () => {
    this.version += 1;
    this.id = undefined;
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  };

  async update(request: NativeTooltipRequest, footer?: { x: number; y: number; width: number; height: number }) {
    validateTooltip(request, footer ? 65536 : 300);
    if (request.label === undefined) {
      if (request.id === this.id) this.hide();
      return;
    }
    this.hide();
    if (this.owner.isDestroyed() || !this.owner.isFocused()) return;
    this.id = request.id;
    const { version } = this;
    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        parent: this.owner,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        focusable: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        hasShadow: false,
        width: 320,
        height: 100,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      this.window.setIgnoreMouseEvents(true);
      this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.ready = this.window.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
      );
    }
    const hint = this.window;
    await this.ready;
    if (
      version !== this.version ||
      hint.isDestroyed() ||
      this.owner.isDestroyed()
    )
      return;
    const glass = !!footer && usesNativeGlass();
    const size = await hint.webContents.executeJavaScript(
      `(()=>{document.body.style.width=${JSON.stringify(`${footer ? Math.max(40, Math.min(480, footer.width)) : 320}px`)};document.body.className=${JSON.stringify(
        [request.dark && 'dark', footer && 'footer', glass && 'glass'].filter(Boolean).join(' ')
      )};const e=document.getElementById('hint');e.style.maxWidth=${JSON.stringify(footer ? '100%' : '288px')};e.textContent=${JSON.stringify(
        request.label
      )};const r=e.getBoundingClientRect();const inset=${footer ? 0 : 12};const size={width:Math.ceil(r.width)+inset,height:Math.ceil(r.height)+inset};document.body.style.width='100%';return size})()`
    );
    if (
      version !== this.version ||
      hint.isDestroyed() ||
      !this.owner.isFocused()
    )
      return;
    const content = this.owner.getContentBounds();
    const zoom = this.owner.webContents.getZoomFactor();
    const anchor = request.anchor!;
    const left = content.x + anchor.x * zoom;
    const top = content.y + anchor.y * zoom;
    const bottom = top + anchor.height * zoom;
    const area = screen.getDisplayMatching({
      x: Math.round(left),
      y: Math.round(top),
      width: Math.max(1, Math.round(anchor.width * zoom)),
      height: Math.max(1, Math.round(anchor.height * zoom)),
    }).workArea;
    const width = Math.min(size.width, area.width);
    const height = Math.min(size.height, area.height);
    const x = Math.max(
      area.x,
      Math.min(
        area.x + area.width - width,
        Math.round(left + (anchor.width * zoom) / 2 - width / 2)
      )
    );
    const y =
      bottom + 4 + height <= area.y + area.height
        ? Math.round(bottom + 4)
        : Math.max(area.y, Math.round(top - height - 4));
    if (footer) {
      const footerWidth = Math.min(size.width, footer.width, area.width);
      const footerHeight = Math.min(size.height, footer.height, area.height);
      hint.setBounds({
        x: Math.max(area.x, Math.min(area.x + area.width - footerWidth, Math.round(content.x + footer.x))),
        y: Math.max(area.y, Math.min(area.y + area.height - footerHeight, Math.round(content.y + footer.y + footer.height - footerHeight))),
        width: Math.round(footerWidth), height: Math.round(footerHeight),
      });
    } else hint.setBounds({ x, y, width, height });
    hint.showInactive();
  }
}

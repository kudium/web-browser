import { BrowserWindow, WebContentsView } from 'electron';
import { AI_ACTIVITY_HTML } from './aiActivityPresentation';
import type { AIPointerActivity } from './aiProtocol';
import { getAppTheme } from './appTheme';
import { spaceColorValues } from '../utils/appTheme';

/** Human input hits this view; AI CDP input still targets the underlying page. */
export class AIActivityLayer {
  private view?: WebContentsView;

  private tabId?: string;

  private timer?: ReturnType<typeof setInterval>;

  private disposed: boolean;

  private primary?: string;

  constructor(
    private host: BrowserWindow,
    private bounds: (
      id: string
    ) => { x: number; y: number; width: number; height: number } | undefined,
    private takeover: () => void
  ) {
    this.disposed = false;
  }

  private ensureView() {
    if (this.disposed || this.host.isDestroyed()) return;
    if (this.view && !this.view.webContents.isDestroyed()) return;
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.view = view;
    this.primary = undefined;
    view.setBackgroundColor('#00000000');
    view.setVisible(false);
    this.host.contentView.addChildView(view);
    // Only a trusted click on the isolated view's explicit control can pause.
    // Other input is absorbed by the view without reaching the working page.
    view.webContents.on('console-message', (event) => {
      if (
        !this.disposed &&
        this.view === view &&
        this.tabId &&
        event.message === 'kudiumbrowser-ai-explicit-takeover'
      )
        this.takeover();
    });
    view.webContents.on('did-finish-load', () => {
      if (this.view !== view) return;
      this.primary = undefined;
      this.refresh();
    });
    view.webContents
      .loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(AI_ACTIVITY_HTML)}`
      )
      .catch(() => {});
  }

  set(tabId?: string) {
    if (this.disposed || this.host.isDestroyed()) return;
    if (
      tabId !== this.tabId &&
      this.view &&
      !this.view.webContents.isDestroyed()
    )
      this.view.webContents
        .executeJavaScript('window.resetAIActivity()')
        .catch(() => {});
    this.tabId = tabId;
    if (tabId) {
      this.ensureView();
      if (!this.timer) {
        this.timer = setInterval(() => this.refresh(), 50);
        this.timer.unref?.();
      }
    } else {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.refresh();
  }

  pointer(tabId: string, point: AIPointerActivity) {
    if (
      this.disposed ||
      this.host.isDestroyed() ||
      tabId !== this.tabId ||
      !this.bounds(tabId) ||
      !this.view ||
      this.view.webContents.isDestroyed()
    )
      return;
    this.view.webContents
      .executeJavaScript(`window.showAIPointer(${JSON.stringify(point)})`)
      .catch(() => {});
  }

  private refresh() {
    if (
      this.disposed ||
      this.host.isDestroyed() ||
      !this.view ||
      this.view.webContents.isDestroyed()
    )
      return;
    const bounds = this.tabId && this.bounds(this.tabId);
    this.view.setVisible(!!bounds);
    if (!bounds) return;
    const primary = getAppTheme(this.host)?.primary || spaceColorValues.iris;
    if (primary !== this.primary) {
      this.primary = primary;
      this.view.webContents
        .executeJavaScript(
          `document.documentElement.style.setProperty('--primary',${JSON.stringify(primary)})`
        )
        .catch(() => {
          this.primary = undefined;
        });
    }
    this.view.setBounds(bounds);
    if (this.host.contentView.children.at(-1) !== this.view) {
      this.host.contentView.removeChildView(this.view);
      this.host.contentView.addChildView(this.view);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    this.timer = undefined;
    if (!this.view) return;
    if (!this.host.isDestroyed())
      this.host.contentView.removeChildView(this.view);
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
  }
}

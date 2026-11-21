import { BrowserWindow, WebContentsView } from 'electron';
import { AI_ACTIVITY_HTML } from './aiActivityPresentation';
import type { AIPointerActivity } from './aiProtocol';
import { getAppTheme, onAppThemeChanged } from './appTheme';
import { spaceColorValues } from '../utils/appTheme';

/** Human input hits this view; AI CDP input still targets the underlying page. */
export class AIActivityLayer {
  private view?: WebContentsView;

  private tabId?: string;

  private scheduled?: ReturnType<typeof setTimeout>;
  private stopTheme: () => void;

  private disposed: boolean;

  private primary?: string;
  private appliedBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  private appliedVisibility = false;

  constructor(
    private host: BrowserWindow,
    private bounds: (
      id: string,
    ) => { x: number; y: number; width: number; height: number } | undefined,
    private takeover: () => void,
  ) {
    this.disposed = false;
    this.stopTheme = onAppThemeChanged(host, this.invalidate);
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
    this.appliedBounds = undefined;
    this.appliedVisibility = false;
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
        `data:text/html;charset=utf-8,${encodeURIComponent(AI_ACTIVITY_HTML)}`,
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
    }
    clearTimeout(this.scheduled);
    this.scheduled = undefined;
    this.refresh();
  }

  /** Browser layout and theme events share one deferred update per frame. */
  invalidate = () => {
    if (this.disposed || !this.tabId || this.scheduled) return;
    this.scheduled = setTimeout(() => {
      this.scheduled = undefined;
      this.refresh();
    }, 16);
  };

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
    if (!!bounds !== this.appliedVisibility) {
      this.appliedVisibility = !!bounds;
      this.view.setVisible(!!bounds);
    }
    if (!bounds) return;
    const primary = getAppTheme(this.host)?.primary || spaceColorValues.iris;
    if (primary !== this.primary) {
      this.primary = primary;
      this.view.webContents
        .executeJavaScript(
          `document.documentElement.style.setProperty('--primary',${JSON.stringify(primary)})`,
        )
        .catch(() => {
          this.primary = undefined;
        });
    }
    if (
      !this.appliedBounds ||
      Object.keys(bounds).some(
        (key) =>
          bounds[key as keyof typeof bounds] !==
          this.appliedBounds![key as keyof typeof bounds],
      )
    ) {
      this.view.setBounds(bounds);
      this.appliedBounds = { ...bounds };
    }
    if (this.host.contentView.children.at(-1) !== this.view) {
      this.host.contentView.removeChildView(this.view);
      this.host.contentView.addChildView(this.view);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.scheduled);
    this.scheduled = undefined;
    this.stopTheme();
    if (!this.view) return;
    if (!this.host.isDestroyed())
      this.host.contentView.removeChildView(this.view);
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
  }
}

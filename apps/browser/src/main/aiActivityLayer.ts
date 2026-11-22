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
  private paused = false;
  private generation = 0;
  private pausedDock?: { x: number; y: number; width: number; height: number };
  private taskHint = 'Working on your request…';

  constructor(
    private host: BrowserWindow,
    private bounds: (
      id: string,
    ) => { x: number; y: number; width: number; height: number } | undefined,
    private takeover: () => void,
    private resume: () => void = () => {},
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
      if (this.disposed || this.view !== view || !this.tabId) return;
      if (
        event.message === 'kudiumbrowser-ai-explicit-takeover' &&
        !this.paused
      )
        this.takeover();
      if (event.message === 'kudiumbrowser-ai-explicit-resume' && this.paused)
        this.resume();
      if (
        this.paused &&
        event.message.startsWith('kudiumbrowser-ai-drag:') &&
        this.pausedDock
      ) {
        try {
          const { dx, dy } = JSON.parse(
            event.message.slice('kudiumbrowser-ai-drag:'.length),
          );
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
          this.pausedDock.x += dx;
          this.pausedDock.y += dy;
          this.refresh();
        } catch {
          /* Ignore malformed messages. */
        }
      }
    });
    view.webContents.on('did-finish-load', () => {
      if (this.view !== view) return;
      this.primary = undefined;
      this.refresh();
      this.status(this.taskHint);
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
    this.generation += 1;
    const wasPaused = this.paused;
    const point = this.pausedDock;
    this.paused = false;
    this.tabId = tabId;
    if (tabId) {
      this.ensureView();
    }
    clearTimeout(this.scheduled);
    this.scheduled = undefined;
    this.refresh();
    if (wasPaused && this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents
        .executeJavaScript(
          `window.setAIActivityState(false,${JSON.stringify(this.taskHint)},${JSON.stringify(point ? { x: point.x, y: point.y } : null)})`,
        )
        .catch(() => {});
    }
  }

  status(text: string) {
    this.taskHint = text.slice(0, 120);
    if (this.view && !this.view.webContents.isDestroyed() && !this.paused)
      this.view.webContents
        .executeJavaScript(
          `window.setAITaskHint(${JSON.stringify(this.taskHint)})`,
        )
        .catch(() => {});
  }

  async pause() {
    if (
      this.paused ||
      !this.tabId ||
      !this.view ||
      this.view.webContents.isDestroyed()
    )
      return;
    const view = this.view,
      tabId = this.tabId,
      generation = this.generation;
    const rect = await view.webContents.executeJavaScript(
      `(()=>{const r=document.querySelector('.dock').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    );
    if (
      this.disposed ||
      this.view !== view ||
      this.tabId !== tabId ||
      this.generation !== generation ||
      this.paused ||
      !rect
    )
      return;
    this.pausedDock = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    };
    this.paused = true;
    await view.webContents.executeJavaScript(
      `window.setAIActivityState(true,'Resume AI when you are ready')`,
    );
    if (this.generation === generation) this.refresh();
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
    const pageBounds = this.tabId && this.bounds(this.tabId);
    let bounds = pageBounds;
    if (pageBounds && this.paused && this.pausedDock) {
      const width = Math.min(this.pausedDock.width, pageBounds.width - 24);
      const height = this.pausedDock.height;
      this.pausedDock.x = Math.max(
        12,
        Math.min(this.pausedDock.x, pageBounds.width - width - 12),
      );
      this.pausedDock.y = Math.max(
        12,
        Math.min(this.pausedDock.y, pageBounds.height - height - 12),
      );
      bounds = {
        x: pageBounds.x + this.pausedDock.x,
        y: pageBounds.y + this.pausedDock.y,
        width,
        height,
      };
    }
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

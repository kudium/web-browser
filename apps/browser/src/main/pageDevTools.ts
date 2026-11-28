import { BrowserWindow, WebContentsView, type Rectangle, type WebContents } from 'electron';
export type PageDevToolsDock = 'right' | 'bottom' | 'window' | 'panel';

/** Chromium's inspector runs in its own native view, never the page renderer. */
export class PageDevTools {
  private entries = new Map<WebContents, { mode: PageDevToolsDock; fraction?: number; resizing?: boolean; bounds?: Rectangle; removePanel?: () => void; view?: WebContentsView; owner?: BrowserWindow; window?: BrowserWindow; closed: () => void }>();
  private generations = new WeakMap<WebContents, number>();
  constructor(private changed: (contents: WebContents) => void, private registerPanel?: (contents: WebContents, view: WebContentsView) => (() => void), private observeView?: (view: WebContentsView, owner: () => BrowserWindow | undefined) => void) {}
  mode(contents: WebContents) { return this.entries.get(contents)?.mode; }
  snapshotView(contents: WebContents, owner: BrowserWindow) {
    const entry = this.entries.get(contents);
    if (!entry?.view || entry.owner !== owner || (entry.mode !== 'right' && entry.mode !== 'bottom') || entry.view.webContents.isDestroyed() || !entry.view.getVisible()) return undefined;
    return entry.view;
  }
  fraction(contents: WebContents) { return this.entries.get(contents)?.fraction || .4; }
  resize(contents: WebContents, fraction: number, commit = true) {
    const entry=this.entries.get(contents);
    if (!entry || !Number.isFinite(fraction)) return;
    const next=Math.max(.2,Math.min(.75,fraction));
    if(next===(entry.fraction || .4)) {
      if (commit && entry.resizing) { entry.resizing = false; this.changed(contents); }
      return;
    }
    entry.fraction=next;
    entry.resizing = !commit;
    if(entry.bounds && entry.owner && !entry.owner.isDestroyed()) {
      const page=this.layout(contents,entry.owner,entry.bounds,entry.view?.getVisible() || false);
      const view=entry.owner.contentView.children.find(child=>child instanceof WebContentsView && child.webContents===contents);
      if(view instanceof WebContentsView) view.setBounds(page);
    }
    if (commit) this.changed(contents);
  }
  hide(contents: WebContents) { const entry=this.entries.get(contents); if(entry?.mode !== 'panel') entry?.view?.setVisible(false); }
  toggle(contents: WebContents) { if (this.entries.has(contents)) this.close(contents); else void this.open(contents, 'right').catch(() => this.close(contents)); }
  close(contents: WebContents) {
    this.generations.set(contents, (this.generations.get(contents) || 0) + 1);
    const entry = this.entries.get(contents);
    if (!entry) { if (!contents.isDestroyed() && contents.isDevToolsOpened()) contents.closeDevTools(); return; }
    this.entries.delete(contents);
    contents.removeListener('devtools-closed', entry.closed);
    contents.removeListener('destroyed', entry.closed);
    if (!contents.isDestroyed()) contents.closeDevTools();
    entry.removePanel?.();
    if (entry.view) {
      if (entry.owner && !entry.owner.isDestroyed()) entry.owner.contentView.removeChildView(entry.view);
      const tools = entry.view.webContents;
      if (tools && !tools.isDestroyed()) tools.close();
    }
    if (entry.window) { entry.window.removeListener('closed', entry.closed); if (!entry.window.isDestroyed()) entry.window.destroy(); }
    this.changed(contents);
  }
  async open(contents: WebContents, mode: PageDevToolsDock) {
    if (contents.isDestroyed()) return;
    if (mode === 'panel' && !this.registerPanel) throw new Error('Panel host is unavailable.');
    if (this.mode(contents) === mode) return;
    const existing=this.entries.get(contents);
    if(existing?.view && existing.mode !== 'panel' && mode !== 'panel' && mode !== 'window') { existing.mode=mode; this.changed(contents); return; }
    const closed = (this.entries.has(contents) || contents.isDevToolsOpened()) ? new Promise<void>((resolve, reject) => {
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { contents.removeListener('devtools-closed', done); reject(new Error('Developer Tools did not finish closing.')); }, 3000);
      contents.once('devtools-closed', done);
    }) : undefined;
    this.close(contents);
    const generation = this.generations.get(contents);
    if (closed) await closed;
    if (contents.isDestroyed() || generation !== this.generations.get(contents)) return;
    const entry: { mode: PageDevToolsDock; fraction?: number; resizing?: boolean; bounds?: Rectangle; removePanel?: () => void; view?: WebContentsView; owner?: BrowserWindow; window?: BrowserWindow; closed: () => void } = { mode, closed: () => this.close(contents) };
    this.entries.set(contents, entry);
    if (mode === 'window') {
      entry.window = new BrowserWindow({ width:1000, height:720, title:'Page Developer Tools', webPreferences:{ sandbox:true, contextIsolation:true, nodeIntegration:false } });
      contents.setDevToolsWebContents(entry.window.webContents);
      entry.window.on('closed', entry.closed);
    } else {
      entry.view = new WebContentsView({ webPreferences:{ sandbox:true, contextIsolation:true, nodeIntegration:false } });
      entry.view.setVisible(false);
      this.observeView?.(entry.view, () => entry.owner);
      contents.setDevToolsWebContents(entry.view.webContents);
    }
    contents.once('devtools-closed', entry.closed);
    contents.once('destroyed', entry.closed);
    contents.openDevTools({ mode:'detach', activate:true });
    if(mode === 'panel' && entry.view) entry.removePanel=this.registerPanel!(contents,entry.view);
    this.changed(contents);
  }
  /** Apply the existing page slot; hidden tabs and overlays hide their inspector. */
  layout(contents: WebContents, owner: BrowserWindow, bounds: Rectangle, visible: boolean): Rectangle {
    const entry = this.entries.get(contents);
    if (!entry?.view || entry.mode === 'panel') return bounds;
    if (entry.owner !== owner) {
      if (entry.owner && !entry.owner.isDestroyed()) entry.owner.contentView.removeChildView(entry.view);
      owner.contentView.addChildView(entry.view); entry.owner = owner;
    }
    entry.bounds = bounds;
    const right = entry.mode === 'right';
    const size = Math.round((right ? bounds.width : bounds.height) * (entry.fraction || .4));
    const page = { ...bounds, ...(right ? {width:Math.max(0,bounds.width-size-3)} : {height:Math.max(0,bounds.height-size-3)}) };
    const tools={ x:bounds.x+(right?page.width+6:0), y:bounds.y+(right?0:page.height+6)+32, width:right?Math.max(0,size-3):bounds.width, height:Math.max(0,(right?bounds.height:size-3)-32) };
    if(JSON.stringify(entry.view.getBounds())!==JSON.stringify(tools)) entry.view.setBounds(tools);
    if(entry.view.getVisible()!==visible) entry.view.setVisible(visible);
    return page;
  }
  hideAll() { this.entries.forEach(entry => entry.view?.setVisible(false)); }
  dispose() { [...this.entries.keys()].forEach(contents => this.close(contents)); }
}

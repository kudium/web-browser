import { BrowserWindow, WebContentsView } from 'electron';
import { AIActivityLayer } from '../main/aiActivityLayer';
import { getAppTheme, onAppThemeChanged } from '../main/appTheme';

jest.mock('../main/appTheme', () => ({
  getAppTheme: jest.fn(),
  onAppThemeChanged: jest.fn(() => jest.fn()),
}));

jest.mock('electron', () => ({
  WebContentsView: jest.fn(() => ({
    setBackgroundColor: jest.fn(),
    setVisible: jest.fn(),
    setBounds: jest.fn(),
    webContents: Object.assign(
      new (jest.requireActual('events').EventEmitter)(),
      {
        isDestroyed: jest.fn(() => false),
        loadURL: jest.fn(async () => {}),
        executeJavaScript: jest.fn(async () => {}),
        close: jest.fn(),
      },
    ),
  })),
}));

function fixture() {
  const children: unknown[] = [];
  const host = {
    isDestroyed: jest.fn(() => false),
    contentView: {
      children,
      addChildView: jest.fn((view) => children.push(view)),
      removeChildView: jest.fn((view) => {
        const index = children.indexOf(view);
        if (index >= 0) children.splice(index, 1);
      }),
    },
  };
  const bounds = jest.fn((id: string) =>
    id === 'missing' ? undefined : { x: 2, y: 3, width: 500, height: 400 },
  );
  const takeover = jest.fn();
  const layer = new AIActivityLayer(
    host as unknown as BrowserWindow,
    bounds,
    takeover,
  );
  const view = () =>
    (WebContentsView as unknown as jest.Mock).mock.results.at(-1)!.value;
  return { host, layer, view, bounds, takeover };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (getAppTheme as jest.Mock).mockReturnValue(undefined);
});
afterEach(() => jest.useRealTimers());

it('inherits the host primary color, updates it live and avoids repeated renderer writes', () => {
  const { layer, view } = fixture();
  (getAppTheme as jest.Mock).mockReturnValue({ primary: '#df6363' });
  layer.set('first');
  const native = view();
  expect(native.webContents.executeJavaScript).toHaveBeenLastCalledWith(
    'document.documentElement.style.setProperty(\'--primary\',"#df6363")',
  );
  native.webContents.executeJavaScript.mockClear();
  jest.advanceTimersByTime(100);
  expect(native.webContents.executeJavaScript).not.toHaveBeenCalled();
  (getAppTheme as jest.Mock).mockReturnValue({ primary: '#568fe0' });
  (onAppThemeChanged as jest.Mock).mock.calls.at(-1)[1]();
  jest.advanceTimersByTime(16);
  expect(native.webContents.executeJavaScript).toHaveBeenLastCalledWith(
    'document.documentElement.style.setProperty(\'--primary\',"#568fe0")',
  );
  native.webContents.executeJavaScript.mockClear();
  native.webContents.emit('did-finish-load');
  expect(native.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
  layer.dispose();
});

it('does not allocate an idle renderer or timer before the first AI action', () => {
  const { host, layer } = fixture();
  layer.set();
  layer.pointer('first', { x: 10, y: 20, type: 'move' });
  jest.advanceTimersByTime(1000);
  expect(WebContentsView).not.toHaveBeenCalled();
  expect(host.contentView.children).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
  layer.dispose();
  layer.set('first');
  expect(WebContentsView).not.toHaveBeenCalled();
});

it('has no active polling timer and reuses the renderer on resume', () => {
  const { host, layer, view, bounds } = fixture();
  layer.set('first');
  expect(WebContentsView).toHaveBeenCalledTimes(1);
  expect(WebContentsView).toHaveBeenCalledWith({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  expect(view().setVisible).toHaveBeenLastCalledWith(true);
  expect(jest.getTimerCount()).toBe(0);
  layer.set('second');
  expect(jest.getTimerCount()).toBe(0);
  bounds.mockClear();
  jest.advanceTimersByTime(100);
  expect(bounds).not.toHaveBeenCalled();
  layer.set();
  expect(view().setVisible).toHaveBeenLastCalledWith(false);
  expect(jest.getTimerCount()).toBe(0);
  bounds.mockClear();
  jest.advanceTimersByTime(1000);
  expect(bounds).not.toHaveBeenCalled();
  layer.set('second');
  expect(WebContentsView).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  layer.dispose();
  layer.dispose();
  layer.set('first');
  expect(host.contentView.children).toEqual([]);
  expect(view().webContents.close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('keeps takeover and pointer output bound to active, owned content', () => {
  const { host, layer, view, takeover } = fixture();
  layer.set('first');
  const native = view();
  native.webContents.emit('console-message', { message: 'other' });
  expect(takeover).not.toHaveBeenCalled();
  native.webContents.emit('console-message', {
    message: 'kudiumbrowser-ai-explicit-takeover',
  });
  expect(takeover).toHaveBeenCalledTimes(1);
  native.webContents.executeJavaScript.mockClear();
  layer.pointer('other', { x: 10, y: 20, type: 'move' });
  expect(native.webContents.executeJavaScript).not.toHaveBeenCalled();
  layer.pointer('first', { x: 10, y: 20, type: 'move' });
  expect(native.webContents.executeJavaScript).toHaveBeenCalledWith(
    'window.showAIPointer({"x":10,"y":20,"type":"move"})',
  );
  layer.set('missing');
  expect(native.setVisible).toHaveBeenLastCalledWith(false);
  native.webContents.executeJavaScript.mockClear();
  layer.pointer('missing', { x: 10, y: 20, type: 'move' });
  expect(native.webContents.executeJavaScript).not.toHaveBeenCalled();
  layer.set();
  native.webContents.emit('console-message', {
    message: 'kudiumbrowser-ai-explicit-takeover',
  });
  expect(takeover).toHaveBeenCalledTimes(1);
  host.isDestroyed.mockReturnValue(true);
  layer.set('first');
  layer.dispose();
  native.webContents.emit('console-message', {
    message: 'kudiumbrowser-ai-explicit-takeover',
  });
  expect(takeover).toHaveBeenCalledTimes(1);
});

it('does not reapply identical native bounds or visibility during activity', () => {
  const { layer, view, bounds } = fixture();
  layer.set('first');
  const native = view();
  native.setBounds.mockClear();
  native.setVisible.mockClear();
  jest.advanceTimersByTime(1000);
  expect(native.setBounds).not.toHaveBeenCalled();
  expect(native.setVisible).not.toHaveBeenCalled();
  bounds.mockReturnValue({ x: 2, y: 3, width: 600, height: 400 });
  layer.invalidate();
  jest.advanceTimersByTime(16);
  expect(native.setBounds).toHaveBeenCalledTimes(1);
  expect(native.setBounds).toHaveBeenCalledWith({
    x: 2,
    y: 3,
    width: 600,
    height: 400,
  });
  layer.dispose();
});

it('coalesces layout changes and removes subscriptions and pending work on disposal', () => {
  const { layer, view, bounds } = fixture();
  layer.set('first');
  expect(jest.getTimerCount()).toBe(0);
  bounds.mockClear();
  for (let i = 0; i < 100; i++) layer.invalidate();
  expect(jest.getTimerCount()).toBe(1);
  jest.advanceTimersByTime(16);
  expect(bounds).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  layer.invalidate();
  layer.dispose();
  expect(jest.getTimerCount()).toBe(0);
  expect(
    (onAppThemeChanged as jest.Mock).mock.results.at(-1)!.value,
  ).toHaveBeenCalled();
});

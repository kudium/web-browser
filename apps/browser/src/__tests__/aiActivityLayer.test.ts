import { BrowserWindow, WebContentsView } from 'electron';
import { AIActivityLayer } from '../main/aiActivityLayer';

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
      }
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
    id === 'missing' ? undefined : { x: 2, y: 3, width: 500, height: 400 }
  );
  const takeover = jest.fn();
  const layer = new AIActivityLayer(
    host as unknown as BrowserWindow,
    bounds,
    takeover
  );
  const view = () =>
    (WebContentsView as unknown as jest.Mock).mock.results.at(-1)!.value;
  return { host, layer, view, bounds, takeover };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

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

it('starts one active timer, stops it on handoff and reuses the renderer on resume', () => {
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
  expect(jest.getTimerCount()).toBe(1);
  layer.set('second');
  expect(jest.getTimerCount()).toBe(1);
  bounds.mockClear();
  jest.advanceTimersByTime(100);
  expect(bounds).toHaveBeenCalledTimes(2);
  layer.set();
  expect(view().setVisible).toHaveBeenLastCalledWith(false);
  expect(jest.getTimerCount()).toBe(0);
  bounds.mockClear();
  jest.advanceTimersByTime(1000);
  expect(bounds).not.toHaveBeenCalled();
  layer.set('second');
  expect(WebContentsView).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(1);
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
    message: 'touchbox-ai-explicit-takeover',
  });
  expect(takeover).toHaveBeenCalledTimes(1);
  native.webContents.executeJavaScript.mockClear();
  layer.pointer('other', { x: 10, y: 20, type: 'move' });
  expect(native.webContents.executeJavaScript).not.toHaveBeenCalled();
  layer.pointer('first', { x: 10, y: 20, type: 'move' });
  expect(native.webContents.executeJavaScript).toHaveBeenCalledWith(
    'window.showAIPointer({"x":10,"y":20,"type":"move"})'
  );
  layer.set('missing');
  expect(native.setVisible).toHaveBeenLastCalledWith(false);
  native.webContents.executeJavaScript.mockClear();
  layer.pointer('missing', { x: 10, y: 20, type: 'move' });
  expect(native.webContents.executeJavaScript).not.toHaveBeenCalled();
  layer.set();
  native.webContents.emit('console-message', {
    message: 'touchbox-ai-explicit-takeover',
  });
  expect(takeover).toHaveBeenCalledTimes(1);
  host.isDestroyed.mockReturnValue(true);
  layer.set('first');
  layer.dispose();
  native.webContents.emit('console-message', {
    message: 'touchbox-ai-explicit-takeover',
  });
  expect(takeover).toHaveBeenCalledTimes(1);
});

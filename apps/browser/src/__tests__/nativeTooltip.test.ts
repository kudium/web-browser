import { EventEmitter } from 'events';
import { BrowserWindow, screen } from 'electron';
import { NativeTooltip, validateTooltip } from '../main/nativeTooltip';

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  screen: { getDisplayMatching: jest.fn() },
  nativeTheme: {},
}));
jest.mock('../main/nativeGlass', () => ({
  usesNativeGlass: jest.fn(() => false),
  nativeGlassSurfaceTokens: '',
}));
import { usesNativeGlass } from '../main/nativeGlass';

const request = {
  id: 'chat',
  label: '<b>Chat</b>',
  anchor: { x: 350, y: 20, width: 40, height: 28 },
  dark: true,
};
let owner: any;
let hint: any;
beforeEach(() => {
  (usesNativeGlass as jest.Mock).mockReturnValue(false);
  hint = {
    isDestroyed: () => false,
    hide: jest.fn(),
    destroy: jest.fn(),
    setBounds: jest.fn(),
    setVibrancy: jest.fn(),
    showInactive: jest.fn(),
    setIgnoreMouseEvents: jest.fn(),
    loadURL: jest.fn(async () => {}),
    webContents: {
      setWindowOpenHandler: jest.fn(),
      executeJavaScript: jest.fn(async () => ({ width: 160, height: 42 })),
    },
  };
  owner = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isFocused: () => true,
    getContentBounds: () => ({ x: 0, y: 0, width: 400, height: 500 }),
    webContents: Object.assign(new EventEmitter(), { getZoomFactor: () => 1 }),
  });
  (BrowserWindow as unknown as jest.Mock).mockImplementation(() => hint);
  (screen.getDisplayMatching as jest.Mock).mockReturnValue({
    workArea: { x: 0, y: 0, width: 400, height: 500 },
  });
});
it('rejects invalid requests and accepts hide requests', () => {
  expect(() => validateTooltip({ id: 'chat' })).not.toThrow();
  [
    null,
    { id: 3 },
    { ...request, label: 'a'.repeat(301) },
    { ...request, anchor: { ...request.anchor, x: Infinity } },
    { ...request, dark: 'yes' },
  ].forEach((value) => {
    expect(() => validateTooltip(value as any)).toThrow();
  });
});
it('keeps hints within the monitor without stealing focus and dismisses on owner movement', async () => {
  const tooltip = new NativeTooltip(owner);
  await tooltip.update(request);
  expect(hint.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
  expect(hint.setBounds).toHaveBeenCalledWith({
    x: 240,
    y: 52,
    width: 160,
    height: 42,
  });
  expect(hint.showInactive).toHaveBeenCalledTimes(1);
  expect(hint.webContents.executeJavaScript.mock.calls[0][0]).toContain(
    'e.textContent='
  );
  await tooltip.update({ id: 'older' });
  expect(hint.hide).not.toHaveBeenCalled();
  owner.emit('move');
  expect(hint.hide).toHaveBeenCalledTimes(1);
  owner.emit('closed');
  expect(hint.destroy).toHaveBeenCalledTimes(1);
});
it('cancels an in-flight tooltip when the pointer leaves before it loads', async () => {
  let loaded!: () => void;
  hint.loadURL.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        loaded = resolve;
      })
  );
  const tooltip = new NativeTooltip(owner);
  const pending = tooltip.update(request);
  await tooltip.update({ id: request.id });
  loaded();
  await pending;
  expect(hint.showInactive).not.toHaveBeenCalled();
});
it('places near-bottom hints above the anchor and accounts for browser zoom', async () => {
  owner.webContents.getZoomFactor = () => 2;
  const tooltip = new NativeTooltip(owner);
  await tooltip.update({
    ...request,
    anchor: { x: 10, y: 225, width: 40, height: 20 },
  });
  expect(hint.setBounds).toHaveBeenCalledWith({
    x: 0,
    y: 404,
    width: 160,
    height: 42,
  });
});

it('places a full link URL at the bottom of its own webpage viewport', async () => {
  const tooltip = new NativeTooltip(owner);
  const url = `https://example.com/path?query=${'long-value'.repeat(40)}#section`;
  await tooltip.update({ ...request, label: url }, { x: 40, y: 100, width: 300, height: 300 });
  expect(hint.setBounds).toHaveBeenLastCalledWith({ x: 40, y: 358, width: 160, height: 42 });
  expect(hint.webContents.executeJavaScript.mock.calls[0][0]).toContain(JSON.stringify(url));
  expect(hint.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
  tooltip.hide();
  expect(hint.hide).toHaveBeenCalled();
});


it('uses a single translucent surface for URL previews without a native backdrop', async () => {
  (usesNativeGlass as jest.Mock).mockReturnValue(true);
  const tooltip = new NativeTooltip(owner);
  const footer = { x: 40, y: 100, width: 300, height: 300 };
  await tooltip.update(request, footer);
  expect(hint.setVibrancy).not.toHaveBeenCalled();
  expect(hint.webContents.executeJavaScript.mock.calls[0][0]).toContain('dark footer glass');
  await tooltip.update(request, footer);
  expect(hint.setVibrancy).not.toHaveBeenCalled();
  await tooltip.update(request);
  expect(hint.setVibrancy).not.toHaveBeenCalled();
});

it('removes glass when the shared accessibility policy disables it', async () => {
  (usesNativeGlass as jest.Mock).mockReturnValue(true);
  const tooltip = new NativeTooltip(owner);
  const footer = { x: 40, y: 100, width: 300, height: 300 };
  await tooltip.update(request, footer);
  (usesNativeGlass as jest.Mock).mockReturnValue(false);
  await tooltip.update(request, footer);
  expect(hint.setVibrancy).not.toHaveBeenCalled();
  expect(hint.webContents.executeJavaScript.mock.calls[1][0]).toContain('"dark footer"');
});

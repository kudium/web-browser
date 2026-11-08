/** @jest-environment node */
import { EventEmitter } from 'events';
import { clipboard, dialog, ipcMain, nativeImage } from 'electron';
import fs from 'fs/promises';
import { PageCaptureService, registerPageCapture } from '../main/pageCapture';
import { capturePagePNG } from '../main/aiScreenshot';
import { withAIProtocol } from '../main/aiProtocol';
import { captureRectangle } from '../browser/pageCapture';

jest.mock('electron', () => ({
  nativeImage: { createFromBuffer: jest.fn() },
  clipboard: { write: jest.fn().mockResolvedValue(undefined) },
  ClipboardItem: class {
    data: unknown;

    constructor(data: unknown) {
      this.data = data;
    }
  },
  dialog: { showSaveDialog: jest.fn() },
  ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
}));
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    writeFile: jest.fn().mockResolvedValue(undefined),
    rename: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../main/aiScreenshot', () => ({
  capturePagePNG: jest
    .fn()
    .mockResolvedValue(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII='
    ),
}));
jest.mock('../main/aiProtocol', () => ({ withAIProtocol: jest.fn() }));
let services: PageCaptureService[] = [];
function fixture() {
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
    getTitle: () => 'Page / title',
    printToPDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-fixture')),
  });
  const image = {
    getSize: () => ({ width: 800, height: 600 }),
    isEmpty: () => false,
    toPNG: () => Buffer.from('image'),
    toDataURL: () => 'data:image/png;base64,cGl4ZWxz',
    crop: jest.fn().mockReturnValue({ toPNG: () => Buffer.from('crop') }),
    resize: jest.fn(),
  };
  (nativeImage.createFromBuffer as jest.Mock).mockReturnValue(image);
  const hostContents = Object.assign(new EventEmitter(), {
    id: 7,
    mainFrame: {},
    getURL: () => 'file:///host.html',
    isDestroyed: () => false,
  });
  const host = { webContents: hostContents };
  const service = new PageCaptureService(host as any, (id) =>
    id === 'page' ? (contents as any) : undefined
  );
  services.push(service);
  return { service, contents, image, host, hostContents };
}
afterEach(() => {
  services.forEach((s) => s.dispose());
  services = [];
  jest.clearAllMocks();
});

it('captures only an owned page and copies a validated crop through the native clipboard', async () => {
  const { service, image } = fixture();
  await expect(
    service.request({ action: 'capture', tabId: 'foreign', mode: 'visible' })
  ).rejects.toThrow('Open this tab');
  const result = await service.request({
    action: 'capture',
    tabId: 'page',
    mode: 'visible',
  });
  if (result.kind !== 'preview') throw new Error('Missing preview');
  expect(result.name).toBe('Page - title');
  const rectangle = { x: 100, y: 50, width: 320, height: 200 };
  await expect(
    service.request({ action: 'copy', captureId: result.captureId, rectangle })
  ).resolves.toEqual({ kind: 'copied' });
  expect(image.crop).toHaveBeenCalledWith(rectangle);
  expect(clipboard.write).toHaveBeenCalledTimes(1);
  await expect(
    service.request({
      action: 'copy',
      captureId: result.captureId,
      rectangle: { ...rectangle, width: 900 },
    })
  ).rejects.toThrow('inside');
  await expect(
    service.request({ action: 'copy', captureId: 'guessed' })
  ).rejects.toThrow('expired');
});

it('preserves the capture after native save cancellation and releases it explicitly', async () => {
  const { service } = fixture();
  const result = await service.request({
    action: 'capture',
    tabId: 'page',
    mode: 'visible',
  });
  if (result.kind !== 'preview') throw new Error('Missing preview');
  (dialog.showSaveDialog as jest.Mock).mockResolvedValue({ canceled: true });
  expect(
    await service.request({ action: 'save', captureId: result.captureId })
  ).toEqual({ kind: 'canceled' });
  expect(fs.writeFile).not.toHaveBeenCalled();
  await service.request({ action: 'release', captureId: result.captureId });
  await expect(
    service.request({ action: 'copy', captureId: result.captureId })
  ).rejects.toThrow('expired');
});

it('drops document-owned previews on host reload', async () => {
  const { service, hostContents } = fixture();
  const result = await service.request({
    action: 'capture',
    tabId: 'page',
    mode: 'visible',
  });
  if (result.kind !== 'preview') throw new Error('Missing preview');
  hostContents.emit(
    'did-start-navigation',
    {},
    'file:///host.html',
    false,
    true
  );
  await expect(
    service.request({ action: 'copy', captureId: result.captureId })
  ).rejects.toThrow('expired');
  expect(clipboard.write).not.toHaveBeenCalled();
});

it('cancel during native save selection cannot dispatch an export', async () => {
  const { service } = fixture();
  const preview = await service.request({
    action: 'capture',
    tabId: 'page',
    mode: 'visible',
  });
  if (preview.kind !== 'preview') throw new Error('Missing preview');
  let choose!: (value: unknown) => void;
  (dialog.showSaveDialog as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        choose = resolve;
      })
  );
  const pending = service.request({
    action: 'save',
    captureId: preview.captureId,
  });
  await service.request({ action: 'cancel' });
  choose({ canceled: false, filePath: '/tmp/chosen.png' });
  await expect(pending).rejects.toThrow('canceled');
  expect(fs.writeFile).not.toHaveBeenCalled();
});

it('revoked temporary file cannot replace the selected destination', async () => {
  const { service, hostContents } = fixture();
  const preview = await service.request({
    action: 'capture',
    tabId: 'page',
    mode: 'visible',
  });
  if (preview.kind !== 'preview') throw new Error('Missing preview');
  (dialog.showSaveDialog as jest.Mock).mockResolvedValueOnce({
    canceled: false,
    filePath: '/tmp/chosen.png',
  });
  let finish!: () => void;
  (fs.writeFile as jest.Mock).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const pending = service.request({
    action: 'save',
    captureId: preview.captureId,
  });
  await Promise.resolve();
  hostContents.emit(
    'did-start-navigation',
    {},
    'file:///host.html',
    false,
    true
  );
  finish();
  await expect(pending).rejects.toThrow('window changed');
  expect(fs.rename).not.toHaveBeenCalled();
  expect(fs.unlink).toHaveBeenCalled();
});

it('preserves previews after failed writes and reports actionable errors', async () => {
  const { service } = fixture();
  const result = await service.request({
    action: 'capture',
    tabId: 'page',
    mode: 'visible',
  });
  if (result.kind !== 'preview') throw new Error('Missing preview');
  (dialog.showSaveDialog as jest.Mock).mockResolvedValue({
    canceled: false,
    filePath: '/tmp/chosen.png',
  });
  (fs.writeFile as jest.Mock).mockRejectedValueOnce(
    Object.assign(new Error('raw OS error'), { code: 'ENOSPC' })
  );
  await expect(
    service.request({ action: 'save', captureId: result.captureId })
  ).rejects.toThrow('enough free space');
  await expect(
    service.request({ action: 'copy', captureId: result.captureId })
  ).resolves.toEqual({ kind: 'copied' });
});

it('exports Chromium print layout only after the native save destination is chosen', async () => {
  const { service, contents } = fixture();
  (dialog.showSaveDialog as jest.Mock).mockResolvedValue({
    canceled: false,
    filePath: '/tmp/chosen.pdf',
  });
  expect(await service.request({ action: 'pdf', tabId: 'page' })).toEqual({
    kind: 'saved',
  });
  expect(contents.printToPDF).toHaveBeenCalledWith({
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(fs.writeFile).toHaveBeenCalledWith(
    expect.stringContaining('.kudiumbrowser-capture-'),
    Buffer.from('%PDF-fixture'),
    expect.objectContaining({ flag: 'wx', mode: 0o600 })
  );
  expect(fs.rename).toHaveBeenCalledWith(expect.any(String), '/tmp/chosen.pdf');
  expect(contents.listenerCount('did-start-navigation')).toBe(0);
});

it('cancels on navigation and rejects concurrent captures without returning late pixels', async () => {
  const { service, contents } = fixture();
  (capturePagePNG as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
  const pending = service.request({
    action: 'capture',
    tabId: 'page',
    mode: 'visible',
  });
  await expect(
    service.request({ action: 'capture', tabId: 'page', mode: 'visible' })
  ).rejects.toThrow('Wait');
  contents.emit(
    'did-start-navigation',
    {},
    'https://changed.test',
    false,
    true
  );
  await expect(pending).rejects.toThrow('page changed');
  expect(contents.listenerCount('destroyed')).toBe(0);
});

it('allows explicit cancellation and discards printing after the window closes', async () => {
  const { service, contents } = fixture();
  contents.printToPDF.mockReturnValueOnce(new Promise(() => {}));
  const pending = service.request({ action: 'pdf', tabId: 'page' });
  expect(await service.request({ action: 'cancel' })).toEqual({
    kind: 'canceled',
  });
  await expect(pending).rejects.toThrow('canceled');
  const retry = service.request({
    action: 'capture',
    tabId: 'page',
    mode: 'visible',
  });
  service.dispose();
  await expect(retry).rejects.toThrow('closed');
  expect(dialog.showSaveDialog).not.toHaveBeenCalled();
});

it('captures below the viewport through a bounded protocol clip without scrolling the website', async () => {
  const { service } = fixture();
  const send = jest
    .fn()
    .mockResolvedValueOnce({ cssContentSize: { width: 800, height: 2400 } })
    .mockResolvedValueOnce({
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
    });
  (withAIProtocol as jest.Mock).mockImplementation((_contents, _signal, run) =>
    run(send)
  );
  await service.request({ action: 'capture', tabId: 'page', mode: 'full' });
  expect(send).toHaveBeenLastCalledWith(
    'Page.captureScreenshot',
    expect.objectContaining({
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 800, height: 2400, scale: 1 },
    })
  );
  send
    .mockClear()
    .mockResolvedValueOnce({ cssContentSize: { width: 1000, height: 50000 } });
  await expect(
    service.request({ action: 'capture', tabId: 'page', mode: 'full' })
  ).rejects.toThrow('too large');
  expect(send).toHaveBeenCalledTimes(1);
});

it('isolates capture handlers to the owning window main frame', async () => {
  const { host, hostContents: sender } = fixture();
  const dispose = registerPageCapture(host as any, () => undefined);
  const handle = (ipcMain.handle as jest.Mock).mock.calls.at(-1)[1];
  await expect(
    handle({ sender: { id: 8 }, senderFrame: {} }, { action: 'cancel' })
  ).rejects.toThrow('Untrusted');
  await expect(
    handle({ sender, senderFrame: {} }, { action: 'cancel' })
  ).rejects.toThrow('Untrusted');
  await expect(
    handle({ sender, senderFrame: sender.mainFrame }, { action: 'cancel' })
  ).resolves.toEqual({ kind: 'canceled' });
  dispose();
  expect(ipcMain.removeHandler).toHaveBeenCalledWith('browser-capture');
});

it('uses image-pixel bounds and refuses malformed or fractional crops', () => {
  expect(captureRectangle(undefined, 800, 600)).toEqual({
    x: 0,
    y: 0,
    width: 800,
    height: 600,
  });
  [
    null,
    false,
    { x: -1, y: 0, width: 100, height: 100 },
    { x: 0.5, y: 0, width: 100, height: 100 },
    { x: 0, y: 0, width: 0, height: 100 },
    { x: 0, y: 0, width: 800, height: 601 },
  ].forEach((rectangle) =>
    expect(() => captureRectangle(rectangle as any, 800, 600)).toThrow('inside')
  );
});

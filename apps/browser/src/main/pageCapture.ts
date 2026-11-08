import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  BrowserWindow,
  WebContents,
  ipcMain,
  nativeImage,
  clipboard,
  ClipboardItem,
  dialog,
} from 'electron';
import type { NativeImage } from 'electron';
import {
  captureRectangle,
  PageCaptureRequest,
  PageCaptureResult,
} from '../browser/pageCapture';
import { capturePagePNG } from './aiScreenshot';
import { withAIProtocol } from './aiProtocol';
import { watchIPCRequest } from './ipcRequestBinding';
import { preflightImage } from './imagePreflight';

const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 32767;

function safeName(title: string) {
  return (
    title
      .replace(/[<>:"/\\|?*]/g, '-')
      .split('')
      .filter((letter) => letter.charCodeAt(0) >= 32)
      .join('')
      .trim()
      .slice(0, 100) || 'Page'
  );
}
function assertSize(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_SIDE ||
    height > MAX_SIDE ||
    width * height > MAX_PIXELS
  )
    throw new Error(
      'This page is too large for one image. Capture an area or save it as PDF.'
    );
}

/** Keep filesystem diagnostics out of the capture interface. */
async function saveExport(
  file: string,
  bytes: Buffer,
  signal: AbortSignal,
  assertCurrent: () => void
) {
  const temporary = path.join(
    path.dirname(file),
    `.kudiumbrowser-capture-${randomUUID()}.tmp`
  );
  try {
    assertCurrent();
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600, signal });
    assertCurrent();
    // Rename is the commit boundary. Revocation after dispatch cannot undo it.
    await fs.rename(temporary, file);
  } catch (reason) {
    if (signal.aborted) throw signal.reason;
    assertCurrent();
    const { code } = reason as { code?: string };
    if (code === 'ENOSPC')
      throw new Error('There isn’t enough free space to save this file.');
    if (code === 'ENOENT')
      throw new Error(
        'The selected folder is unavailable. Choose another folder and try again.'
      );
    if (code === 'EACCES' || code === 'EPERM')
      throw new Error(
        'Kudium Browser can’t save to this folder. Choose a folder you can write to.'
      );
    throw new Error(
      'Could not save this file. Choose another location and try again.'
    );
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}

/** Window-owned immutable captures. No website script or renderer file paths. */
export class PageCaptureService {
  private capture?: { id: string; image: NativeImage; name: string };

  private controller?: AbortController;

  private expiry?: ReturnType<typeof setTimeout>;

  private disposed = false;

  private host: BrowserWindow;

  private hostContents: WebContents;

  private contents: (id: string) => WebContents | undefined;

  private hostNavigation = (
    _event: unknown,
    _url: string,
    inPage: boolean,
    mainFrame: boolean
  ) => {
    if (mainFrame && !inPage) this.invalidate();
  };

  private invalidate = () => {
    this.controller?.abort(
      new Error('Capture window changed. Take another screenshot.')
    );
    clearTimeout(this.expiry);
    this.capture = undefined;
  };

  private hostDestroyed = () => this.dispose();

  constructor(
    host: BrowserWindow,
    contents: (id: string) => WebContents | undefined
  ) {
    this.host = host;
    this.hostContents = host.webContents;
    this.contents = contents;
    host.webContents.on('did-start-navigation', this.hostNavigation);
    host.webContents.on('render-process-gone', this.invalidate);
    host.webContents.once('destroyed', this.hostDestroyed);
  }

  owns(contents: WebContents) {
    return (
      !this.disposed &&
      contents === this.hostContents &&
      !contents.isDestroyed()
    );
  }

  dispose() {
    this.disposed = true;
    this.controller?.abort(new Error('Capture window closed.'));
    clearTimeout(this.expiry);
    this.capture = undefined;
    this.hostContents.removeListener(
      'did-start-navigation',
      this.hostNavigation
    );
    this.hostContents.removeListener('render-process-gone', this.invalidate);
    this.hostContents.removeListener('destroyed', this.hostDestroyed);
  }

  async request(
    value: PageCaptureRequest,
    assertCurrent: () => void = () => {}
  ): Promise<PageCaptureResult> {
    assertCurrent();
    if (this.disposed) throw new Error('Capture window closed.');
    if (!value || typeof value !== 'object')
      throw new Error('Choose a capture action.');
    if (value.action === 'cancel') {
      this.controller?.abort(new Error('Capture canceled.'));
      return { kind: 'canceled' };
    }
    if (this.controller)
      throw new Error('Wait for the current capture or export.');
    if (['capture', 'pdf'].includes(value.action)) {
      const request = value as Extract<PageCaptureRequest, { tabId: string }>;
      if (
        typeof request.tabId !== 'string' ||
        (request.action === 'capture' &&
          !['visible', 'full'].includes(request.mode))
      )
        throw new Error('Choose a page capture mode.');
      const contents = this.contents(request.tabId);
      if (!contents || contents.isDestroyed())
        throw new Error('Open this tab before capturing it.');
      if (contents.isLoadingMainFrame())
        throw new Error('Wait for the page to finish loading.');
      const controller = new AbortController();
      this.controller = controller;
      const abort = () =>
        controller.abort(
          new Error('The page changed during capture. Try again.')
        );
      const navigation = (
        _event: unknown,
        _url: string,
        inPlace: boolean,
        mainFrame: boolean
      ) => {
        if (mainFrame && !inPlace) abort();
      };
      contents.on('did-start-navigation', navigation);
      contents.once('destroyed', abort);
      contents.once('render-process-gone', abort);
      const deadline = setTimeout(
        () => controller.abort(new Error('Page capture timed out. Try again.')),
        30000
      );
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(controller.signal.reason),
          { once: true }
        );
      });
      const check = () => {
        assertCurrent();
        controller.signal.throwIfAborted();
        if (
          this.disposed ||
          contents.isDestroyed() ||
          this.contents(request.tabId) !== contents
        )
          throw new Error('Capture window or tab closed.');
      };
      try {
        const name = safeName(contents.getTitle());
        if (request.action === 'pdf') {
          const bytes = await Promise.race([
            contents.printToPDF({
              printBackground: true,
              preferCSSPageSize: true,
            }),
            aborted,
          ]);
          check();
          // The PDF is now an immutable snapshot; subsequent navigation is fine.
          contents.removeListener('did-start-navigation', navigation);
          contents.removeListener('destroyed', abort);
          contents.removeListener('render-process-gone', abort);
          clearTimeout(deadline);
          const selection = await dialog.showSaveDialog(this.host, {
            title: 'Save page as PDF',
            defaultPath: `${name}.pdf`,
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
            properties: ['createDirectory', 'showOverwriteConfirmation'],
          });
          const checkExport = () => {
            assertCurrent();
            controller.signal.throwIfAborted();
            if (this.disposed) throw new Error('Capture window closed.');
          };
          checkExport();
          if (selection.canceled || !selection.filePath)
            return { kind: 'canceled' };
          await saveExport(
            selection.filePath,
            bytes,
            controller.signal,
            checkExport
          );
          return { kind: 'saved' };
        }
        const data = await Promise.race([
          request.mode === 'visible'
            ? capturePagePNG(contents, controller.signal)
            : withAIProtocol(contents, controller.signal, async (send) => {
                const metrics = await send('Page.getLayoutMetrics');
                const size = metrics.cssContentSize || metrics.contentSize;
                const width = Math.ceil(size?.width);
                const height = Math.ceil(size?.height);
                assertSize(width, height);
                const result = await send('Page.captureScreenshot', {
                  format: 'png',
                  fromSurface: true,
                  captureBeyondViewport: true,
                  clip: { x: 0, y: 0, width, height, scale: 1 },
                });
                if (typeof result.data !== 'string' || !result.data)
                  throw new Error('Page capture failed.');
                return result.data;
              }),
          aborted,
        ]);
        check();
        // Bound allocation before base64 conversion, then inspect PNG dimensions
        // before nativeImage allocates the decoded surface.
        if (data.length > Math.ceil((160 * 1024 * 1024) / 3) * 4)
          throw new Error('This capture is too large. Capture a smaller area.');
        const bytes = Buffer.from(data, 'base64');
        preflightImage(bytes, ['png']);
        const image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty())
          throw new Error('Page capture is empty. Try again.');
        const { width, height } = image.getSize();
        assertSize(width, height);
        const scale = Math.min(1, 1600 / width, 8000 / height);
        const preview =
          scale < 1
            ? image.resize({
                width: Math.max(1, Math.round(width * scale)),
                height: Math.max(1, Math.round(height * scale)),
              })
            : image;
        const id = randomUUID();
        this.capture = { id, image, name };
        clearTimeout(this.expiry);
        this.expiry = setTimeout(() => {
          this.capture = undefined;
        }, 5 * 60 * 1000);
        return {
          kind: 'preview',
          captureId: id,
          preview: preview.toDataURL(),
          name,
          width,
          height,
        };
      } finally {
        clearTimeout(deadline);
        contents.removeListener('did-start-navigation', navigation);
        contents.removeListener('destroyed', abort);
        contents.removeListener('render-process-gone', abort);
        if (this.controller === controller) this.controller = undefined;
      }
    }
    if (
      (value.action !== 'copy' &&
        value.action !== 'save' &&
        value.action !== 'release') ||
      typeof value.captureId !== 'string'
    )
      throw new Error('Choose a capture action.');
    if (value.action === 'release') {
      if (this.capture?.id === value.captureId) {
        this.capture = undefined;
        clearTimeout(this.expiry);
      }
      return { kind: 'released' };
    }
    const captured = this.capture;
    if (!captured || captured.id !== value.captureId)
      throw new Error('This capture expired. Take another screenshot.');
    const size = captured.image.getSize();
    const rectangle = captureRectangle(
      value.rectangle,
      size.width,
      size.height
    );
    const image = value.rectangle
      ? captured.image.crop(rectangle)
      : captured.image;
    if (value.action === 'copy') {
      assertCurrent();
      const controller = new AbortController();
      this.controller = controller;
      try {
        await clipboard.write([
          new ClipboardItem({
            'image/png': new Blob([new Uint8Array(image.toPNG())], {
              type: 'image/png',
            }),
          }),
        ]);
        return { kind: 'copied' };
      } finally {
        if (this.controller === controller) this.controller = undefined;
      }
    }
    const controller = new AbortController();
    this.controller = controller;
    const checkExport = () => {
      assertCurrent();
      controller.signal.throwIfAborted();
      if (this.disposed || this.capture !== captured)
        throw new Error('This capture expired. Take another screenshot.');
    };
    try {
      const selection = await dialog.showSaveDialog(this.host, {
        title: 'Save screenshot',
        defaultPath: `${captured.name}.png`,
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      checkExport();
      if (selection.canceled || !selection.filePath)
        return { kind: 'canceled' };
      await saveExport(
        selection.filePath,
        image.toPNG(),
        controller.signal,
        checkExport
      );
      return { kind: 'saved' };
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }
}

const sessions = new Map<number, PageCaptureService>();

export function registerPageCapture(
  host: BrowserWindow,
  contents: (id: string) => WebContents | undefined
) {
  if (!sessions.size)
    ipcMain.handle('browser-capture', async (event, value) => {
      const service = sessions.get(event.sender.id);
      if (
        !service ||
        !service.owns(event.sender) ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new Error('Untrusted page capture request.');
      const binding = watchIPCRequest(event, (sender) => service.owns(sender));
      try {
        return await service.request(value, binding.assert);
      } finally {
        binding.dispose();
      }
    });
  const service = new PageCaptureService(host, contents);
  sessions.get(host.webContents.id)?.dispose();
  sessions.set(host.webContents.id, service);
  const { id } = host.webContents;
  return () => {
    service.dispose();
    if (sessions.get(id) === service) sessions.delete(id);
    if (!sessions.size) ipcMain.removeHandler('browser-capture');
  };
}

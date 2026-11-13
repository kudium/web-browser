import { BrowserWindow } from 'electron';
import { validateFaviconDimensions } from './faviconLoader';

const document = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'none'; connect-src 'none'">`;
const mimeTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

/** Chromium decodes formats nativeImage cannot, in a hidden isolated image context. */
export class FaviconDecoder {
  private window?: BrowserWindow;
  private ready?: Promise<void>;

  async decode(bytes: Buffer, signal: AbortSignal): Promise<string> {
    const format = validateFaviconDimensions(bytes);
    signal.throwIfAborted();
    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        show: false,
        focusable: false,
        frame: false,
        skipTaskbar: true,
        width: 64,
        height: 64,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          partition: 'kudium-favicon-decoder',
          backgroundThrottling: false,
        },
      });
      this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.ready = this.window.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(document)}`
      );
    }
    const contents = this.window.webContents;
    await this.ready;
    signal.throwIfAborted();
    const source = `data:${mimeTypes[format]};base64,${bytes.toString(
      'base64'
    )}`;
    const result: string =
      await contents.executeJavaScript(`new Promise((resolve,reject)=>{
      const image=new Image();
      const timer=setTimeout(()=>{image.src='';reject(new Error('Favicon decoding timed out'));},5000);
      image.onerror=()=>{clearTimeout(timer);reject(new Error('Favicon decoding failed'));};
      image.onload=()=>{
        clearTimeout(timer);
        try {
          if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>2048||image.naturalHeight>2048) throw new Error('Favicon dimensions exceed limits');
          const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
          const context=canvas.getContext('2d');
          const scale=Math.min(64/image.naturalWidth,64/image.naturalHeight);
          const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
          context.drawImage(image,(64-width)/2,(64-height)/2,width,height);
          resolve(canvas.toDataURL('image/png'));
        } catch(error) {reject(error);}
      };
      image.src=${JSON.stringify(source)};
    })`);
    signal.throwIfAborted();
    return result;
  }

  clear() {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = undefined;
    this.ready = undefined;
  }
}

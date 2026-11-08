import { app, BrowserWindow, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { version as projectVersion } from '../../package.json';
import { browserDialogStyles } from './browserDialogStyles';

const website = 'https://browser.kudium.com';
let aboutWindow: BrowserWindow | undefined;

export function aboutDocument(version: string, icon: string) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[character]!)
    );
  return `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
    <style>${browserDialogStyles}
      body{padding:48px 28px 24px;gap:24px}
      .identity{display:flex;align-items:center;gap:18px}
      .identity img{width:64px;height:64px;object-fit:contain}
      h1{font-size:20px;font-weight:600;letter-spacing:-.5px}
      .version{font-size:12px;margin:6px 0 0}
      .description{font-size:13px;margin:0}
      footer{margin:auto 0 0;justify-content:space-between;align-items:center}
      a{color:inherit;text-decoration:none;font-size:12px}
      a:hover{text-decoration:underline}
      .copyright{font-size:11px;margin:0;color:light-dark(#737377,#adadb2)}
      .links{display:flex;flex-direction:column;gap:6px}
    </style></head><body>
    <div class="identity"><img src="${escape(icon)}" alt="">
      <div><h1>Kudium Browser</h1><p class="version">Version ${escape(
        version
      )}</p></div>
    </div>
    <p class="description">Your tabs, workspace, and AI in one place.</p>
    <footer><div class="links"><a href="${website}" target="_blank" rel="noopener noreferrer">browser.kudium.com ↗</a>
      <p class="copyright">© ${new Date().getFullYear()} Kudium LTD</p></div>
      <button id="close" class="primary" type="button">Done</button></footer>
    <script>window.aboutClosed=new Promise(resolve=>{document.getElementById('close').onclick=()=>resolve(true);document.addEventListener('keydown',event=>{if(event.key==='Escape')resolve(true)});});document.getElementById('close').focus();</script>
    </body></html>`;
}

export async function showAboutDialog(owner: BrowserWindow) {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.show();
    aboutWindow.focus();
    return;
  }
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/app-icon.png')
    : path.join(__dirname, '../../assets/app-icon.png');
  const icon = `data:image/png;base64,${fs
    .readFileSync(iconPath)
    .toString('base64')}`;
  const win = new BrowserWindow({
    parent: owner,
    modal: true,
    title: 'About Kudium Browser',
    width: 420,
    height: 280,
    useContentSize: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  aboutWindow = win;
  win.once('closed', () => {
    if (aboutWindow === win) aboutWindow = undefined;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === `${website}/` || url === website)
      void shell.openExternal(website);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  try {
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        aboutDocument(app.isPackaged ? app.getVersion() : projectVersion, icon)
      )}`
    );
    win.show();
    await win.webContents.executeJavaScript('window.aboutClosed');
  } catch (error) {
    if (!win.isDestroyed())
      log.error('Unable to display About Kudium Browser', error);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

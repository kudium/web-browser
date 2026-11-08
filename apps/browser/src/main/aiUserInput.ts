/* The dedicated, sandboxed input window never uses the application preload. */
import { app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainEvent } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface AIInputRequest {
  title: string;
  reason: string;
  origin?: string;
  options?: string[];
  fields?: string[];
}
const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        char
      ]!)
  );
export function aiInputHTML(request: AIInputRequest) {
  const secure = !!request.fields;
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>
:root{color-scheme:light dark;font:14px -apple-system,BlinkMacSystemFont,sans-serif}body{margin:0;padding:24px;background:light-dark(#fafafa,#202124)}h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;color:light-dark(#555,#bbb)}label{display:grid;gap:6px;margin:16px 0}input,textarea,button{font:inherit;border:1px solid light-dark(#ccc,#555);border-radius:8px;padding:10px;background:light-dark(white,#303134);color:inherit}textarea{min-height:80px;resize:vertical}button{cursor:pointer}button[type=submit]{background:#007aff;color:white;border-color:#007aff}footer{display:flex;justify-content:flex-end;gap:12px;margin-top:24px}.choices{display:flex;gap:8px;flex-wrap:wrap}.origin{overflow-wrap:anywhere;font-weight:600}.hint{font-size:12px}form{max-width:560px;margin:auto}
</style><form><h1>${escapeHTML(request.title)}</h1><p>${escapeHTML(
    request.reason
  )}</p>${
    secure
      ? `<p class="origin">${escapeHTML(
          request.origin || ''
        )}</p><p class="hint">The secure form gives AI a reference instead of your values. Filling sends them to this website, whose scripts may transmit or display them. This request expires after 15 minutes and closes if its page or authorization changes. Temporary values are removed after filling.</p>${request
          .fields!.map(
            (name, index) =>
              `<label>${escapeHTML(
                name
              )}<input name="field-${index}" autocomplete="off" type="${
                /password|token|secret|otp|card|cvc|cvv/i.test(name)
                  ? 'password'
                  : 'text'
              }" maxlength="4096" required></label>`
          )
          .join(
            ''
          )}<label style="display:flex;align-items:center"><input type="checkbox" name="save"> Save in Personal Data for reuse</label>`
      : `<div class="choices">${(request.options || [])
          .map(
            (option) =>
              `<button type="button" class="choice">${escapeHTML(
                option
              )}</button>`
          )
          .join(
            ''
          )}</div><label>Your answer<textarea name="answer" maxlength="4000" required placeholder="Choose a suggestion or write your answer"></textarea></label><p class="hint">Do not enter passwords here. Use the secure Personal Data form.</p>`
  }<footer><button type="button" id="cancel">Cancel</button><button type="submit">${
    secure ? 'Allow local filling' : 'Continue'
  }</button></footer></form><script>document.querySelectorAll('.choice').forEach(button=>button.onclick=()=>{document.querySelector('textarea').value=button.textContent});document.querySelector('#cancel').onclick=()=>window.inputForm.respond(null);document.querySelector('form').onsubmit=event=>{event.preventDefault();window.inputForm.respond(Object.fromEntries(new FormData(event.target)));};</script>`;
}
export async function requestAIInput(
  host: BrowserWindow,
  request: AIInputRequest,
  signal: AbortSignal
): Promise<Record<string, string> | null> {
  signal.throwIfAborted();
  const channel = `ai-private-input-${randomUUID()}`;
  const preload = path.join(app.getPath('userData'), `${channel}.cjs`);
  fs.mkdirSync(path.dirname(preload), { recursive: true });
  fs.writeFileSync(
    preload,
    `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('inputForm',{respond:value=>ipcRenderer.send(${JSON.stringify(
      channel
    )},value)});`,
    { mode: 0o600 }
  );
  const win = new BrowserWindow({
    parent: host,
    modal: true,
    title: request.title,
    width: 480,
    height: 650,
    minWidth: 320,
    minHeight: 400,
    show: false,
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: Record<string, string> | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
      win.close();
    };
    const receive = (event: IpcMainEvent, value: unknown) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        return;
      if (value === null) {
        finish(null);
        return;
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const data = value as Record<string, string>;
      const allowed = request.fields
        ? [...request.fields.map((_, index) => `field-${index}`), 'save']
        : ['answer'];
      if (
        Object.entries(data).some(
          ([key, text]) =>
            !allowed.includes(key) ||
            typeof text !== 'string' ||
            text.length > 4096
        )
      )
        return;
      finish(data);
    };
    const abort = () => {
      reject(new Error('Input request stopped.'));
      win.close();
    };
    ipcMain.on(channel, receive);
    signal.addEventListener('abort', abort, { once: true });
    win.once('closed', () => {
      ipcMain.removeListener(channel, receive);
      signal.removeEventListener('abort', abort);
      fs.rmSync(preload, { force: true });
      if (!settled) {
        settled = true;
        resolve(null);
      }
    });
    win.once('ready-to-show', () => win.show());
    win
      .loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          aiInputHTML(request)
        )}`
      )
      .catch(() => {
        reject(new Error('Input form unavailable.'));
        win.close();
      });
  });
}

/** Serialized into the page: returns only match counts, never field values. */
export function privateFieldTargets(fieldNames: string[]) {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input')
  ).filter(
    (input) =>
      !input.disabled &&
      !input.readOnly &&
      input.getClientRects().length > 0 &&
      !['hidden', 'file', 'checkbox', 'radio', 'submit', 'button'].includes(
        input.type
      )
  );
  return fieldNames.every(
    (name) =>
      inputs.filter((input) =>
        [input.name, input.id, ...(input.autocomplete || '').split(' ')].some(
          (label) => label.toLowerCase() === name.toLowerCase()
        )
      ).length === 1
  );
}

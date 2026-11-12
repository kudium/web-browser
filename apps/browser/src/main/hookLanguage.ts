import { app, ipcMain, WebContents } from 'electron';
import { Worker } from 'worker_threads';
import path from 'path';
import type {
  HookLanguageRequest,
  HookLanguageResult,
} from '../browser/hookLanguage';

let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<
  number,
  {
    resolve: (value: HookLanguageResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function stop() {
  const previous = worker;
  worker = undefined;
  previous?.terminate().catch(() => {});
  pending.forEach(({ reject, timer }) => {
    clearTimeout(timer);
    reject(new Error('JavaScript assistance is unavailable.'));
  });
  pending.clear();
}
function request(input: HookLanguageRequest): Promise<HookLanguageResult> {
  if (pending.size >= 64)
    return Promise.reject(new Error('JavaScript assistance is busy.'));
  if (!worker) {
    const dir = app.isPackaged
      ? path.join(process.resourcesPath, 'assets/hook-language')
      : path.join(__dirname, '../../assets/hook-language');
    const current = new Worker(path.join(dir, 'worker.cjs'), {
      workerData: { libDir: dir },
    });
    worker = current;
    current.on('message', (message) => {
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      clearTimeout(task.timer);
      if (message.error) task.reject(new Error(message.error));
      else task.resolve(message.result);
    });
    current.on('error', () => {
      if (worker === current) stop();
    });
    current.on('exit', () => {
      if (worker === current) stop();
    });
  }
  sequence += 1;
  const id = sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('JavaScript assistance timed out.'));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    worker!.postMessage({ id, request: input });
  });
}
export function registerHookLanguage(
  isTrusted: (contents: WebContents) => boolean
) {
  ipcMain.handle('hook-language', (event, input: HookLanguageRequest) => {
    if (
      !isTrusted(event.sender) ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error('Unauthorized editor request.');
    if (
      !input ||
      !['completions', 'diagnostics', 'hover'].includes(input.action) ||
      typeof input.source !== 'string' ||
      input.source.length > 100000 ||
      !Number.isInteger(input.position) ||
      input.position < 0 ||
      input.position > input.source.length
    )
      throw new Error('Invalid editor request.');
    return request(input);
  });
  app.on('before-quit', stop);
}

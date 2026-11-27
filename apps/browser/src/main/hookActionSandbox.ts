import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'crypto';
// eslint-disable-next-line import/no-relative-packages
import {
  validateActionCommands,
  validateHookInputRequest,
  validateHookInputResponse,
  type HookInputRequest,
  type HookInputResponse,
  type HookAction,
  type HookActionContext,
} from '../../../../packages/hooks/actions';

export interface HookActionSandboxOptions {
  signal?: AbortSignal;
  request?: (
    request: HookInputRequest,
    signal: AbortSignal
  ) => Promise<HookInputResponse>;
}

/** Disposable Chromium sandbox. No preload, DOM of the target, network, or Node access. */
export async function runActionSandbox(
  action: HookAction,
  context: HookActionContext,
  options: HookActionSandboxOptions = {}
) {
  const isolated = session.fromPartition(`hook-action-${randomUUID()}`, {
    cache: false,
  });
  isolated.setPermissionCheckHandler(() => false);
  isolated.setPermissionRequestHandler((_contents, _permission, answer) =>
    answer(false)
  );
  const entryURL =
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-eval'; worker-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'\"><title>Hook action sandbox</title>"
    );
  let initialLoad = true;
  isolated.webRequest.onBeforeRequest((request, answer) => {
    const allow =
      initialLoad &&
      request.url === entryURL &&
      request.resourceType === 'mainFrame';
    if (allow) initialLoad = false;
    answer({ cancel: !(allow || request.url.startsWith('blob:null/')) });
  });
  const sandbox = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      session: isolated,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: false,
      backgroundThrottling: false,
      navigateOnDragDrop: false,
    },
  });
  sandbox.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  sandbox.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  sandbox.webContents.on('will-navigate', (event) => event.preventDefault());
  isolated.on('will-download', (event) => event.preventDefault());
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        controller.signal.throwIfAborted();
        await sandbox.loadURL(entryURL);
        initialLoad = false;
        const workerSource = `(async () => {
          const commands = [];
          const post = self.postMessage.bind(self);
          let pending;
          const request = (type, options) => {
            if (pending) return Promise.reject(new Error('Await each input request before starting another.'));
            return new Promise((resolve, reject) => {
              pending = {resolve, reject};
              post({request: {...options, type}});
            });
          };
          self.onmessage = event => {
            if (!pending) return;
            const {resolve, reject} = pending;
            pending = undefined;
            if (event.data.error) reject(new Error(event.data.error));
            else { freeze(event.data.value); resolve(event.data.value); }
          };
          const emit = (capability, input) => {
            if (commands.length >= 10) throw new Error('Maximum ten outputs.');
            const encoded = JSON.stringify({capability, input});
            if (encoded.length > 110000) throw new Error('Output too large.');
            commands.push(JSON.parse(encoded));
          };
          const context = ${JSON.stringify(context)};
          const freeze = value => {
            if (value && typeof value === 'object') {
              Object.values(value).forEach(freeze);
              Object.freeze(value);
            }
          };
          freeze(context);
          const api = Object.freeze({
            version: 1,
            showResult: text => emit('result', text),
            field: Object.freeze({fill: text => emit('field.write', text)}),
            form: Object.freeze({fill: values => emit('form.write', values)}),
            passwords: Object.freeze({generateAndFill: () => emit('password.generate'), fill: text => emit('password.write', text)}),
            personalData: Object.freeze({fill: () => emit('personalData.fill'), saveForm: () => emit('personalData.saveForm'), request: options => request('personalData', options)}),
            input: Object.freeze({request: options => request('input', options)}),
            ai: Object.freeze({compose: prompt => emit('ai.compose', prompt)}),
            todos: Object.freeze({create: input => emit('todos.create', input)}),
            notes: Object.freeze({create: input => emit('notes.create', input)}),
            activity: Object.freeze({create: input => emit('activity.create', input)})
          });
          const handler = new (Object.getPrototypeOf(async function(){}).constructor)('context', 'api', ${JSON.stringify(
            '"use strict";\n' + action.source
          )});
          const result = await handler(context, api);
          if (typeof result === 'string') emit('result', result);
          self.postMessage({commands});
        })().catch(error => self.postMessage({error: String(error).slice(0, 2000)}));`;
        await sandbox.webContents.executeJavaScript(`(() => {
          const workerURL = URL.createObjectURL(new Blob([${JSON.stringify(
            workerSource
          )}], {type: 'application/javascript'}));
          const worker = new Worker(workerURL);
          let count = 0;
          window.actionState = {kind: 'running'};
          const fail = error => {
            worker.terminate(); URL.revokeObjectURL(workerURL);
            window.actionState = {kind: 'error', error: String(error).slice(0, 2000)};
          };
          window.answerActionRequest = (id, answer) => {
            if (window.actionState.kind !== 'request' || window.actionState.id !== id) return;
            window.actionState = {kind: 'running'};
            worker.postMessage(answer);
          };
          worker.onmessage = event => {
            if (window.actionState.kind === 'error' || window.actionState.kind === 'done') return;
            if (window.actionState.kind === 'request') {fail('Await the input request before completing the action.'); return;}
            if (event.data?.request) {
              if (++count > 3) {fail('Maximum three input requests per action.'); return;}
              window.actionState = {kind: 'request', id: count, request: event.data.request};
            } else if (event.data?.error) fail(event.data.error);
            else {
              worker.terminate(); URL.revokeObjectURL(workerURL);
              window.actionState = {kind: 'done', commands: event.data?.commands};
            }
          };
          worker.onerror = () => fail('Action handler failed.');
        })()`);
        // The renderer has no app bridge. Main only polls this isolated worker's
        // bounded request state and responds through its own WebContents.
        let remaining = 5000;
        let last = Date.now();
        let count = 0;
        while (true) {
          controller.signal.throwIfAborted();
          const state = await sandbox.webContents.executeJavaScript(
            'window.actionState'
          );
          const now = Date.now();
          remaining -= now - last;
          last = now;
          if (remaining <= 0)
            throw new Error('Hook action exceeded five seconds.');
          if (state?.kind === 'error')
            throw new Error(String(state.error).slice(0, 2000));
          if (state?.kind === 'done')
            return validateActionCommands(state.commands);
          if (state?.kind === 'request') {
            if (state.id !== ++count || count > 3)
              throw new Error('Invalid action request sequence.');
            const request = validateHookInputRequest(state.request);
            let answer;
            try {
              if (!options.request)
                throw new Error('User input is unavailable here.');
              answer = {
                value: validateHookInputResponse(
                  request,
                  await options.request(request, controller.signal)
                ),
              };
            } catch (error) {
              controller.signal.throwIfAborted();
              answer = { error: String(error).slice(0, 2000) };
            }
            controller.signal.throwIfAborted();
            // User interaction consumes the overall deadline, but not the script budget.
            last = Date.now();
            await sandbox.webContents.executeJavaScript(
              `window.answerActionRequest(${state.id}, ${JSON.stringify(
                answer
              )})`
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      })(),
      new Promise<never>((_resolve, reject) => {
        const stopped = () => reject(new Error('Hook action was cancelled.'));
        controller.signal.addEventListener('abort', stopped, { once: true });
        if (controller.signal.aborted) stopped();
      }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          if (!sandbox.isDestroyed()) sandbox.destroy();
          reject(new Error('Hook input request timed out after two minutes.'));
          controller.abort();
        }, 125000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
    controller.abort();
    if (!sandbox.isDestroyed()) sandbox.destroy();
  }
}

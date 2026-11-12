/* Executes the generated preload against a controlled DOM and mocked IPC. */
/* Sequential microtask draining exercises asynchronous preload stages. */
/* eslint-disable no-new-func, no-await-in-loop */
import fs from 'fs';
import path from 'path';
import { hookExamples } from '../browser/hookExamples';

const file = fs.readFileSync(
  path.join(__dirname, '../main/siteDeveloper.ts'),
  'utf8'
);
const template = file.slice(
  file.indexOf('String.raw`') + 11,
  file.indexOf('`;\nlet preloadPath')
);
const source = new Function(`return String.raw\`${template}\``)();
const flush = async () => {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
};

function launch(after: string, before = '') {
  let config: any = {
    token: 'run-1',
    enabled: true,
    before,
    after,
    css: '',
    hooks: [],
  };
  const listeners = new Map<string, () => void>();
  const send = jest.fn();
  const invoke = jest.fn(() => Promise.resolve({ id: 'activity' }));
  const removeInsertedCSS = jest.fn();
  new Function('require', source)(() => ({
    ipcRenderer: {
      on: (name: string, listener: () => void) => listeners.set(name, listener),
      sendSync: () => config,
      send,
      invoke,
    },
    webFrame: {
      insertCSS: () => Promise.resolve('css-key'),
      removeInsertedCSS,
    },
  }));
  return {
    send,
    invoke,
    removeInsertedCSS,
    stop: () => listeners.get('site-developer-stop')!(),
    route: () => listeners.get('site-developer-route')!(),
    configure: (next: any) => {
      config = next;
    },
  };
}

beforeEach(() => {
  document.body.innerHTML =
    '<main><img src="https://example.com/image.png"></main>';
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => 'complete',
  });
});

it('runs visual presets once and cleans up their effects on stop', async () => {
  const runtime = launch(
    hookExamples.find((item) => item.id === 'dark-mode')!.source
  );
  await flush();
  expect(document.querySelectorAll('#kudium-dark-mode')).toHaveLength(1);
  runtime.route();
  await flush();
  expect(document.querySelectorAll('#kudium-dark-mode')).toHaveLength(1);
  runtime.stop();
  expect(document.querySelector('#kudium-dark-mode')).toBeNull();
});

it('cancels timers and listeners and suppresses stale completion after replacement', async () => {
  const runtime = launch(
    `context.listen(document, 'hook-test', () => log('event')); context.setTimeout(() => log('timer'), 5); await new Promise(resolve => context.onCleanup(resolve));`
  );
  await flush();
  runtime.stop();
  await flush();
  document.dispatchEvent(new Event('hook-test'));
  await new Promise((resolve) => {
    setTimeout(resolve, 15);
  });
  expect(
    runtime.send.mock.calls.some(([, event]) => event.kind === 'success')
  ).toBe(false);
  expect(
    runtime.send.mock.calls.some(
      ([, event]) =>
        event.value.includes('event') || event.value.includes('timer')
    )
  ).toBe(false);
});

it('reruns after-load on routes without rerunning before-load, and stops when disabled', async () => {
  const runtime = launch("log('after')", "log('before')");
  await flush();
  runtime.route();
  await flush();
  expect(
    runtime.send.mock.calls.filter(([, event]) =>
      event.value.endsWith(': before')
    )
  ).toHaveLength(1);
  expect(
    runtime.send.mock.calls.filter(([, event]) =>
      event.value.endsWith(': after')
    )
  ).toHaveLength(2);
  runtime.configure(null);
  runtime.route();
  await flush();
  expect(
    runtime.send.mock.calls.filter(([, event]) =>
      event.value.endsWith(': after')
    )
  ).toHaveLength(2);
});

it('disconnects image observers and removes captions on stop', async () => {
  const runtime = launch(
    hookExamples.find((item) => item.id === 'image-urls')!.source
  );
  await flush();
  expect(document.querySelector('[data-kudium-image-url]')).not.toBeNull();
  runtime.stop();
  expect(document.querySelector('[data-kudium-image-url]')).toBeNull();
});

it('owns ordinary JavaScript timers too, and cleans up timed-out hooks', async () => {
  jest.useFakeTimers();
  try {
    const runtime = launch(
      "onCleanup(() => document.body.removeAttribute('data-hook')); document.body.setAttribute('data-hook', 'active'); setInterval(() => log('tick'), 50); await new Promise(() => {});"
    );
    await flush();
    jest.advanceTimersByTime(10000);
    await flush();
    expect(
      runtime.send.mock.calls.some(
        ([, event]) =>
          event.kind === 'error' && event.value.includes('timed out')
      )
    ).toBe(true);
    expect(document.body.hasAttribute('data-hook')).toBe(false);
    const ticks = runtime.send.mock.calls.filter(([, event]) =>
      event.value.endsWith(': tick')
    ).length;
    jest.advanceTimersByTime(1000);
    await flush();
    expect(
      runtime.send.mock.calls.filter(([, event]) =>
        event.value.endsWith(': tick')
      )
    ).toHaveLength(ticks);
    expect(
      runtime.send.mock.calls.some(([, event]) => event.kind === 'success')
    ).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

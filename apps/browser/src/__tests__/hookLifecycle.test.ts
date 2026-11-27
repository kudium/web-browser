import { pageHookBody } from '../../../../packages/hooks/runtime';
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
// Autofill has its own DOM tests; this harness isolates website hook lifecycle.
const source = new Function('installPersonalDataAutofill', 'createPersonalDataMatching', 'installPageTranslation', 'pageHookBody', `return String.raw\`${template}\``)(() => {}, () => ({ score: () => 0 }), () => {}, pageHookBody);
const flush = async () => {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
};

function launch(after: string, before = '', hooks: any[] = [], css = '') {
  let config: any = {
    token: 'run-1',
    enabled: true,
    before,
    after,
    css,
    hooks,
  };
  const listeners = new Map<string, () => void>();
  const send = jest.fn();
  const invoke = jest.fn(() => Promise.resolve({ id: 'activity' }));
  const removeInsertedCSS = jest.fn();
  const insertCSS = jest.fn(() => Promise.resolve('css-key'));
  new Function('require', source)(() => ({
    ipcRenderer: {
      on: (name: string, listener: () => void) => listeners.set(name, listener),
      sendSync: () => config,
      send,
      invoke,
    },
    webFrame: {
      insertCSS,
      removeInsertedCSS,
    },
  }));
  return {
    send,
    invoke,
    removeInsertedCSS,
    insertCSS,
    osChange: (request: unknown) => (listeners.get('site-developer-os-change') as any)?.(null,request),
    toastAction: (request: unknown) => (listeners.get('site-developer-toast-action') as any)?.(null,request),
    panelAction: (request: unknown) => (listeners.get('site-developer-panel-action') as any)?.(null,request),
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

it.each(['dark-mode', 'accent-colors', 'layout-outlines'])('injects %s through browser CSS and removes it on route changes and stop', async (id) => {
  const example = hookExamples.find((item) => item.id === id)!;
  expect(example.stage).toBe('css');
  const runtime = launch('', '', [], example.source);
  await flush();
  expect(runtime.insertCSS).toHaveBeenCalledWith(example.source);
  expect(runtime.insertCSS).toHaveBeenCalledTimes(1);
  expect(document.querySelector('style')).toBeNull();
  runtime.route();
  await flush();
  expect(runtime.removeInsertedCSS).toHaveBeenCalledTimes(1);
  expect(runtime.insertCSS).toHaveBeenCalledTimes(2);
  runtime.stop();
  expect(runtime.removeInsertedCSS).toHaveBeenCalledTimes(2);
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

it('runs global hooks before default and named site hooks, and cleans every CSS resource on stop', async () => {
  const runtime = launch("log('site after')", "log('site before')", [
    {
      id: 'global:one',
      name: 'Global',
      before: "log('global before')",
      after: "log('global after')",
      css: 'body{}',
    },
    {
      id: 'site-one',
      name: 'Site named',
      before: "log('named before')",
      after: "log('named after')",
      css: 'p{}',
    },
  ]);
  await flush();
  const messages = runtime.send.mock.calls
    .map(([, event]) => event.value)
    .filter((value) => typeof value === 'string');
  expect(messages.indexOf('Global · before: global before')).toBeLessThan(
    messages.indexOf('Default hook · before: site before')
  );
  expect(messages.indexOf('Default hook · before: site before')).toBeLessThan(
    messages.indexOf('Site named · before: named before')
  );
  expect(messages.indexOf('Global · after: global after')).toBeLessThan(
    messages.indexOf('Default hook · after: site after')
  );
  runtime.stop();
  expect(runtime.removeInsertedCSS).toHaveBeenCalledTimes(2);
});

it('routes a panel action to its hook handler across before and after stages and drops stale invocations', async () => {
  const run=launch("context.panel.onAction('refresh', payload => { log('refresh', payload); return {ok:true}; }); await context.panel.show({id:'output',title:'Output',content:{type:'text',text:'Ready'},actions:[{id:'refresh',label:'Refresh'}]});", "log('before')");
  await flush();
  expect(run.invoke).toHaveBeenCalledWith('site-developer-output',expect.objectContaining({kind:'panel',token:'run-1'}));
  run.panelAction({token:'run-1',hookId:'',action:'refresh',payload:'value',requestId:'request-1'});
  await flush();
  expect(run.invoke).toHaveBeenCalledWith('site-developer-output',expect.objectContaining({kind:'panel-response',input:{requestId:'request-1',value:{ok:true}}}));
  run.stop();
  run.invoke.mockClear();
  run.panelAction({token:'run-1',hookId:'',action:'refresh',payload:'stale',requestId:'request-2'});
  await flush();
  expect(run.invoke).not.toHaveBeenCalled();
});

it('routes battery and toast APIs through approved output IPC and stops action callbacks with the run', async () => {
  const runtime = launch(`
    context.toast.onAction('check',()=>context.log('action clicked'));
    await context.os.battery.get();
    await context.toast.show({id:'notice',title:'Notice',message:'Battery check',action:{id:'check',label:'Check'}});
  `);
  await flush();
  expect(runtime.invoke).toHaveBeenCalledWith('site-developer-output',expect.objectContaining({kind:'battery',token:'run-1'}));
  expect(runtime.invoke).toHaveBeenCalledWith('site-developer-output',expect.objectContaining({kind:'toast',input:expect.objectContaining({id:'notice'})}));
  runtime.toastAction({token:'wrong',hookId:'',action:'check'}); await flush();
  expect(runtime.send.mock.calls.some(call=>JSON.stringify(call).includes('action clicked'))).toBe(false);
  runtime.toastAction({token:'run-1',hookId:'',action:'check'}); await flush();
  expect(runtime.send.mock.calls.some(call=>JSON.stringify(call).includes('action clicked'))).toBe(true);
  runtime.stop();runtime.send.mockClear();
  runtime.toastAction({token:'run-1',hookId:'',action:'check'}); await flush();
  expect(runtime.send).not.toHaveBeenCalled();
});

it('reads OS status, shares same-kind subscriptions and cleans up on stop', async () => {
  const runtime = launch(`
    await context.os.power.get(); await context.os.appearance.get();
    await context.os.locale.get(); await context.os.network.get();
    context.os.power.onChange(()=>context.log('first power handler'));
    context.os.power.onChange(()=>context.log('second power handler'));
  `);
  await flush();
  for (const kind of ['os-power','os-appearance','os-locale'])expect(runtime.invoke).toHaveBeenCalledWith('site-developer-output',expect.objectContaining({kind}));
  expect(runtime.invoke.mock.calls.filter((call:any[])=>call[1]?.kind==='os-subscribe')).toHaveLength(1);
  runtime.osChange({token:'run-1',runId:'run-1:default:after',kind:'power',value:{onBattery:true,lowPowerMode:false}});await flush();
  expect(runtime.send.mock.calls.some(call=>JSON.stringify(call).includes('first power handler'))).toBe(true);
  expect(runtime.send.mock.calls.some(call=>JSON.stringify(call).includes('second power handler'))).toBe(true);
  runtime.stop();runtime.send.mockClear();
  runtime.osChange({token:'run-1',runId:'run-1:default:after',kind:'power',value:{onBattery:false}});await flush();
  expect(runtime.send).not.toHaveBeenCalled();
  expect(runtime.invoke).toHaveBeenCalledWith('site-developer-output',expect.objectContaining({kind:'os-unsubscribe'}));
});

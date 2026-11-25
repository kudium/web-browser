/** @jest-environment node */
import { ipcMain } from 'electron';
import {
  registerDeveloperPage,
  developerPreloadSource,
  developerState,
  rerunDeveloperHook,
  resetDeveloperState,
} from '../main/siteDeveloper';
import { browserActivity } from '../main/activity';
import { saveNoteWithActivity } from '../main/noteActivity';
import { getGroupLocks } from '../main/groupLocks';
import { onSiteSettingsChanged } from '../main/siteSettings';

const mockConfig = {
  enabled: true,
  before: '',
  after: 'await context.activity.create({title:"Changed"});',
  css: '',
  hooks: [
    {
      id: 'prices',
      name: 'Price watcher',
      enabled: true,
      path: '/*',
      before: '',
      after: 'log(url)',
      css: '',
    },
  ],
};
jest.mock('electron', () => ({
  ipcMain: { on: jest.fn(), handle: jest.fn() },
  app: { getPath: () => '/tmp' },
}));
jest.mock('../main/siteSettings', () => ({
  getSiteSettings: () => ({ developer: mockConfig }),
  onSiteSettingsChanged: jest.fn(),
  siteOrigin: (url: string) => new URL(url).origin,
}));
jest.mock('../main/hookNotifications', () => ({
  hookScriptHash: (config: unknown) => JSON.stringify(config),
  hookNotifications: () => ({ permissions: () => [] }),
}));
jest.mock('../main/groupLocks', () => ({
  getGroupLocks: jest.fn(() => ({ locked: () => false, subscribe: jest.fn() })),
}));
jest.mock('../main/activity', () => ({
  browserActivity: jest.fn(() => ({ create: jest.fn() })),
}));
jest.mock('../main/noteActivity', () => ({
  saveNoteWithActivity: jest.fn(() => ({ recordId: 'saved' })),
}));
let output: (event: any, data: unknown) => any;
let event: any;
let token: string;
const create = jest.fn(() => ({ id: 'activity' }));
beforeEach(() => {
  (browserActivity as jest.Mock).mockReturnValue({ create });
  (getGroupLocks as jest.Mock).mockReturnValue({
    locked: () => false,
    subscribe: jest.fn(),
  });
  const frame = { url: 'https://example.com/page' };
  const contents = {
    mainFrame: frame,
    getURL: () => frame.url,
    once: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
    isDestroyed: () => false,
  };
  registerDeveloperPage(contents as any, 'profile', jest.fn(), () => ({
    groupId: 'group-a',
    scope: 'scope-a',
  }));
  const configure = (ipcMain.on as jest.Mock).mock.calls.find(
    ([name]) => name === 'site-developer-config'
  )![1];
  event = { sender: contents, senderFrame: frame };
  configure(event);
  token = event.returnValue.token;
  [, output] = (ipcMain.handle as jest.Mock).mock.calls.find(
    ([name]) => name === 'site-developer-output'
  )!;
  create.mockClear();
  (saveNoteWithActivity as jest.Mock).mockClear();
});

it('attributes runtime errors to the exact custom hook', () => {
  const receive = (ipcMain.on as jest.Mock).mock.calls.find(
    ([name]) => name === 'site-developer-event'
  )![1];
  receive(event, {
    token,
    kind: 'error',
    value: 'Price watcher failed',
    hookId: 'prices',
    phase: 'after',
    runId: `${token}:prices:after`,
  });
  expect(create).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      trigger: expect.objectContaining({
        hookId: 'prices',
        hookName: 'Price watcher',
      }),
    }),
    false,
    { silent: true }
  );
});

it('stops loaded executions when hooks change through another surface', () => {
  const changed = (onSiteSettingsChanged as jest.Mock).mock.calls[0][0];
  const previous = mockConfig.after;
  try {
    mockConfig.after = 'log("replacement")';
    changed('profile', 'https://example.com');
    expect(event.sender.send).toHaveBeenCalledWith('site-developer-stop');
  } finally {
    mockConfig.after = previous;
  }
});
test('hook alerts inherit host scope and default to the current page URL', () => {
  output(event, {
    token,
    kind: 'activity',
    input: { title: 'Price changed', message: 'Now $20' },
  });
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Price changed',
      url: event.senderFrame.url,
    }),
    {
      source: 'hook',
      groupId: 'group-a',
      scope: 'scope-a',
      trigger: {
        sourceId: undefined,
        profile: 'profile',
        origin: 'https://example.com',
        pageURL: event.senderFrame.url,
        hookId: undefined,
        hookName: 'Default hook',
      },
    }
  );
});
test('hook notes create linked activity without granting AI access', () => {
  output(event, {
    token,
    kind: 'note',
    input: { title: 'Price history', body: '**$20**' },
  });
  expect(saveNoteWithActivity).toHaveBeenCalledWith(
    expect.objectContaining({ notes: '**$20**', allowAI: false }),
    'scope-a',
    {
      source: 'hook',
      groupId: 'group-a',
      scope: 'scope-a',
      trigger: {
        sourceId: undefined,
        profile: 'profile',
        origin: 'https://example.com',
        pageURL: event.senderFrame.url,
        hookId: undefined,
        hookName: 'Default hook',
      },
    },
    event.senderFrame.url
  );
});
test('rejects stale tokens, subframes, changed source, locked groups and arbitrary saved-note links', () => {
  const data = { token, kind: 'activity', input: { title: 'Update' } };
  expect(() => output(event, { ...data, token: 'wrong' })).toThrow(
    'Unauthorized'
  );
  expect(() =>
    output({ ...event, senderFrame: { url: event.senderFrame.url } }, data)
  ).toThrow('Unauthorized');
  const previous = mockConfig.after;
  mockConfig.after = 'changed source';
  expect(() => output(event, data)).toThrow('Unauthorized');
  mockConfig.after = previous;
  (getGroupLocks as jest.Mock).mockReturnValue({ locked: () => true });
  expect(() => output(event, data)).toThrow('Unauthorized');
  (getGroupLocks as jest.Mock).mockReturnValue({ locked: () => false });
  expect(() =>
    output(event, {
      ...data,
      input: { title: 'Update', noteId: 'private-note' },
    })
  ).toThrow('notes.create');
});
test('limits output volume across note and activity calls', () => {
  for (let index = 0; index < 10; index += 1)
    output(event, { token, kind: 'activity', input: { title: 'Update' } });
  expect(() =>
    output(event, {
      token,
      kind: 'note',
      input: { title: 'Note', body: 'Body' },
    })
  ).toThrow('limit');
});
test('isolated hook context exposes only the standard create APIs', () => {
  expect(developerPreloadSource).toContain("output('activity', input)");
  expect(developerPreloadSource).toContain("output('note', input)");
  expect(developerPreloadSource).toContain('document, notify, activity, notes');
});

test('attributes custom outputs to the exact hook and rejects unknown hook IDs', () => {
  output(event, {
    token,
    kind: 'activity',
    hookId: 'prices',
    input: { title: 'Changed' },
  });
  expect(create).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      trigger: expect.objectContaining({
        hookId: 'prices',
        hookName: 'Price watcher',
        pageURL: event.senderFrame.url,
      }),
    })
  );
  expect(() =>
    output(event, {
      token,
      kind: 'activity',
      hookId: 'foreign',
      input: { title: 'Changed' },
    })
  ).toThrow('no longer enabled');
});

it('runs a preview draft through the normal runtime without writing notes or activity', async () => {
  const previewConfig = { ...mockConfig, after: "log('draft test')" };
  registerDeveloperPage(
    event.sender,
    '@preview',
    jest.fn(),
    () => undefined,
    () => previewConfig
  );
  const configure = (ipcMain.on as jest.Mock).mock.calls.find(
    ([name]) => name === 'site-developer-config'
  )![1];
  configure(event);
  expect(event.returnValue.after).toBe("log('draft test')");
  const receive = (ipcMain.on as jest.Mock).mock.calls.find(
    ([name]) => name === 'site-developer-event'
  )![1];
  receive(event, {
    token: event.returnValue.token,
    kind: 'success',
    value: 'Draft completed',
  });
  expect(create).not.toHaveBeenCalled();
  expect(() =>
    output(event, {
      token: event.returnValue.token,
      kind: 'notes',
      input: { title: 'Test', body: 'Draft' },
    })
  ).toThrow('Unauthorized');
  expect(saveNoteWithActivity).not.toHaveBeenCalled();
});

it('tracks each hook independently, preserves failure, and resets on a fresh run', () => {
  const receive = (ipcMain.on as jest.Mock).mock.calls.find(([name]) => name === 'site-developer-event')![1];
  receive(event, { token, kind: 'running', value: 'Starting', hookId: 'prices' });
  expect(developerState(event.sender, 'https://example.com').hookStatuses?.prices).toBe('running');
  receive(event, { token, kind: 'error', value: 'Failed', hookId: 'prices' });
  receive(event, { token, kind: 'hook-success', value: '' });
  receive(event, { token, kind: 'hook-success', value: 'prices' });
  expect(developerState(event.sender, 'https://example.com').hookStatuses).toEqual({ prices: 'error', '': 'success' });
  const configure = (ipcMain.on as jest.Mock).mock.calls.find(([name]) => name === 'site-developer-config')![1];
  configure(event);
  expect(developerState(event.sender, 'https://example.com').hookStatuses).toEqual({});
});

it('reruns one loaded hook without reloading and rejects disabled or duplicate runs', () => {
  rerunDeveloperHook(event.sender, 'https://example.com', 'prices');
  expect(event.sender.send).toHaveBeenLastCalledWith('site-developer-rerun', 'prices');
  expect(developerState(event.sender, 'https://example.com').hookStatuses?.prices).toBe('running');
  const calls = event.sender.send.mock.calls.length;
  rerunDeveloperHook(event.sender, 'https://example.com', 'prices');
  rerunDeveloperHook(event.sender, 'https://foreign.com', 'prices');
  rerunDeveloperHook(event.sender, 'https://example.com', 'missing');
  expect(event.sender.send).toHaveBeenCalledTimes(calls);
});

it('reruns only the selected hook and disposes its previous listeners and CSS', async () => {
  const { runInNewContext } = jest.requireActual('node:vm');
  const listeners: Record<string, (...args: any[]) => void> = {};
  const document = { addEventListener: jest.fn(), readyState: 'complete', runs: [] as string[], cleaned: [] as string[] };
  const css = { insertCSS: jest.fn(async () => 'css-key'), removeInsertedCSS: jest.fn(async () => {}) };
  const config = {
    token: 'runtime-token', before: '', after: '', css: '',
    hooks: ['one', 'two'].map((id) => ({ id, name: id, before: '', css: 'body {}', after: `document.runs.push('${id}'); onCleanup(() => document.cleaned.push('${id}'));` })),
  };
  const window: any = {};
  window.top = window;
  const intervals: ReturnType<typeof setInterval>[] = [];
  try {
  runInNewContext(developerPreloadSource, {
    require: () => ({ webFrame: css, ipcRenderer: {
      on: (name: string, callback: (...args: any[]) => void) => { listeners[name] = callback; },
      sendSync: () => config, send: jest.fn(), invoke: jest.fn(async () => false),
    } }),
    window, document, location: { href: 'https://example.com' },
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    AbortController, setTimeout, clearTimeout,
    setInterval: (...args: Parameters<typeof setInterval>) => { const timer = setInterval(...args); intervals.push(timer); return timer; }, clearInterval,
  });
  const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise<void>((resolve) => setImmediate(resolve)); };
  await settle();
  expect(document.runs).toEqual(['one', 'two']);
  listeners['site-developer-rerun']({}, 'one');
  await settle();
  expect(document.runs).toEqual(['one', 'two', 'one']);
  expect(document.cleaned).toEqual(['one']);
  expect(css.removeInsertedCSS).toHaveBeenCalledTimes(1);
  listeners['site-developer-stop']();
  listeners['site-developer-start-hook']({}, 'one');
  await settle();
  expect(document.runs).toEqual(['one', 'two', 'one', 'one']);
  listeners['site-developer-stop']();
  } finally { intervals.forEach(clearInterval); }
});

it('starts only the selected hook when its previous runtime has stopped', () => {
  resetDeveloperState(event.sender, 'https://example.com');
  rerunDeveloperHook(event.sender, 'https://example.com', 'prices');
  expect(event.sender.send).toHaveBeenLastCalledWith('site-developer-start-hook', 'prices');
  expect(developerState(event.sender, 'https://example.com').hookStatuses?.prices).toBe('running');
});

/** @jest-environment node */
import { EventEmitter } from 'events';
import { attachExtensionBrowserAPIs } from '../main/extensionBrowserAPIs';
import { registerExtensionWorkspace } from '../main/extensionWorkspaceGroups';

function fixture() {
  const handlers = new Map<
    string,
    { callback: (...args: any[]) => any; permission?: string }
  >();
  const extension = {
    id: 'owner',
    manifest: { permissions: ['debugger', 'tabGroups'] },
  };
  const other = { id: 'unprivileged', manifest: { permissions: [] } };
  const extensions = Object.assign(new EventEmitter(), {
    getAllExtensions: () => [extension, other],
  });
  const session = { extensions };
  const window = { id: 1 };
  const makeTab = (id: number, url = 'https://example.com/') => {
    let attached = false;
    const debuggerAPI = Object.assign(new EventEmitter(), {
      isAttached: () => attached,
      attach: jest.fn(() => {
        attached = true;
      }),
      detach: jest.fn(() => {
        attached = false;
        debuggerAPI.emit('detach', {}, 'target closed');
      }),
      sendCommand: jest.fn(async () => ({ result: { value: 'verified' } })),
    });
    return Object.assign(new EventEmitter(), {
      id,
      session,
      debugger: debuggerAPI,
      getURL: () => url,
      getTitle: () => 'Example',
      isDestroyed: () => false,
    });
  };
  const a = makeTab(11),
    b = makeTab(12),
    privileged = makeTab(13, 'chrome-extension://owner/control.html');
  const tabs = new Set([a, b, privileged]);
  const store = Object.assign(new EventEmitter(), {
    tabs,
    tabToWindow: new WeakMap([...tabs].map((tab) => [tab, window])),
    tabDetailsCache: new Map(
      [...tabs].map((tab) => [tab.id, { id: tab.id, groupId: -1 }]),
    ),
    getTabById: (id: number) => [...tabs].find((tab) => tab.id === id),
    impl: { assignTabDetails: jest.fn() },
  });
  const sendEvent = jest.fn();
  attachExtensionBrowserAPIs({
    ctx: {
      session,
      store,
      router: {
        sendEvent,
        apiHandler:
          () =>
          (name: string, callback: (...args: any[]) => any, options: any) =>
            handlers.set(name, { callback, ...options }),
      },
    },
  } as any);
  const call = (name: string, ...args: any[]) =>
    handlers.get(name)!.callback({ extension }, ...args);
  return {
    call,
    handlers,
    a,
    b,
    privileged,
    store,
    session,
    extension,
    sendEvent,
  };
}

test('groups are validated before mutation, maintain tab membership and filter event recipients', async () => {
  const { call, handlers, a, b, store, sendEvent, session } = fixture();
  let apps = [a, b].map((tab) => ({
    id: String(tab.id),
    name: 'Tab',
    url: 'https://example.com',
    icon: '',
    sessionId: String(tab.id),
    sessionProfileId: 'profile',
    sessionChromeUngrouped: true,
  }));
  const release = registerExtensionWorkspace({
    apps: () => apps,
    contents: (id) => [a, b].find((tab) => String(tab.id) === id) as any,
    window: () => store.tabToWindow.get(a) as any,
    profile: (value) => (value === session ? 'profile' : undefined),
    assertAccess: () => {},
    update: async (_window, changes) => {
      apps = apps.map((app) => ({
        ...app,
        ...changes.find((change) => change.id === app.id)?.changes,
      }));
    },
  });
  try {
    expect(handlers.get('tabGroups.get')?.permission).toBe('tabGroups');
    expect(() => call('tabs.group', { tabIds: [a.id, 999] })).toThrow(
      'unavailable',
    );
    expect(call('tabGroups.query', {})).toEqual([]);
    const id = await call('tabs.group', { tabIds: [a.id, b.id] });
    expect(store.tabDetailsCache.get(a.id)?.groupId).toBe(id);
    expect(
      await call('tabGroups.update', id, {
        title: 'Muse task',
        color: 'blue',
        collapsed: true,
      }),
    ).toMatchObject({ title: 'Muse task', color: 'blue', collapsed: true });
    expect(() =>
      call('tabGroups.update', id, { title: 'wrong', color: 'invalid' }),
    ).toThrow('color');
    expect(call('tabGroups.get', id).title).toBe('Muse task');
    const details: any = {};
    store.impl.assignTabDetails(details, a);
    expect(details.groupId).toBe(id);
    await call('tabs.ungroup', a.id);
    expect(store.tabDetailsCache.get(a.id)?.groupId).toBe(-1);
    await call('tabs.ungroup', b.id);
    expect(call('tabGroups.query', {})).toEqual([]);
    const groupEvents = sendEvent.mock.calls.filter((event) =>
      event[1].startsWith('tabGroups.'),
    );
    expect(groupEvents.every((event) => event[0] === 'owner')).toBe(true);
    expect(
      groupEvents.some((event) => event[1] === 'tabGroups.onRemoved'),
    ).toBe(true);
  } finally {
    release();
  }
});

test('debugger ownership, profile boundaries and privileged targets are enforced', async () => {
  const {
    call,
    handlers,
    a,
    privileged,
    store,
    session,
    extension,
    sendEvent,
  } = fixture();
  expect(handlers.get('debugger.attach')?.permission).toBe('debugger');
  expect(() =>
    call('debugger.attach', { tabId: privileged.id }, '1.3'),
  ).toThrow('privileged');
  expect(() => call('debugger.attach', { tabId: 999 }, '1.3')).toThrow(
    'unavailable',
  );
  expect(() => call('debugger.attach', { targetId: 'foreign' }, '1.3')).toThrow(
    'Only tab',
  );
  const originalSession = a.session;
  a.session = {} as any;
  expect(() => call('debugger.attach', { tabId: a.id }, '1.3')).toThrow(
    'profile',
  );
  a.session = originalSession;
  call('debugger.attach', { tabId: a.id }, '1.3');
  a.debugger.emit(
    'message',
    {},
    'Runtime.consoleAPICalled',
    { type: 'log' },
    '',
  );
  expect(sendEvent).toHaveBeenCalledWith(
    'owner',
    'debugger.onEvent',
    { tabId: a.id },
    'Runtime.consoleAPICalled',
    { type: 'log' },
  );
  expect(() =>
    handlers
      .get('debugger.sendCommand')!
      .callback(
        { extension: { id: 'attacker' } },
        { tabId: a.id },
        'Runtime.evaluate',
        {},
      ),
  ).toThrow('not attached');
  expect(() =>
    call('debugger.sendCommand', { tabId: a.id }, 'Target.getTargets'),
  ).toThrow('not supported');
  expect(() =>
    call('debugger.sendCommand', { tabId: a.id }, 'Page.navigate', {
      url: 'chrome://settings',
    }),
  ).toThrow('HTTP');
  await expect(
    call('debugger.sendCommand', { tabId: a.id }, 'Runtime.evaluate', {
      expression: 'document.title',
    }),
  ).resolves.toMatchObject({ result: { value: 'verified' } });
  expect(
    (await call('debugger.getTargets')).map((target: any) => target.tabId),
  ).not.toContain(privileged.id);
  session.extensions.emit('extension-unloaded', {}, extension);
  expect(a.debugger.isAttached()).toBe(false);
  expect(a.debugger.listenerCount('message')).toBe(0);
  expect(a.listenerCount('destroyed')).toBe(0);
  call('debugger.attach', { tabId: a.id }, '1.3');
  a.emit(
    'did-start-navigation',
    {},
    'chrome-extension://owner/panel.html',
    false,
    true,
  );
  expect(a.debugger.isAttached()).toBe(false);
  call('debugger.attach', { tabId: a.id }, '1.3');
  store.emit('tab-removed', a.id);
  expect(a.debugger.isAttached()).toBe(false);
});

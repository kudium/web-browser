/** @jest-environment node */
import {
  extensionWorkspaceGroups,
  registerExtensionWorkspace,
  chromeWorkspaceGroupId,
} from '../main/extensionWorkspaceGroups';
import type { IApp } from '../types';

function fixture() {
  const session = {} as any;
  const window = { id: 7 } as any;
  let apps: IApp[] = [
    {
      id: 'a',
      name: 'A',
      url: 'https://example.com',
      icon: '',
      sessionId: 'original',
      sessionProfileId: 'profile',
      sessionName: 'Original',
    },
    {
      id: 'b',
      name: 'B',
      url: 'https://example.com',
      icon: '',
      sessionId: 'original',
      sessionProfileId: 'profile',
      sessionName: 'Original',
    },
    {
      id: 'foreign',
      name: 'Other',
      url: 'https://example.com',
      icon: '',
      sessionId: 'other',
      sessionProfileId: 'other',
    },
  ];
  const tabs = new Map(
    apps.map((app) => [app.id, { session, isDestroyed: () => false }]),
  );
  let locked = false;
  const release = registerExtensionWorkspace({
    apps: () => apps,
    contents: (id) => tabs.get(id) as any,
    window: () => window,
    profile: (value) => (value === session ? 'profile' : undefined),
    assertAccess: () => {
      if (locked) throw new Error('Locked');
    },
    update: async (_window, changes) => {
      apps = apps.map((app) => ({
        ...app,
        ...changes.find((change) => change.id === app.id)?.changes,
      }));
    },
  });
  return {
    session,
    tabs,
    release,
    apps: () => apps,
    lock: () => {
      locked = true;
    },
  };
}
test('Chrome group operations mutate saved Kudium groups while preserving profile and stable IDs', async () => {
  const f = fixture();
  try {
    const api = extensionWorkspaceGroups(f.session)!;
    expect(api.query()).toHaveLength(1);
    const id = await api.group([f.tabs.get('a') as any]);
    expect(f.apps()[0].sessionId).not.toBe('original');
    expect(f.apps()[0].sessionProfileId).toBe('profile');
    expect(api.tabGroup(f.tabs.get('a') as any)).toBe(id);
    await api.update(id, {
      title: 'Task output',
      color: 'blue',
      collapsed: true,
    });
    expect(f.apps()[0]).toMatchObject({
      sessionName: 'Task output',
      sessionChromeColor: 'blue',
      sessionChromeCollapsed: true,
      groupDisplay: 'folder',
    });
    expect(extensionWorkspaceGroups(f.session)!.get(id).title).toBe(
      'Task output',
    );
    await api.group([f.tabs.get('b') as any], id);
    expect(f.apps()[1].sessionId).toBe(f.apps()[0].sessionId);
    expect(api.query()).toHaveLength(1);
    await api.ungroup([f.tabs.get('b') as any]);
    expect(f.apps()[1].sessionProfileId).toBe('profile');
    expect(api.query()).toHaveLength(1);
    expect(api.tabGroup(f.tabs.get('b') as any)).toBe(-1);
    expect(chromeWorkspaceGroupId(f.apps()[0].sessionId!)).toBe(id);
  } finally {
    f.release();
  }
});
test('workspace groups reject foreign profiles and locked groups', async () => {
  const f = fixture();
  try {
    const api = extensionWorkspaceGroups(f.session)!;
    await expect(api.group([f.tabs.get('foreign') as any])).rejects.toThrow(
      'profile',
    );
    f.lock();
    expect(api.query()).toEqual([]);
    await expect(api.group([f.tabs.get('a') as any])).rejects.toThrow('Locked');
  } finally {
    f.release();
  }
});

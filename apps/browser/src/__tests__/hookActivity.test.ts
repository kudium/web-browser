/** @jest-environment node */
import { ipcMain } from 'electron';
import {
  registerDeveloperPage,
  developerPreloadSource,
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
    false
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

/** @jest-environment node */
import { ipcMain } from 'electron';
import { registerActivity } from '../main/activity';
import { updateSiteSettings } from '../main/siteSettings';
const mockEntries = [
  {
    id: 'event',
    source: 'hook',
    groupId: 'group',
    trigger: {
      profile: 'profile',
      origin: 'https://example.com',
      hookId: 'prices',
    },
  },
];
let mockLocked = false;
jest.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: jest.fn() },
}));
jest.mock('../main/activityStore', () => ({
  ActivityStore: class {
    list() {
      return mockEntries;
    }
  },
}));
jest.mock('../main/localStorage', () => ({ safeStorage: {} }));
jest.mock('../main/groupLocks', () => ({
  getGroupLocks: () => ({ subscribe: jest.fn(), locked: () => mockLocked }),
}));
jest.mock('../main/siteSettings', () => ({
  getSiteSettings: () => ({
    developer: {
      enabled: true,
      before: '',
      after: '',
      css: '',
      hooks: [
        { id: 'prices', enabled: true },
        { id: 'other', enabled: true },
      ],
    },
  }),
  updateSiteSettings: jest.fn(),
}));
it('disables only the stored source hook and rejects hidden or untrusted entries', () => {
  registerActivity(() => true);
  const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
    ([name]) => name === 'browser-activity'
  )[1];
  const frame = {};
  const sender = { mainFrame: frame, once: jest.fn() };
  const event = { sender, senderFrame: frame };
  handler(event, { action: 'disableHook', id: 'event' });
  expect(updateSiteSettings).toHaveBeenCalledWith(
    'profile',
    'https://example.com',
    {
      developer: expect.objectContaining({
        enabled: true,
        hooks: [
          { id: 'prices', enabled: false },
          { id: 'other', enabled: true },
        ],
      }),
    }
  );
  mockLocked = true;
  expect(() => handler(event, { action: 'disableHook', id: 'event' })).toThrow(
    'unavailable'
  );
  expect(() =>
    handler(
      { ...event, senderFrame: {} },
      { action: 'disableHook', id: 'event' }
    )
  ).toThrow('Unauthorized');
  mockLocked = false;
});

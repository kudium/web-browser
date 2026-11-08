import fs from 'fs';
import os from 'os';
import path from 'path';
import { dialog, BrowserWindow } from 'electron';
import { transferGroup } from '../main/groupTransfer';
import { updateSiteSettings } from '../main/siteSettings';
import { showBrowserDialog } from '../main/dialogs';
import { IApp } from '../types';

jest.mock('../main/dialogs', () => ({ showBrowserDialog: jest.fn() }));
jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: jest.fn(),
    showMessageBox: jest.fn(),
    showSaveDialog: jest.fn(),
  },
}));
jest.mock('../main/siteSettings', () => ({
  siteOrigin: (url: string) => new URL(url).origin,
  updateSiteSettings: jest.fn(),
  getSiteSettings: () => ({
    developer: { enabled: true, before: 'original()', after: '', css: '' },
  }),
}));
jest.mock('../main/groupLocks', () => ({ isGroupLocked: () => false }));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'group-transfer-test-'));
const file = path.join(root, 'group.json');
const host = { isDestroyed: () => false } as BrowserWindow;
const source: IApp = {
  id: 'page',
  sessionId: 'source',
  sessionProfileId: 'shared',
  name: 'Example',
  sessionName: 'Work',
  url: 'https://example.com/',
  icon: '',
};
beforeEach(() => {
  jest.clearAllMocks();
  fs.writeFileSync(
    file,
    JSON.stringify({
      format: 'touchbox-group',
      version: 1,
      name: 'Work',
      pages: [{ name: 'Example', url: source.url }],
      developer: [
        {
          origin: 'https://example.com',
          config: {
            enabled: true,
            before: 'run()',
            after: '',
            css: '',
            hooks: [
              {
                id: 'hook',
                name: 'Hook',
                path: '/*',
                enabled: true,
                before: 'hook()',
                after: '',
                css: '',
              },
            ],
          },
        },
      ],
    })
  );
  (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
    canceled: false,
    filePaths: [file],
  });
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
test('cancelling hook review writes no settings or imported tabs', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 1 });
  expect(
    await transferGroup(host, () => [source], 'import', 'work')
  ).toBeNull();
  expect(updateSiteSettings).not.toHaveBeenCalled();
});
test('confirmed import isolates profile and leaves every hook disabled for review', async () => {
  (showBrowserDialog as jest.Mock).mockResolvedValue({ response: 0 });
  const result = await transferGroup(
    host,
    () => [source],
    'import',
    'destination'
  );
  expect(result?.reviewHooks).toBe(true);
  expect(result?.tabs[0]).toMatchObject({
    spaceId: 'destination',
    name: 'Example',
  });
  expect(result?.tabs[0].sessionId).not.toBe(source.sessionId);
  expect(result?.tabs[0].sessionProfileId).toBeUndefined();
  expect(updateSiteSettings).toHaveBeenCalledWith(
    result?.tabs[0].sessionId,
    'https://example.com',
    {
      developer: expect.objectContaining({
        enabled: false,
        before: 'run()',
        hooks: [expect.objectContaining({ enabled: false, before: 'hook()' })],
      }),
    }
  );
  expect(
    (showBrowserDialog as jest.Mock).mock.calls[0][1].importReview.hooks[0]
      .source
  ).toContain('hook()');
});
test('export includes hooks without profile, cookies or local project paths', async () => {
  const exported = path.join(root, 'export.json');
  (dialog.showSaveDialog as jest.Mock).mockResolvedValue({
    canceled: false,
    filePath: exported,
  });
  await transferGroup(host, () => [source], 'export', source.id);
  const data = JSON.parse(fs.readFileSync(exported, 'utf8'));
  expect(data.developer[0].config.before).toBe('original()');
  expect(data.pages[0].url).toBe(source.url);
  expect(data.sessionProfileId).toBeUndefined();
});

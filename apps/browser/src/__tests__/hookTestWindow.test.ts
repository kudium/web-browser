/** @jest-environment node */
import { BrowserWindow } from 'electron';
import { createHookTestWindow, validateHookTest } from '../main/hookTestWindow';
import { registerDeveloperPage } from '../main/siteDeveloper';
import { sampleGlobalHooks } from '../browser/sampleGlobalHooks';
jest.mock('../main/browserContextMenu', () => ({ showBrowserContextMenu: jest.fn() }));
jest.mock('../main/hookActions', () => ({ hookActionMenu: jest.fn(() => []) }));
jest.mock('electron', () => ({ BrowserWindow: jest.fn(() => mockWindow) }));
jest.mock('../main/siteDeveloper', () => ({
  registerDeveloperPage: jest.fn(),
  developerState: () => ({ status: 'success', logs: [] }),
  siteDeveloperPreload: () => '/test/preload.cjs',
}));
jest.mock('../main/globalHooks', () => ({ validGlobalHooks: () => true }));
const mockSession = {
  setPermissionRequestHandler: jest.fn(),
  setPermissionCheckHandler: jest.fn(),
  on: jest.fn(),
};
const mockContents = {
  id: 10,
  session: mockSession,
  setWindowOpenHandler: jest.fn(),
  on: jest.fn(),
  getURL: () => 'https://example.com',
  isDestroyed: () => false,
};
const mockWindow = {
  webContents: mockContents,
  once: jest.fn(),
  show: jest.fn(),
  loadURL: jest.fn(async () => {}),
  isDestroyed: () => false,
};
it('validates website URLs and honors pathname and domain exclusions', () => {
  const hook = sampleGlobalHooks[0];
  expect(validateHookTest(hook, 'https://example.com')).toBe(
    'https://example.com/'
  );
  expect(() => validateHookTest(hook, 'file:///tmp/page.html')).toThrow('HTTP');
  expect(() =>
    validateHookTest(hook, 'https://user:secret@example.com')
  ).toThrow('credentials');
  expect(() =>
    validateHookTest({ ...hook, path: '/articles/*' }, 'https://example.com')
  ).toThrow('does not match');
  expect(() =>
    validateHookTest(
      { ...hook, exclusions: ['*.example.com'] },
      'https://sub.example.com'
    )
  ).toThrow('excluded');
});
it('uses a disposable sandboxed website session and runs only the current draft', () => {
  const draft = sampleGlobalHooks[1];
  const publish = jest.fn();
  createHookTestWindow({} as any, draft, 'https://example.com', publish);
  expect(BrowserWindow).toHaveBeenCalledWith(
    expect.objectContaining({
      webPreferences: expect.objectContaining({
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: expect.stringMatching(/^hook-test-/),
        preload: '/test/preload.cjs',
      }),
    })
  );
  const [, , , scope, config] = (registerDeveloperPage as jest.Mock).mock
    .calls[0];
  expect(scope()).toBeUndefined();
  expect(config('https://example.com').hooks).toEqual([
    { ...draft, enabled: true },
  ]);
  expect(draft.enabled).toBe(false);
  expect(config('file:///tmp/test').enabled).toBe(false);
  expect(mockWindow.loadURL).toHaveBeenCalledWith('https://example.com/');
  expect(publish).toHaveBeenCalledWith({
    url: 'https://example.com/',
    status: 'loading',
    logs: [],
  });
});

it('only runs a restricted draft on allowed websites and their selected subdomains', () => {
  const hook = { ...sampleGlobalHooks[0], sites: [{ host: 'example.com', includeSubdomains: false }] };
  expect(validateHookTest(hook, 'https://example.com')).toBe('https://example.com/');
  expect(() => validateHookTest(hook, 'https://other.com')).toThrow('does not match');
  expect(() => validateHookTest(hook, 'https://news.example.com')).toThrow('does not match');
  expect(validateHookTest({ ...hook, sites: [{ host: 'example.com', includeSubdomains: true }] }, 'https://news.example.com')).toBe('https://news.example.com/');
  expect(() => validateHookTest(hook, 'https://example.com.evil.com')).toThrow('does not match');
});

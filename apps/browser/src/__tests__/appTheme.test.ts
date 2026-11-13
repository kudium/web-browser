/** @jest-environment node */
import { ipcMain } from 'electron';
import { registerAppThemeWindow, refreshAppThemes } from '../main/appTheme';
import { resolveAppTheme } from '../utils/appTheme';
jest.mock('electron', () => ({ ipcMain: { handle: jest.fn() } }));
const space = {
  id: 'work',
  color: 'iris' as const,
  useWebsiteColors: true,
  customColor: '#123456',
};
const createWindow = () => ({
  webContents: { mainFrame: {}, send: jest.fn() },
  once: jest.fn(),
  isDestroyed: () => false,
});
it('resolves the website choice, fallback and independently configured frame through one function', () => {
  expect(resolveAppTheme(space, '#ffffff')).toEqual({
    spaceId: 'work',
    primary: '#ffffff',
    frame: '#ffffff',
    contrast: '#102b29',
  });
  expect(
    resolveAppTheme({ ...space, frameColor: '#abcdef' }, '#ffffff').frame
  ).toBe('#abcdef');
  expect(resolveAppTheme(space, 'invalid').primary).toBe('#123456');
  expect(
    resolveAppTheme({ ...space, useWebsiteColors: false }, '#ffffff').primary
  ).toBe('#123456');
});
it('shares each browser theme with its child windows and follows Preferences reparenting', () => {
  const first = createWindow();
  const second = createWindow();
  const settings = createWindow();
  const editor = createWindow();
  let parent = first;
  registerAppThemeWindow(first as any, { producer: true });
  registerAppThemeWindow(second as any, { producer: true });
  registerAppThemeWindow(settings as any, { source: () => parent as any });
  registerAppThemeWindow(editor as any, { source: () => settings as any });
  const handler = (ipcMain.handle as jest.Mock).mock.calls[0][1];
  const event = (window: ReturnType<typeof createWindow>) => ({
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  });
  const one = resolveAppTheme(space, '#4285f4');
  const two = resolveAppTheme({ ...space, id: 'other' }, '#ff0000');
  handler(event(first), { action: 'publish', theme: one });
  handler(event(second), { action: 'publish', theme: two });
  expect(handler(event(settings), { action: 'get' })).toEqual(one);
  expect(handler(event(editor), { action: 'get' })).toEqual(one);
  parent = second;
  refreshAppThemes();
  expect(settings.webContents.send).toHaveBeenLastCalledWith(
    'app-theme-changed',
    two
  );
  expect(handler(event(editor), { action: 'get' })).toEqual(two);
  const fallback = resolveAppTheme({ ...space, id: 'other' });
  handler(event(second), { action: 'publish', theme: fallback });
  expect(settings.webContents.send).toHaveBeenLastCalledWith(
    'app-theme-changed',
    fallback
  );
  expect(() =>
    handler(event(settings), { action: 'publish', theme: one })
  ).toThrow('Invalid');
  expect(() =>
    handler({ ...event(first), senderFrame: {} }, { action: 'get' })
  ).toThrow('Untrusted');
  expect(() =>
    handler(event(first), {
      action: 'publish',
      theme: { ...one, primary: 'invalid' },
    })
  ).toThrow('Invalid');
});

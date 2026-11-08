import { EventEmitter } from 'events';
import { Menu } from 'electron';
import MenuBuilder from '../main/menu';
import {
  getBrowserPreferences,
  onBrowserPreferencesChanged,
} from '../main/preferences';
import { defaultPreferences } from '../browser/preferences';

jest.mock('electron', () => ({
  app: {},
  shell: {},
  Menu: {
    buildFromTemplate: jest.fn((template) => ({ template })),
    setApplicationMenu: jest.fn(),
  },
}));
jest.mock('../main/preferences', () => ({
  showBrowserPreferences: jest.fn(),
  getBrowserPreferences: jest.fn(),
  onBrowserPreferencesChanged: jest.fn(() => jest.fn()),
}));
it('rebuilds native menu accelerators from saved bindings and routes page actions to the workspace', () => {
  (getBrowserPreferences as jest.Mock).mockReturnValue(defaultPreferences);
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    webContents: { send: jest.fn(), on: jest.fn() },
  });
  const menu = new MenuBuilder({ mainWindow: window as any });
  menu.buildMenu();
  const template = (Menu.buildFromTemplate as jest.Mock).mock.calls.at(-1)[0];
  const browser = template.find((item: any) => item.label === 'Browser');
  const back = browser.submenu.find((item: any) => item.label === 'Go back');
  expect(back.accelerator).toBe('CommandOrControl+[');
  back.click();
  expect(window.webContents.send).toHaveBeenCalledWith(
    'browser-shortcut',
    'back'
  );
  (getBrowserPreferences as jest.Mock).mockReturnValue({
    ...defaultPreferences,
    shortcuts: { ...defaultPreferences.shortcuts, back: ['Alt+KeyB'] },
  });
  const refresh = (onBrowserPreferencesChanged as jest.Mock).mock.calls[0][0];
  refresh();
  const updated = (Menu.buildFromTemplate as jest.Mock).mock.calls
    .at(-1)[0]
    .find((item: any) => item.label === 'Browser');
  expect(
    updated.submenu.find((item: any) => item.label === 'Go back').accelerator
  ).toBe('Alt+B');
});

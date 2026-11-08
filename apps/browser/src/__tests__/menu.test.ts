jest.mock('../main/browserWindows', () => ({
  getBrowserWindows: () => undefined,
}));
import MenuBuilder from '../main/menu';

const send = jest.fn();
const create = jest.fn();
const showPreferences = jest.fn();
jest.mock('electron', () => ({
  app: {},
  BrowserWindow: { getFocusedWindow: () => undefined },
  Menu: {
    buildFromTemplate: jest.fn((template) => ({ template })),
    setApplicationMenu: jest.fn(),
  },
  shell: { openExternal: jest.fn() },
}));
jest.mock('../main/preferences', () => ({
  getBrowserPreferences: () => ({
    shortcuts: require('../browser/shortcuts').defaultShortcuts,
  }),
  onBrowserPreferencesChanged: () => jest.fn(),
  showBrowserPreferences: (...args: unknown[]) => showPreferences(...args),
}));
jest.mock('../main/shellContextMenu', () => ({
  shellContextMenu: jest.fn(() => []),
}));
const window = {
  once: jest.fn(),
  isDestroyed: () => false,
  show: jest.fn(),
  focus: jest.fn(),
  webContents: { send, toggleDevTools: jest.fn() },
};
const builder = () =>
  new MenuBuilder({ mainWindow: window as any, createNewWindow: create });
const children = (menu: any) => menu.submenu as any[];

beforeEach(() => jest.clearAllMocks());

test('provides a branded standard browser menu on both platforms', () => {
  const mac = builder().buildDarwinTemplate();
  expect(mac.map((item) => item.label)).toEqual([
    'Kudium Browser',
    'File',
    'Edit',
    'View',
    'History',
    'Workspace',
    'AI',
    'Developer',
    'Window',
    'Help',
  ]);
  expect(
    children(mac[0]).find((item) => item.label === 'About Kudium Browser').click
  ).toEqual(expect.any(Function));
  expect(
    builder()
      .buildDefaultTemplate()
      .map((item) => item.label)
  ).toEqual([
    'File',
    'Edit',
    'View',
    'History',
    'Workspace',
    'AI',
    'Developer',
    'Window',
    'Help',
  ]);
});

test('dispatches workspace and AI actions through the existing renderer bridge', () => {
  const menus = builder().buildDarwinTemplate();
  for (const [section, label, action] of [
    ['File', 'Import Group…', 'import-group'],
    ['File', 'Export Current Group…', 'export-group'],
    ['Workspace', 'Current Group Settings…', 'group-settings'],
    ['AI', 'Browser Tasks', 'ai-tasks'],
    ['Developer', 'Project Files, Terminals and Scripts…', 'developer'],
  ]) {
    children(menus.find((item) => item.label === section))
      .find((item) => item.label === label)
      .click();
    expect(send).toHaveBeenLastCalledWith('browser-shortcut', action);
  }
});

test('opens exact settings sections and keeps editing roles native', () => {
  const menus = builder().buildDarwinTemplate();
  children(menus.find((item) => item.label === 'AI'))
    .find((item) => item.label === 'Models, Connections and Skills…')
    .click();
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ view: 'settings', preferencesSection: 'ai' })
  );
  expect(
    children(menus.find((item) => item.label === 'Edit'))
      .filter((item) => item.role)
      .map((item) => item.role)
  ).toEqual([
    'undo',
    'redo',
    'cut',
    'copy',
    'paste',
    'pasteAndMatchStyle',
    'selectAll',
  ]);
  children(menus[0])
    .find((item) => item.label === 'Settings…')
    .click();
  expect(showPreferences).toHaveBeenCalledWith(window);
});

test('hides browser interface inspection in production', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const menus = builder().buildDefaultTemplate();
    expect(
      children(menus.find((item) => item.label === 'Developer')).some(
        (item) => item.label === 'Inspect Browser Interface'
      )
    ).toBe(false);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

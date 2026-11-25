import {
  app,
  Menu,
  shell,
  BrowserWindow,
  MenuItemConstructorOptions,
} from 'electron';
import { onWindowClosed } from './windowLifecycle';
import {
  showBrowserPreferences,
  getBrowserPreferences,
  onBrowserPreferencesChanged,
} from './preferences';
import { menuAccelerator } from '../browser/shortcuts';
import type { BrowserShortcut } from '../browser/contracts';
import type { NewWindowParams } from '../types';
import { shellContextMenu } from './shellContextMenu';
import { getBrowserWindows } from './browserWindows';
import { showAboutDialog } from './about';
import { checkForAppUpdates } from './appUpdates';
import { createPrivateWindow } from './privateBrowsing';

export default class MenuBuilder {
  mainWindow: BrowserWindow;

  contextMenuSetup = false;

  createNewWindow?: (params: NewWindowParams) => void;

  constructor({
    mainWindow,
    createNewWindow,
  }: {
    mainWindow: BrowserWindow;
    createNewWindow?: (params: NewWindowParams) => void;
  }) {
    this.mainWindow = mainWindow;
    this.createNewWindow = createNewWindow;
    const stop = onBrowserPreferencesChanged(() => {
      if (!this.mainWindow.isDestroyed()) this.buildMenu();
    });
    onWindowClosed(this.mainWindow, stop);
  }

  action(
    label: string,
    action: BrowserShortcut,
    accelerator = true
  ): MenuItemConstructorOptions {
    const bindings = getBrowserPreferences().shortcuts;
    return {
      label,
      accelerator:
        accelerator && action in bindings
          ? menuAccelerator(bindings[action as keyof typeof bindings][0])
          : undefined,
      ...(action === 'sidebar' ? { registerAccelerator: false } : {}),
      click: () => {
        const focused = BrowserWindow.getFocusedWindow();
        const host =
          focused && getBrowserWindows()?.contains(focused)
            ? focused
            : this.mainWindow;
        if (host.isDestroyed()) return;
        host.show();
        host.focus();
        host.webContents.send('browser-shortcut', action);
      },
    };
  }

  settings(
    label: string,
    preferencesSection: string
  ): MenuItemConstructorOptions {
    return {
      label,
      click: () =>
        this.createNewWindow?.({
          view: 'settings',
          preferencesSection,
          options: { width: 1080, height: 800, minWidth: 760, minHeight: 600 },
        }),
    };
  }

  buildMenu(): Menu {
    if (!this.contextMenuSetup) {
      this.setupContextMenu();
      this.contextMenuSetup = true;
    }
    const menu = Menu.buildFromTemplate(
      process.platform === 'darwin'
        ? this.buildDarwinTemplate()
        : this.buildDefaultTemplate()
    );
    Menu.setApplicationMenu(menu);
    return menu;
  }

  setupContextMenu(): void {
    this.mainWindow.webContents.on('context-menu', (_, props) => {
      const inspect =
        process.env.NODE_ENV === 'development' ||
        process.env.DEBUG_PROD === 'true';
      const items = shellContextMenu(
        this.mainWindow.webContents,
        props,
        inspect
      );
      if (items.length)
        Menu.buildFromTemplate(items).popup({ window: this.mainWindow });
    });
  }

  template(mac: boolean): MenuItemConstructorOptions[] {
    const separator: MenuItemConstructorOptions = { type: 'separator' };
    const preferences: MenuItemConstructorOptions = {
      label: 'Settings…',
      accelerator: menuAccelerator(
        getBrowserPreferences().shortcuts.preferences[0]
      ),
      click: () => showBrowserPreferences(this.mainWindow),
    };
    const file: MenuItemConstructorOptions = {
      label: 'File',
      submenu: [
        this.action('New Window', 'new-window'),
        {
          label: 'New Private Window',
          accelerator: 'CommandOrControl+Shift+N',
          click: () => createPrivateWindow(),
        },
        this.action('New Tab…', 'command', false),
        this.action('New Group…', 'new-session', false),
        this.action('New Space…', 'new-space', false),
        separator,
        this.action('Import Group…', 'import-group', false),
        this.action('Export Current Group…', 'export-group', false),
        separator,
        this.action('Open Location…', 'command'),
        this.action('Unload Tab', 'close-tab'),
        this.action('Remove Tab', 'remove-tab'),
        {
          label: 'Close Window',
          role: 'close',
        },
        separator,
        this.action('Print…', 'print'),
        this.action('Copy Clean Link', 'copy-clean-link'),
        ...(!mac
          ? [
              separator,
              preferences,
              separator,
              { label: 'Exit', role: 'quit' as const },
            ]
          : []),
      ],
    };
    const edit: MenuItemConstructorOptions = {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        separator,
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
        separator,
        this.action('Find in Page…', 'find'),
      ],
    };
    const view: MenuItemConstructorOptions = {
      label: 'View',
      submenu: [
        this.action('Back', 'back'),
        this.action('Forward', 'forward'),
        separator,
        this.action('Reload Page', 'reload'),
        this.action('Reload Without Cache', 'reload-ignore-cache'),
        separator,
        this.action('Zoom In', 'zoom-in'),
        this.action('Zoom Out', 'zoom-out'),
        this.action('Actual Size', 'zoom-reset'),
        separator,
        this.action('Show / Hide Space Sidebar', 'sidebar'),
        this.action('Show / Hide Assistant', 'ai-sidebar'),
        {
          label: 'Task Manager…',
          accelerator: 'Shift+Esc',
          click: () => {
            const focused = BrowserWindow.getFocusedWindow();
            const parent = focused && getBrowserWindows(focused)?.contains(focused) ? focused : this.mainWindow;
            this.createNewWindow?.({ view: 'task-manager', options: { parent, width: 900, height: 640, minWidth: 560, minHeight: 420 } });
          },
        },
        { label: 'Enter / Exit Full Screen', role: 'togglefullscreen' },
      ],
    };
    const history: MenuItemConstructorOptions = {
      label: 'History',
      submenu: [
        this.action('Show History', 'history'),
        this.action('Reopen Closed Tab', 'reopen-tab'),
        separator,
        this.action('Show Downloads', 'downloads'),
      ],
    };
    const workspace: MenuItemConstructorOptions = {
      label: 'Workspace',
      submenu: [
        this.action('Current Group Settings…', 'group-settings', false),
        this.action('Next Tab', 'next-tab'),
        this.action('Previous Tab', 'previous-tab'),
        separator,
        this.action('Next Space', 'next-space'),
        this.action('Previous Space', 'previous-space'),
        separator,
        this.settings('Manage Groups, Spaces and Archive…', 'apps'),
      ],
    };
    const ai: MenuItemConstructorOptions = {
      label: 'AI',
      submenu: [
        this.action('Open Assistant', 'assistant', false),
        this.action('Browser Tasks', 'ai-tasks', false),
        separator,
        this.settings('Models, Connections and Skills…', 'ai'),
        this.settings('Personal Data…', 'passwords'),
      ],
    };
    const developer: MenuItemConstructorOptions = {
      label: 'Developer',
      submenu: [
        this.action(
          'Project Files, Terminals and Scripts…',
          'developer',
          false
        ),
        this.action('Website Settings and Hooks…', 'site-settings', false),
        separator,
        this.action('Developer Tools for This Page', 'page-devtools'),
        {label:'Dock Developer Tools', submenu:[this.action('Right', 'page-devtools-right', false),this.action('Bottom', 'page-devtools-bottom', false),this.action('Panel', 'page-devtools-panel', false),this.action('Separate Window', 'page-devtools-window', false)]},
        separator,
        this.action('Extensions', 'extensions'),
        this.settings('Manage Extensions…', 'extensions'),
        separator,
        ...(process.env.NODE_ENV === 'development' ||
        process.env.DEBUG_PROD === 'true'
          ? [
              separator,
              {
                label: 'Inspect Browser Interface',
                click: () => this.mainWindow.webContents.toggleDevTools(),
              },
            ]
          : []),
      ],
    };
    const help: MenuItemConstructorOptions = {
      label: 'Help',
      submenu: [
        {
          label: 'What’s New',
          click: () => {
            shell.openExternal('https://browser.kudium.com/whats-new');
          },
        },
        {
          label: 'Kudium Browser Website',
          click: () => {
            shell.openExternal('https://kudium.com');
          },
        },
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal(
              'https://github.com/samtax01/KudiumBrowser#readme'
            );
          },
        },
        {
          label: 'Community',
          click: () => {
            shell.openExternal(
              'https://github.com/samtax01/KudiumBrowser/discussions'
            );
          },
        },
        {
          label: 'Support Kudium…',
          click: () => {
            void shell.openExternal('https://github.com/sponsors/kudium');
          },
        },
        {
          label: 'Report an Issue…',
          click: () => {
            shell.openExternal(
              'https://github.com/samtax01/KudiumBrowser/issues'
            );
          },
        },
        ...(!mac
          ? [
              separator,
              {
                label: 'About Kudium Browser',
                click: () => {
                  void showAboutDialog(this.mainWindow);
                },
              },
            ]
          : []),
      ],
    };
    return [
      ...(mac
        ? [
            {
              label: 'Kudium Browser',
              submenu: [
                {
                  label: 'About Kudium Browser',
                  click: () => {
                    void showAboutDialog(this.mainWindow);
                  },
                },
                {
                  label: 'Check for updates…',
                  click: () => {
                    showBrowserPreferences(this.mainWindow, 'updates');
                    void checkForAppUpdates();
                  },
                },
                separator,
                preferences,
                separator,
                { role: 'services' as const },
                separator,
                { label: 'Hide Kudium Browser', role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                separator,
                { label: 'Quit Kudium Browser', role: 'quit' as const },
              ],
            },
          ]
        : []),
      file,
      edit,
      view,
      history,
      workspace,
      ai,
      developer,
      { label: 'Window', role: 'windowMenu' },
      help,
    ];
  }

  buildDarwinTemplate() {
    return this.template(true);
  }

  buildDefaultTemplate() {
    return this.template(false);
  }
}

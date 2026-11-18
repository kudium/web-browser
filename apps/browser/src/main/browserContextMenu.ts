import {
  BrowserWindow,
  clipboard,
  ContextMenuParams,
  dialog,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
  WebContents,
} from 'electron';
import { nativeMenuLabels, openTargetLabel } from '../browser/menuLabels';
import { getBrowserPreferences } from './preferences';
import { cleanLink } from '../utils/cleanLink';
import {
  defaultSearchEngines,
  searchUrl,
  validateSearchEngines,
} from '../browser/searchEngines';

/** Build native menus against the clicked web contents, including split panes. */
export function showBrowserContextMenu(
  window: BrowserWindow,
  contents: WebContents,
  params: ContextMenuParams,
  openTab: (url: string, newSession?: boolean) => void,
  extensions: MenuItem[] = [],
  pictureInPicture: (() => void) | undefined = undefined,
  hookActions: MenuItemConstructorOptions[] = []
) {
  const items: (MenuItemConstructorOptions | MenuItem)[] = [];
  const group = (entries: (MenuItemConstructorOptions | MenuItem)[]) => {
    if (!entries.length) return;
    if (items.length) items.push({ type: 'separator' });
    items.push(...entries);
  };
  const canOpen = (url: string) => {
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  };
  const openingActions = (
    target: string,
    url: string
  ): MenuItemConstructorOptions[] => [
    {
      label: openTargetLabel(target, false),
      enabled: canOpen(url),
      click: () => openTab(url),
    },
    {
      label: openTargetLabel(target, true),
      enabled: canOpen(url),
      click: () => openTab(url, true),
    },
    {
      label: 'Creates a new tab with separate cookies and login state',
      enabled: false,
    },
  ];
  if (params.linkURL) {
    group([
      ...openingActions('link', params.linkURL),
      {
        label: nativeMenuLabels.saveLinkAs,
        enabled: canOpen(params.linkURL),
        click: () => contents.downloadURL(params.linkURL),
      },
      {
        label: nativeMenuLabels.copyLinkAddress,
        click: () => clipboard.writeText(params.linkURL),
      },
      { label: 'Copy Clean Link', enabled: canOpen(params.linkURL),
        click: () => clipboard.writeText(cleanLink(params.linkURL)) },
    ]);
  }
  if (params.mediaType === 'image' && params.srcURL) {
    group([
      ...openingActions('image', params.srcURL),
      {
        label: nativeMenuLabels.saveImageAs,
        click: () => contents.downloadURL(params.srcURL),
      },
      {
        label: nativeMenuLabels.copyImage,
        click: () => contents.copyImageAt(params.x, params.y),
      },
      {
        label: nativeMenuLabels.copyImageAddress,
        click: () => clipboard.writeText(params.srcURL),
      },
    ]);
  }
  if (['video', 'audio'].includes(params.mediaType) && params.srcURL) {
    group(openingActions(params.mediaType, params.srcURL));
  }
  if (
    params.mediaType === 'video' &&
    pictureInPicture &&
    (params.mediaFlags?.canShowPictureInPicture ||
      params.mediaFlags?.isShowingPictureInPicture)
  ) {
    group([
      {
        label: params.mediaFlags.isShowingPictureInPicture
          ? 'Exit Picture in Picture'
          : 'Picture in Picture',
        click: pictureInPicture,
      },
    ]);
  }
  if (params.isEditable) {
    const flags = params.editFlags;
    if (params.misspelledWord) {
      group([
        ...(params.dictionarySuggestions.length
          ? params.dictionarySuggestions.map((word) => ({
              label: word,
              click: () => contents.replaceMisspelling(word),
            }))
          : [{ label: 'No Spelling Suggestions', enabled: false }]),
        {
          label: nativeMenuLabels.addToDictionary,
          click: () =>
            contents.session.addWordToSpellCheckerDictionary(
              params.misspelledWord
            ),
        },
      ]);
    }
    group([
      { label: 'Undo', enabled: flags.canUndo, click: () => contents.undo() },
      { label: 'Redo', enabled: flags.canRedo, click: () => contents.redo() },
    ]);
    group([
      { label: 'Cut', enabled: flags.canCut, click: () => contents.cut() },
      { label: 'Copy', enabled: flags.canCopy, click: () => contents.copy() },
      {
        label: 'Paste',
        enabled: flags.canPaste,
        click: () => contents.paste(),
      },
      {
        label: nativeMenuLabels.pasteAndMatchStyle,
        enabled: flags.canPaste,
        click: () => contents.pasteAndMatchStyle(),
      },
      {
        label: nativeMenuLabels.selectAll,
        enabled: flags.canSelectAll,
        click: () => contents.selectAll(),
      },
    ]);
  } else if (params.selectionText) {
    group([{ label: 'Copy', click: () => contents.copy() }]);
  }
  if (params.selectionText) {
    const preferences = getBrowserPreferences();
    const engines = validateSearchEngines(
      preferences.searchEngines || defaultSearchEngines
    );
    const engine =
      engines.find((entry) => entry.id === preferences.searchEngine) ||
      engines[0];
    group([
      ...(process.platform === 'darwin'
        ? [
            {
              label: 'Look Up',
              click: () => contents.showDefinitionForSelection(),
            },
          ]
        : []),
      {
        label: 'Search With',
        submenu: [
          {
            label: 'Kudium AI',
            enabled: params.selectionText.trim().length <= 30000,
            click: () => {
              if (!window.isDestroyed())
                window.webContents.send(
                  'browser-ai-selection',
                  params.selectionText.trim()
                );
            },
          },
          { type: 'separator' },
          ...[engine, ...engines.filter((entry) => entry.id !== engine.id)].map(
            (entry) => ({
              label: entry.name,
              click: () =>
                openTab(searchUrl(entry, params.selectionText.trim())),
            })
          ),
        ],
      },
    ]);
  }
  if (
    !params.isEditable &&
    !params.selectionText &&
    !params.linkURL &&
    params.mediaType === 'none'
  ) {
    group([
      {
        label: 'Back',
        enabled: contents.navigationHistory.canGoBack(),
        click: () => contents.navigationHistory.goBack(),
      },
      {
        label: 'Forward',
        enabled: contents.navigationHistory.canGoForward(),
        click: () => contents.navigationHistory.goForward(),
      },
      { label: 'Reload', click: () => contents.reload() },
    ]);
  }
  group([
    {
      label: nativeMenuLabels.savePageAs,
      click: async () => {
        const result = await dialog.showSaveDialog(window, {
          defaultPath: `${
            contents.getTitle().replace(/[<>:"/\\|?*]/g, '_') || 'Page'
          }.html`,
          filters: [{ name: 'Web Page, Complete', extensions: ['html'] }],
        });
        if (result.canceled || !result.filePath || contents.isDestroyed())
          return;
        try {
          await contents.savePage(result.filePath, 'HTMLComplete');
        } catch {
          if (!window.isDestroyed())
            dialog.showErrorBox(
              'Unable to Save Page',
              'The page could not be saved. Please try again.'
            );
        }
      },
    },
    { label: nativeMenuLabels.print, click: () => contents.print() },
    { label: 'Copy Clean Page Link', enabled: canOpen(contents.getURL()),
      click: () => clipboard.writeText(cleanLink(contents.getURL())) },
  ]);
  group(hookActions);
  group(extensions);
  group([
    {
      label: nativeMenuLabels.inspect,
      click: () => contents.inspectElement(params.x, params.y),
    },
  ]);
  if (process.platform === 'darwin') {
    group([
      ...(params.selectionText
        ? [
            {
              label: 'Speech',
              submenu: [
                { role: 'startSpeaking' as const },
                { role: 'stopSpeaking' as const },
              ],
            },
          ]
        : []),
      {
        role: 'shareMenu',
        sharingItem: {
          texts: params.selectionText ? [params.selectionText] : undefined,
          urls: params.selectionText
            ? undefined
            : [params.linkURL || contents.getURL()],
        },
      },
      { role: 'services' },
    ]);
  }
  contents.focus();
  Menu.buildFromTemplate(items).popup({ window });
}

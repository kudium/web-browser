import { AdvancedPreferences, defaultAdvanced } from './advancedPreferences';
import { defaultSyncSettings, SyncSettings } from './cloudSync';
import { defaultShortcuts, ShortcutBindings } from './shortcuts';
import { SearchEngine, defaultSearchEngines } from './searchEngines';

/** Shared, engine-neutral preferences. Add controls to the registry below. */
export interface BrowserPreferences {
  advanced: AdvancedPreferences;
  automaticallyDownloadUpdates: boolean;
  automaticallyInstallUpdates: boolean;
  shareUsageDiagnostics: boolean;
  writeBrowserInstructions: boolean;
  tabDisplayMode: 'horizontal' | 'hover' | 'click';
  folderHoverPreviews: boolean;
  showUnpinnedGroups: boolean;
  addressBarPlacement: 'sidebar' | 'header';
  addressBarExtensionsExpanded: boolean;
  showExtensionIcons: boolean;
  extensionToolbarOrder: string[] | null;
  translucentChrome: boolean;
  smartTabLabels: boolean;
  cloudSync: SyncSettings;
  shortcuts: ShortcutBindings;
  keepPinnedTabsAwake: boolean;
  keepFavoriteTabsAwake: boolean;
  discardExcludedSites: string[];
  discardInactiveTabs: boolean;
  discardAfterMinutes: number;
  searchEngine: string;
  searchEngines: SearchEngine[];
  zoom: number;
  spellcheck: boolean;
  spellcheckLanguage: string;
  defaultFontSize: number;
  permissions: 'ask' | 'block';
  allowPopups: boolean;
  askDownloadLocation: boolean;
  downloadDirectory: string;
}
export const defaultPreferences: BrowserPreferences = {
  advanced: defaultAdvanced,
  automaticallyDownloadUpdates: true,
  automaticallyInstallUpdates: true,
  shareUsageDiagnostics: true,
  writeBrowserInstructions: true,
  tabDisplayMode: 'horizontal',
  folderHoverPreviews: true,
  showUnpinnedGroups: false,
  addressBarPlacement: 'sidebar',
  addressBarExtensionsExpanded: true,
  showExtensionIcons: true,
  extensionToolbarOrder: null,
  translucentChrome: true,
  smartTabLabels: true,
  cloudSync: defaultSyncSettings(),
  shortcuts: defaultShortcuts,
  keepPinnedTabsAwake: false,
  keepFavoriteTabsAwake: false,
  discardExcludedSites: [],
  discardInactiveTabs: true,
  discardAfterMinutes: 60,
  searchEngine: 'duckduckgo',
  searchEngines: defaultSearchEngines,
  zoom: 1,
  spellcheck: true,
  spellcheckLanguage: '',
  defaultFontSize: 16,
  permissions: 'ask',
  allowPopups: true,
  askDownloadLocation: true,
  downloadDirectory: '',
};
export interface PreferenceControl {
  key: keyof BrowserPreferences;
  section: string;
  title: string;
  description: string;
  kind: 'select' | 'toggle' | 'number';
  min?: number;
  max?: number;
  options?: { label: string; value: string | number }[];
}
export const preferenceControls: PreferenceControl[] = [
  {
    key: 'writeBrowserInstructions',
    section: 'ai',
    title: 'Project browser instructions',
    description:
      'Add BROWSER.md and a reference in AGENTS.md when linking a project. Contains connection instructions and group context, never credentials. Turning this off stops future updates; existing files are kept.',
    kind: 'toggle',
  },
  {
    key: 'automaticallyDownloadUpdates',
    section: 'updates',
    title: 'Automatically download updates',
    description:
      'Download new versions in the background. Turn this off to choose when to download from the sidebar banner.',
    kind: 'toggle',
  },
  {
    key: 'automaticallyInstallUpdates',
    section: 'updates',
    title: 'Install downloaded updates when I quit',
    description:
      'Install a ready update when you quit the browser. Your browsing is never interrupted by an automatic restart. Turn this off to install only when you choose Restart to update.',
    kind: 'toggle',
  },
  {
    key: 'shareUsageDiagnostics',
    section: 'privacy',
    title: 'Share usage and diagnostics',
    description:
      'Help improve Kudium with anonymous feature usage and error types through PostHog. Website content, chats, file paths and credentials are never included.',
    kind: 'toggle',
  },
  {
    key: 'showUnpinnedGroups',
    section: 'appearance',
    title: 'Unpinned groups',
    description:
      'Show a separate section below pinned groups. When off, all groups appear together above the divider.',
    kind: 'toggle',
  },
  {
    key: 'tabDisplayMode',
    section: 'appearance',
    title: 'Group tab display',
    description:
      'Show horizontal tabs, or keep the browser compact with a popup anchored to the group. Single-page groups do not need a popup. Use the right arrow key to open a popup from the keyboard.',
    kind: 'select',
    options: [
      { label: 'Horizontal tab strip', value: 'horizontal' },
      { label: 'Popup on hover', value: 'hover' },
      { label: 'Popup on click', value: 'click' },
    ],
  },
  {
    key: 'folderHoverPreviews',
    section: 'appearance',
    title: 'Preview closed folders on hover',
    description:
      'Browse groups in a closed folder without expanding it. Click the folder to expand it normally.',
    kind: 'toggle',
  },
  {
    key: 'addressBarPlacement',
    section: 'appearance',
    title: 'Address bar position',
    description:
      'Keep a compact address in the sidebar, or show the full URL above the tabs.',
    kind: 'select',
    options: [
      { label: 'Sidebar', value: 'sidebar' },
      { label: 'Header above tabs', value: 'header' },
    ],
  },
  {
    key: 'addressBarExtensionsExpanded',
    section: 'appearance',
    title: 'Expand address bar extensions',
    description:
      'Show pinned extensions and the Extensions picker inside the address bar. You can also toggle this beside Site settings.',
    kind: 'toggle',
  },
  {
    key: 'showExtensionIcons',
    section: 'appearance',
    title: 'Show pinned extension icons',
    description:
      'Pin icons from the Extensions picker and reorder them in Manage extensions. The Extensions button stays available when icons are hidden.',
    kind: 'toggle',
  },
  {
    key: 'translucentChrome',
    section: 'appearance',
    title: 'Glassy sidebar and frame',
    description:
      'Blend the sidebar and frame with the desktop on macOS. Reduce Transparency and Increase Contrast use solid backgrounds automatically.',
    kind: 'toggle',
  },
  {
    key: 'smartTabLabels',
    section: 'appearance',
    title: 'Smart tab customizations',
    description:
      'Show distinguishing title text or URL paths for similar tabs. Your custom tab names stay unchanged. Full titles remain available on hover.',
    kind: 'toggle',
  },
  {
    key: 'discardInactiveTabs',
    section: 'performance',
    title: 'Save memory with sleeping tabs',
    description:
      'Unload long-idle hidden pages. Tabs stay saved and reload when selected. Editors, media, downloads and pages with unload warnings are protected.',
    kind: 'toggle',
  },
  {
    key: 'discardAfterMinutes',
    section: 'performance',
    title: 'Put inactive tabs to sleep after',
    description:
      'Enter 1–1440 minutes. Only hidden tabs are eligible; visible split-view panes stay loaded.',
    kind: 'number',
    min: 1,
    max: 1440,
  },
  {
    key: 'keepPinnedTabsAwake',
    section: 'performance',
    title: 'Keep pinned tabs awake',
    description: 'Pinned groups and tabs will not be put to sleep.',
    kind: 'toggle',
  },
  {
    key: 'keepFavoriteTabsAwake',
    section: 'performance',
    title: 'Keep favorite tabs awake',
    description: 'Favorite tabs will not be put to sleep.',
    kind: 'toggle',
  },
  {
    key: 'searchEngine',
    section: 'search',
    title: 'Default search engine',
    description: 'Used when you enter a search in the address bar.',
    kind: 'select',
    options: [
      { label: 'DuckDuckGo', value: 'duckduckgo' },
      { label: 'Google', value: 'google' },
      { label: 'Bing', value: 'bing' },
    ],
  },
  {
    key: 'zoom',
    section: 'appearance',
    title: 'Default page zoom',
    description:
      'Applies to all website views. Individual pages can still be zoomed with keyboard shortcuts.',
    kind: 'select',
    options: [0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((value) => ({
      label: `${Math.round(value * 100)}%`,
      value,
    })),
  },
  {
    key: 'defaultFontSize',
    section: 'appearance',
    title: 'Default font size',
    description:
      'For websites without their own font size. Applies to newly opened browser views.',
    kind: 'select',
    options: [12, 14, 16, 18, 20, 24].map((value) => ({
      label: `${value}px`,
      value,
    })),
  },
  {
    key: 'permissions',
    section: 'privacy',
    title: 'Website permissions',
    description:
      'Control requests for camera, microphone, location, notifications and other device access.',
    kind: 'select',
    options: [
      { label: 'Ask every time', value: 'ask' },
      { label: 'Block all requests', value: 'block' },
    ],
  },
  {
    key: 'allowPopups',
    section: 'privacy',
    title: 'Allow sites to open tabs',
    description: 'Open website popups in tabs within the current group.',
    kind: 'toggle',
  },
  {
    key: 'spellcheck',
    section: 'languages',
    title: 'Spell checking',
    description: 'Check spelling as you type on websites.',
    kind: 'toggle',
  },
  {
    key: 'askDownloadLocation',
    section: 'downloads',
    title: 'Ask where to save each file',
    description: 'Show a native save dialog before downloading.',
    kind: 'toggle',
  },
];
export interface PreferenceProfile {
  id: string;
  name: string;
  extensions: number;
}
export interface PreferenceInfo {
  defaultBrowser?: boolean;
  extensionCatalog?: { id: string; name: string }[];
  profiles: PreferenceProfile[];
  languages: string[];
  versions: { kudiumbrowser: string; engine: string; chromium: string };
}
export type PreferenceAction =
  | 'network-test'
  | 'network-log-start'
  | 'network-log-stop'
  | 'storage-info'
  | 'performance-info'
  | 'set-default-browser'
  | 'sync-status'
  | 'shortcut-capture-start'
  | 'shortcut-capture-end'
  | 'info'
  | 'choose-download-directory'
  | 'open-download-directory'
  | 'clear-cache'
  | 'clear-data'
  | 'devtools'
  | 'extensions'
  | 'store'
  | 'reveal-config'
  | 'reset';

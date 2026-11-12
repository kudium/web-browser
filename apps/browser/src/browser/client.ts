import type { BrowserClient } from './contracts';

// The renderer uses this contract; transport selection belongs to this adapter.
export const browser: BrowserClient = {
  nativeAppearance: (appearance) =>
    window.electron?.browser?.nativeAppearance?.(appearance) ??
    Promise.resolve(),
  removeGroup: (id, allowArchive) =>
    window.electron.browser.removeGroup(id, allowArchive),
  capture: (request) => window.electron.browser.capture(request),
  history: (action, id) => window.electron.browser.history(action, id),
  onHistory: (callback) => window.electron.browser.onHistory(callback),
  downloads: (action, id) => window.electron.browser.downloads(action, id),
  downloadRecovery: () => window.electron.browser.downloadRecovery(),
  downloadThumbnail: (id) => window.electron.browser.downloadThumbnail(id),
  onDownloads: (callback) => window.electron.browser.onDownloads(callback),
  tooltip: (request) => window.electron.browser.tooltip(request),
  nativeMenu: (items) => window.electron.browser.nativeMenu(items),
  confirm: (prompt) => window.electron.browser.confirm(prompt),
  showEmojiPicker: () => window.electron.browser.showEmojiPicker(),
  chooseSpaceIcon: () => window.electron.browser.chooseSpaceIcon(),
  onTabRequest: (callback) => window.electron.browser.onTabRequest(callback),
  sync: (layout) => window.electron.browser.sync(layout),
  command: (command) => window.electron.browser.command(command),
  accountSync: (action, input) =>
    window.electron.browser.accountSync(action, input),
  preferences: (action, patch) =>
    window.electron.browser.preferences(action, patch),
  appUpdates: (action) => window.electron.browser.appUpdates(action),
  onAppUpdates: (callback) => window.electron.browser.onAppUpdates(callback),
  preferenceAction: (action, profileId) =>
    window.electron.browser.preferenceAction(action, profileId),
  onPreferences: (callback) => window.electron.browser.onPreferences(callback),
  onSnapshots: (callback) => window.electron.browser.onSnapshots(callback),
  onSpaceWheel: (callback) => window.electron.browser.onSpaceWheel(callback),
  onShortcut: (callback) => window.electron.browser.onShortcut(callback),
  onState: (callback) => window.electron.browser.onState(callback),
};

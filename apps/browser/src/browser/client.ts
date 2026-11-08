import type { BrowserClient } from './contracts';

// The renderer uses this contract; transport selection belongs to this adapter.
export const browser: BrowserClient = {
  removeGroup: (id) => window.electron.browser.removeGroup(id),
  capture: (request) => window.electron.browser.capture(request),
  history: (action, id) => window.electron.browser.history(action, id),
  onHistory: (callback) => window.electron.browser.onHistory(callback),
  downloads: (action, id) => window.electron.browser.downloads(action, id),
  downloadRecovery: () => window.electron.browser.downloadRecovery(),
  downloadThumbnail: (id) => window.electron.browser.downloadThumbnail(id),
  onDownloads: (callback) => window.electron.browser.onDownloads(callback),
  nativeMenu: (items) => window.electron.browser.nativeMenu(items),
  confirm: (prompt) => window.electron.browser.confirm(prompt),
  showEmojiPicker: () => window.electron.browser.showEmojiPicker(),
  chooseSpaceIcon: () => window.electron.browser.chooseSpaceIcon(),
  onTabRequest: (callback) => window.electron.browser.onTabRequest(callback),
  sync: (layout) => window.electron.browser.sync(layout),
  command: (command) => window.electron.browser.command(command),
  preferences: (action, patch) =>
    window.electron.browser.preferences(action, patch),
  preferenceAction: (action, profileId) =>
    window.electron.browser.preferenceAction(action, profileId),
  onPreferences: (callback) => window.electron.browser.onPreferences(callback),
  onSnapshots: (callback) => window.electron.browser.onSnapshots(callback),
  onShortcut: (callback) => window.electron.browser.onShortcut(callback),
  onState: (callback) => window.electron.browser.onState(callback),
};

import type { WebContents } from 'electron';

const panelOwners = new WeakMap<WebContents, WebContents>();
const linkHandlers = new WeakMap<WebContents, (url: string, groupId?: string) => Promise<void>>();
export function openWindowLink(contents: WebContents, value: string, groupId?: string) {
  const destination = externalLinkURL(value);
  if (destination) {
    const destinationArgs: [string, string?] = groupId ? [destination, groupId] : [destination];
    linkHandlers.get(contents)?.(...destinationArgs).catch(() => {});
  }
}
export function isAssistantPanelOf(child: WebContents, owner: WebContents) {
  return panelOwners.get(child) === owner;
}

export function externalLinkURL(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol))
      return undefined;
    if (url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Only the app document may inhabit a window with the trusted UI preload. */
export function protectWindowNavigation(
  contents: WebContents,
  documentURL: string,
  openExternal: (url: string, groupId?: string) => Promise<void>,
  assistantPanels = false
) {
  linkHandlers.set(contents, openExternal);
  const document = new URL(documentURL);
  document.hash = '';
  const allowed = (value: string) => {
    try {
      const candidate = new URL(value);
      candidate.hash = '';
      return candidate.href === document.href;
    } catch {
      return false;
    }
  };
  const navigate = (event: { preventDefault: () => void }, url: string) => {
    if (!allowed(url)) event.preventDefault();
  };
  contents.on('will-navigate', (event, url) => {
    navigate(event, url);
    if (!allowed(url)) openWindowLink(contents, url);
  });
  contents.on('will-redirect', navigate);
  contents.on('did-create-window', (child) => {
    if (!assistantPanels) return;
    const childContents = child.webContents;
    panelOwners.set(childContents, contents);
    child.once('closed', () => panelOwners.delete(childContents));
    child.webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        (input.meta || input.control) &&
        input.key.toLowerCase() === 'w'
      ) {
        event.preventDefault();
        child.close();
      }
    });
    protectWindowNavigation(child.webContents, 'about:blank', openExternal);
    child.setMinimumSize(320, 360);
  });
  contents.setWindowOpenHandler(({ url, frameName }) => {
    if (
      assistantPanels &&
      url === 'about:blank' &&
      (/^kudium-assistant-(assistant|notes|activity|tasks|developer)$/.test(frameName) ||
        /^kudium-sidebar-[a-z][a-z0-9-]{0,63}$/.test(frameName))
    ) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webviewTag: false,
          },
        },
      };
    }
    openWindowLink(contents, url);
    return { action: 'deny' };
  });
}

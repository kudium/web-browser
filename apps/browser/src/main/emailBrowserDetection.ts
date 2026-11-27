import type { BrowserWindow, WebContents } from 'electron';
import type { IApp } from '../types';
import { aiGroupId } from '../browser/aiGroups';
import { EMAIL_BROWSER_PROVIDERS, isEmailAddress, type EmailBrowserDetection, type EmailBrowserInbox } from '../browser/email';
import { loginProfileKey } from '../utils/groups';

type Reader = { tabs: () => IApp[]; contents: (id: string) => WebContents | undefined };
const readers = new WeakMap<WebContents, Reader>();
export function registerEmailBrowserDetection(host: BrowserWindow, reader: Reader) {
  readers.set(host.webContents, reader);
  return () => { if (readers.get(host.webContents) === reader) readers.delete(host.webContents); };
}

/** Isolated-world probe: account chrome only, never inbox/body text, inputs or cookies. */
export function detectEmailAccountLabels(providerId: string): string[] {
  const selectors: Record<string, string> = {
    google: 'a[aria-label^="Google Account:"],button[aria-label^="Google Account:"],a[href*="accounts.google.com/SignOutOptions"]',
    microsoft: '#O365_MainLink_Me,#mectrl_main_trigger,[data-testid="account-manager-button"],[data-testid="me-control"]',
    icloud: '[data-testid="account-menu-button"],.account-menu-button,.account-name',
    fastmail: '[data-testid="account-menu"],.v-AccountSwitcher,.v-AccountMenu',
    proton: '[data-testid="user-dropdown:button"],[data-testid="user-dropdown"]',
  };
  const selector = selectors[providerId];
  if (!selector) return [];
  const addresses = new Set<string>();
  const deadline = performance.now() + 8;
  const elements = document.querySelectorAll(selector);
  for (let index = 0; index < Math.min(elements.length, 64) && performance.now() < deadline; index++) {
    const element = elements[index] as HTMLElement;
    if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
    const labels = [element.getAttribute('aria-label'), element.getAttribute('title'), element.innerText];
    for (const label of labels) {
      if (!label || label.length > 1024) continue;
      const matches = label.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}/gi) || [];
      matches.slice(0, 10).forEach((address) => addresses.add(address.toLowerCase()));
    }
  }
  return [...addresses].slice(0, 10);
}

function inboxURL(providerId: EmailBrowserInbox['providerId'], value: string): string | undefined {
  const provider = EMAIL_BROWSER_PROVIDERS.find((item) => item.id === providerId);
  if (!provider || providerId === 'custom') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !(provider.hosts as readonly string[]).includes(url.hostname)) return undefined;
    if (providerId === 'icloud' && !/^\/mail(?:\/|$)/.test(url.pathname)) return undefined;
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return undefined; }
}

export async function detectBrowserEmail(reader: Reader, groupId: string, providerId: EmailBrowserInbox['providerId']): Promise<EmailBrowserDetection> {
  const tabs = reader.tabs().filter((tab) => !tab.archived && aiGroupId(tab) === groupId);
  const profile = tabs[0] && loginProfileKey(tabs[0]);
  const candidates = tabs.filter((tab) => loginProfileKey(tab) === profile).flatMap((tab) => {
    const page = reader.contents(tab.id);
    if (!page || page.isDestroyed()) return [];
    const url = inboxURL(providerId, page.getURL());
    return url ? [{ tab, page, url, originalURL: page.getURL() }] : [];
  }).slice(0, 6);
  const probes = candidates.map((candidate) => {
    const state = { navigated: false };
    const onNavigation = (_event: unknown, _url: string, _inPlace: boolean, mainFrame: boolean) => { if (mainFrame) state.navigated = true; };
    candidate.page.on('did-start-navigation', onNavigation);
    return { ...candidate, state, onNavigation };
  });
  try {
    const results = await Promise.all(probes.map(async ({ page }) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result: unknown = await Promise.race([
          page.executeJavaScriptInIsolatedWorld(999, [{ code: `(${detectEmailAccountLabels.toString()})(${JSON.stringify(providerId)})` }]),
          new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 600); }),
        ]);
        return Array.isArray(result) ? result.slice(0, 10).filter(isEmailAddress) : [];
      } catch { return []; }
      finally { if (timer) clearTimeout(timer); }
    }));
    const currentTabs = reader.tabs().filter((tab) => !tab.archived && aiGroupId(tab) === groupId);
    if (!currentTabs[0] || loginProfileKey(currentTabs[0]) !== profile) return { accounts: [] };
    const accounts = probes.flatMap(({ tab, page, url, originalURL, state }, index) => {
      const current = currentTabs.find((item) => item.id === tab.id);
      if (state.navigated || page.isDestroyed() || page.getURL() !== originalURL || reader.contents(tab.id) !== page || !current || loginProfileKey(current) !== loginProfileKey(tab)) return [];
      return results[index].map((address) => ({ address, tabId: tab.id, url }));
    });
    // Same account in duplicate tabs needs one choice. Distinct account routes remain explicit.
    const unique = new Map(accounts.map((account) => [`${account.address.toLowerCase()}:${account.url}`, account]));
    return { accounts: [...unique.values()] };
  } finally { probes.forEach(({ page, onNavigation }) => page.removeListener('did-start-navigation', onNavigation)); }
}

export function detectEmailForWindow(sender: WebContents, groupId: unknown, providerId: unknown) {
  if (typeof groupId !== 'string' || !groupId || groupId.length > 1024 || !EMAIL_BROWSER_PROVIDERS.some((provider) => provider.id === providerId)) throw new Error('Choose a tab group and email service.');
  const reader = readers.get(sender);
  return reader ? detectBrowserEmail(reader, groupId, providerId as EmailBrowserInbox['providerId']) : Promise.resolve({ accounts: [] });
}

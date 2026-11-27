import { EventEmitter } from 'events';
import type { WebContents } from 'electron';
import { detectBrowserEmail, detectEmailAccountLabels, detectEmailForWindow } from '../main/emailBrowserDetection';
import { aiGroupId } from '../browser/aiGroups';
import type { IApp } from '../types';

const tab: IApp = { id: 'mail', sessionId: 'work', sessionProfileId: 'work-profile', name: 'Gmail', url: 'https://mail.google.com/mail/u/1/', icon: '' };
function page(url = tab.url, result: unknown = ['owner@example.com']) {
  return Object.assign(new EventEmitter(), { isDestroyed: () => false, getURL: () => url, executeJavaScriptInIsolatedWorld: jest.fn(async () => result) }) as unknown as WebContents;
}
function visibleHTML(html: string) {
  document.body.innerHTML = html;
  document.querySelectorAll('*').forEach((element) => { element.getClientRects = () => [{ }] as any; });
}
afterEach(() => { document.body.innerHTML = ''; jest.useRealTimers(); });

it('reads the Gmail account label without collecting message addresses or form values', () => {
  visibleHTML('<a aria-label="Google Account: Atlas (owner@example.com)"></a><main>Message from sender@example.com</main><input value="secret@example.com">');
  expect(detectEmailAccountLabels('google')).toEqual(['owner@example.com']);
  expect(detectEmailAccountLabels('custom')).toEqual([]);
});
it('supports account controls for Outlook and Proton and ignores hidden controls', () => {
  visibleHTML('<button id="mectrl_main_trigger" title="owner@outlook.com"></button><button data-testid="user-dropdown:button" aria-label="owner@proton.me"></button>');
  expect(detectEmailAccountLabels('microsoft')).toEqual(['owner@outlook.com']);
  expect(detectEmailAccountLabels('proton')).toEqual(['owner@proton.me']);
  (document.querySelector('button') as HTMLElement).style.visibility = 'hidden';
  expect(detectEmailAccountLabels('microsoft')).toEqual([]);
});
it('returns only accessible group tabs on the selected provider and keeps the account route', async () => {
  const contents = page();
  const foreign = page('https://mail.google.com/mail/u/0/');
  const unrelated = page('https://example.com/');
  const tabs = [tab, { ...tab, id: 'foreign', sessionId: 'personal' }, { ...tab, id: 'unrelated' }];
  const reader = { tabs: () => tabs, contents: (id: string) => id === 'mail' ? contents : id === 'foreign' ? foreign : unrelated };
  await expect(detectBrowserEmail(reader, aiGroupId(tab), 'google')).resolves.toEqual({ accounts: [{ address: 'owner@example.com', tabId: 'mail', url: tab.url }] });
  expect(foreign.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  expect(unrelated.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  await expect(detectBrowserEmail(reader, aiGroupId(tab), 'microsoft')).resolves.toEqual({ accounts: [] });
});
it('drops results if the group loses access, changes profile or navigates during a probe', async () => {
  for (const change of ['lock', 'profile', 'navigate']) {
    const contents = page();
    let tabs = [tab];
    let finish!: (value: unknown) => void;
    (contents.executeJavaScriptInIsolatedWorld as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const reader = { tabs: () => tabs, contents: () => tabs.length ? contents : undefined };
    const pending = detectBrowserEmail(reader, aiGroupId(tab), 'google');
    if (change === 'lock') tabs = [];
    if (change === 'profile') tabs = [{ ...tab, sessionProfileId: 'other-profile' }];
    if (change === 'navigate') contents.emit('did-start-navigation', {}, tab.url, false, true);
    finish(['owner@example.com']);
    await expect(pending).resolves.toEqual({ accounts: [] });
    expect(contents.listenerCount('did-start-navigation')).toBe(0);
  }
});
it('bounds busy pages to 600ms and checks earlier results again after another tab finishes', async () => {
  jest.useFakeTimers();
  const fast = page(); const slow = page();
  (slow.executeJavaScriptInIsolatedWorld as jest.Mock).mockImplementation(() => new Promise(() => {}));
  const reader = { tabs: () => [tab, { ...tab, id: 'slow' }], contents: (id: string) => id === 'mail' ? fast : slow };
  const pending = detectBrowserEmail(reader, aiGroupId(tab), 'google');
  await Promise.resolve(); await Promise.resolve();
  fast.emit('did-start-navigation', {}, tab.url, false, true);
  jest.advanceTimersByTime(600);
  await expect(pending).resolves.toEqual({ accounts: [] });
  expect(jest.getTimerCount()).toBe(0);
  expect(fast.listenerCount('did-start-navigation')).toBe(0);
});
it('validates requests and exposes no detector to unregistered windows', async () => {
  expect(() => detectEmailForWindow({} as WebContents, '', 'google')).toThrow();
  expect(() => detectEmailForWindow({} as WebContents, 'group', 'unknown')).toThrow();
  await expect(detectEmailForWindow({} as WebContents, 'group', 'google')).resolves.toEqual({ accounts: [] });
});

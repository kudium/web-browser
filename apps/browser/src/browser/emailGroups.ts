import type { IApp } from '../types';
import { aiGroupId, aiGroups, scopedAITabs } from './aiGroups';
import { EMAIL_BROWSER_PROVIDERS, parseEmailBrowserInbox, type EmailBrowserInbox } from './email';
import { loginProfileKey } from '../utils/groups';

export const browserInboxId = (inbox: EmailBrowserInbox) => inbox.id || `${inbox.providerId}:${inbox.address.toLowerCase()}`;
export function groupBrowserInboxes(tabs: IApp[], groupId: string) {
  const members = tabs.filter((tab) => !tab.archived && aiGroupId(tab) === groupId);
  const source = members.find((tab) => tab.browserEmails || tab.browserEmail);
  return (source?.browserEmails || (source?.browserEmail ? [source.browserEmail] : []))
    .map(parseEmailBrowserInbox).filter((value): value is EmailBrowserInbox => !!value);
}
export function groupBrowserInbox(tabs: IApp[], groupId: string) { return groupBrowserInboxes(tabs, groupId)[0]; }

/** Applied through AppManager.set, using the existing workspace and lock checks. */
export function updateGroupBrowserInbox(tabs: IApp[], groupId: string, value: EmailBrowserInbox | undefined, inboxId?: string): IApp[] {
  if (!tabs.some((tab) => !tab.archived && aiGroupId(tab) === groupId))
    throw new Error('This tab group is unavailable. Choose another group.');
  const inbox = value === undefined ? undefined : parseEmailBrowserInbox(value);
  if (value !== undefined && !inbox) throw new Error('Enter a valid email address and HTTPS inbox URL.');
  const existing = groupBrowserInboxes(tabs, groupId);
  const id = inboxId || (inbox && browserInboxId(inbox));
  let next = inbox ? [...existing.filter((item) => browserInboxId(item) !== id), { ...inbox, id: id || crypto.randomUUID() }] : inboxId ? existing.filter((item) => browserInboxId(item) !== inboxId) : [];
  if (next.length > 20) throw new Error('A group can have up to 20 browser inboxes.');
  return tabs.map((tab) => aiGroupId(tab) === groupId ? { ...tab, browserEmail: undefined, browserEmails: next.length ? next : undefined } : tab);
}

/** Input tabs must already be filtered by the browser's existing access rules. */
export function browserEmailContexts(tabs: IApp[], scope: string | null) {
  const allowed = scopedAITabs(tabs, scope);
  return aiGroups(allowed).flatMap((group) => groupBrowserInboxes(allowed, group.id).flatMap((inbox) => {
    const provider = EMAIL_BROWSER_PROVIDERS.find((item) => item.id === inbox.providerId)!;
    const source = allowed.find((tab) => aiGroupId(tab) === group.id && (tab.browserEmails?.length || parseEmailBrowserInbox(tab.browserEmail)));
    if (!source) return [];
    return [{
      id: browserInboxId(inbox),
      groupId: group.id,
      groupName: group.name,
      sourceTabId: source.id,
      ...inbox,
      provider: provider.label,
      // This is the user's association, not evidence of a live authenticated page.
      requiresSignInCheck: true,
      tabs: group.tabs.filter((tab) => {
        const member = allowed.find((item) => item.id === tab.id);
        if (!source || !member || loginProfileKey(member) !== loginProfileKey(source)) return false;
        try {
          const url = new URL(tab.url);
          const accountRoute = inbox.providerId === 'google' && new URL(inbox.url).pathname.match(/\/u\/(\d+)(?:\/|$)/)?.[1];
          if (accountRoute && url.pathname.match(/\/u\/(\d+)(?:\/|$)/)?.[1] !== accountRoute) return false;
          return url.protocol === 'https:' && (inbox.providerId === 'custom'
            ? url.origin === new URL(inbox.url).origin
            : (provider.hosts as readonly string[]).includes(url.hostname));
        } catch { return false; }
      }).map((tab) => ({ tabId: tab.id, name: tab.name, url: tab.url })),
    }];
  }));
}

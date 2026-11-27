import { browserEmailContexts, groupBrowserInbox, groupBrowserInboxes, updateGroupBrowserInbox, browserInboxId } from '../browser/emailGroups';
import { parseEmailBrowserInbox } from '../browser/email';
import { aiGroupId } from '../browser/aiGroups';
import { commandDestination } from '../utils/commandNavigation';
import { duplicateGroup, moveTab } from '../utils/tabMoves';
import { isBrowserLayout } from '../main/browserRequests';
import type { IApp } from '../types';

const inbox = { providerId: 'google' as const, address: 'work@example.com', url: 'https://mail.google.com/' };
const work: IApp = { id: 'work', sessionId: 'session', sessionProfileId: 'profile', spaceId: 'work', sessionName: 'Work', name: 'Example', url: 'https://example.com/', icon: '' };
const other: IApp = { ...work, id: 'other', spaceId: 'personal', sessionName: 'Personal' };

it('saves the association on every member of only the chosen group and restores it from saved tabs', () => {
  const archived = { ...work, id: 'archived', archived: true };
  const updated = updateGroupBrowserInbox([work, archived, other], aiGroupId(work), inbox);
  expect(updated.map((tab) => tab.browserEmails)).toEqual([[expect.objectContaining(inbox)], [expect.objectContaining(inbox)], undefined]);
  expect(groupBrowserInbox(JSON.parse(JSON.stringify(updated)), aiGroupId(work))).toEqual(expect.objectContaining(inbox));
  expect(updateGroupBrowserInbox(updated, aiGroupId(work), undefined).map((tab) => tab.browserEmails)).toEqual([undefined, undefined, undefined]);
  expect(() => updateGroupBrowserInbox([archived], aiGroupId(work), inbox)).toThrow('unavailable');
});

it('returns only configured inboxes and tabs within accessible scope and their own login profile', () => {
  const configured = { ...work, browserEmail: inbox };
  const mail = { ...configured, id: 'mail', url: 'https://mail.google.com/mail/u/0/' };
  const otherProfile = { ...mail, id: 'disposable', sessionProfileId: 'disposable-profile' };
  const spoof = { ...mail, id: 'spoof', url: 'https://mail.google.com.evil.test/' };
  const personal = { ...other, browserEmail: { ...inbox, address: 'personal@example.com' } };
  const contexts = browserEmailContexts([configured, mail, otherProfile, spoof, personal], aiGroupId(work));
  expect(contexts).toHaveLength(1);
  expect(contexts[0]).toMatchObject({ address: inbox.address, groupId: aiGroupId(work), requiresSignInCheck: true, tabs: [{ tabId: 'mail' }] });
  expect(browserEmailContexts([configured, personal], null)).toHaveLength(2);
  expect(() => browserEmailContexts([configured], aiGroupId(other))).toThrow('unavailable');
});

it('rejects unsafe or mismatched inbox metadata at the layout boundary', () => {
  for (const patch of [
    { address: 'invalid' }, { providerId: 'unknown' }, { url: 'http://mail.google.com/' },
    { url: 'https://mail.google.com.evil.test/' }, { url: 'https://user:secret@mail.google.com/' },
    { url: 'https://mail.google.com/?token=secret' }, { url: 'javascript:alert(1)' },
  ]) {
    expect(parseEmailBrowserInbox({ ...inbox, ...patch })).toBeUndefined();
    expect(isBrowserLayout({ apps: [{ ...work, browserEmail: { ...inbox, ...patch } }], visible: [] })).toBe(false);
  }
  expect(parseEmailBrowserInbox({ ...inbox, providerId: 'custom', url: 'https://mail.example.com/inbox' })).toBeDefined();
  expect(isBrowserLayout({ apps: [{ ...work, browserEmail: inbox }], visible: [] })).toBe(true);
});

it('retains the configured login session when opening a mail tab and keeps new groups unconfigured', () => {
  const source = { ...work, browserEmail: inbox };
  expect(commandDestination([source], source, inbox.url, false, 'work').app).toMatchObject({ sessionId: work.sessionId, sessionProfileId: work.sessionProfileId, browserEmail: inbox });
  expect(commandDestination([source], source, inbox.url, true, 'work').app?.browserEmail).toBeUndefined();
  const destination = { ...other, browserEmail: { ...inbox, address: 'personal@example.com' } };
  expect(moveTab([source, destination], source.id, source.url, destination)[0].browserEmail).toEqual(destination.browserEmail);
  expect(moveTab([source], source.id, source.url)[0].browserEmail).toBeUndefined();
  expect(duplicateGroup([source], source.id).find((tab) => tab.id !== source.id)?.browserEmail).toBeUndefined();
});

it('keeps multiple browser inbox mappings in one group and removes only the chosen one', () => {
  const first = updateGroupBrowserInbox([work], aiGroupId(work), inbox);
  const second = { providerId: 'proton' as const, address: 'work@proton.me', url: 'https://mail.proton.me/' };
  const both = updateGroupBrowserInbox(first, aiGroupId(work), second);
  expect(groupBrowserInboxes(both, aiGroupId(work))).toHaveLength(2);
  expect(browserEmailContexts(both, aiGroupId(work)).map((item) => item.address)).toEqual([inbox.address, second.address]);
  const removed = updateGroupBrowserInbox(both, aiGroupId(work), undefined, browserInboxId(inbox));
  expect(groupBrowserInboxes(removed, aiGroupId(work))).toEqual([expect.objectContaining(second)]);
});

it('uses the detected Gmail account route instead of another signed-in account tab', () => {
  const configured = { ...work, browserEmail: { ...inbox, url: 'https://mail.google.com/mail/u/1/' } };
  const otherAccount = { ...configured, id: 'account-zero', url: 'https://mail.google.com/mail/u/0/' };
  const chosenAccount = { ...configured, id: 'account-one', url: 'https://mail.google.com/mail/u/1/#inbox' };
  const contexts = browserEmailContexts([configured, otherAccount, chosenAccount], aiGroupId(work));
  expect(contexts[0].tabs.map((item) => item.tabId)).toEqual(['account-one']);
});

it('maps Zoho browser inboxes while rejecting lookalike provider hosts', () => {
  const zoho = { providerId: 'zoho' as const, address: 'owner@example.com', url: 'https://mail.zoho.eu/' };
  expect(parseEmailBrowserInbox(zoho)).toMatchObject(zoho);
  expect(parseEmailBrowserInbox({ ...zoho, url: 'https://mail.zoho.eu.evil.test/' })).toBeUndefined();
  const configured = updateGroupBrowserInbox([work], aiGroupId(work), zoho);
  const mail = { ...configured[0], id: 'zoho-mail', url: zoho.url };
  expect(browserEmailContexts([...configured, mail], aiGroupId(work))[0]).toMatchObject({ provider: 'Zoho Mail', tabs: [{ tabId: 'zoho-mail' }] });
});

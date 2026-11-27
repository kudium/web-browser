import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { EmailPage } from '../components/UI/EmailPage';
import { AppManager } from '../utils/AppManager';
import { aiGroupId } from '../browser/aiGroups';
import type { IApp } from '../types';
import type { EmailStatus } from '../browser/email';

jest.mock('../browser/client', () => ({ browser: { command: jest.fn() } }));
jest.mock('../utils/EventBus', () => ({ eventBus: { on: jest.fn(() => () => {}), dispatch: jest.fn() } }));
const empty: EmailStatus = { available: true, unavailable: ['microsoft'], aliases: [], messages: [], aliasProviders: [], mailboxes: [] };
const configured: EmailStatus = {
  ...empty, unavailable: [],
  aliasProviders: [
    { id: 'alias-work', providerId: 'simplelogin', label: 'SimpleLogin', summary: 'work@mail.test', configuredAt: 1, destinations: [{ id: '10', email: 'work@mail.test' }] },
    { id: 'alias-personal', providerId: 'simplelogin', label: 'SimpleLogin', summary: 'personal@mail.test', configuredAt: 1 },
  ],
  mailboxes: [
    { id: 'inbox-work', providerId: 'imap', label: 'Fastmail', summary: 'work@mail.test', configuredAt: 1 },
    { id: 'inbox-personal', providerId: 'google', label: 'Gmail', summary: 'personal@mail.test', configuredAt: 1 },
  ],
  aliases: [
    { id: '1', accountId: 'alias-work', email: 'work@sl.test', providerId: 'simplelogin', hostname: 'example.com', forwardTo: ['work@mail.test'], enabled: true, createdAt: Date.now() },
    { id: '1', accountId: 'alias-personal', email: 'personal@sl.test', providerId: 'simplelogin', forwardTo: ['personal@mail.test'], enabled: true, createdAt: Date.now() },
  ],
  messages: [
    { id: '1', mailboxId: 'inbox-work', from: 'Example <no-reply@example.com>', to: ['work@sl.test'], subject: 'Confirm work account', receivedAt: Date.now(), text: 'Your code is 482913', links: ['https://example.com/verify?token=1'], codes: ['482913'] },
    { id: '1', mailboxId: 'inbox-personal', from: 'Friend', to: ['personal@mail.test'], subject: 'Personal message', receivedAt: Date.now(), text: 'Hello', links: [], codes: [] },
  ],
};
function mount(status: EmailStatus, onFocusTab?: (id: string) => void) {
  const email = jest.fn(async (_request: unknown) => status);
  Object.assign(window, { electron: { email, onEmailChanged: () => () => {} } });
  Object.assign(navigator, { clipboard: { writeText: jest.fn(async () => undefined) } });
  render(<Theme><EmailPage active currentHostname="example.com" onFocusTab={onFocusTab} /></Theme>);
  return email;
}
beforeAll(() => {
  Object.defineProperty(global, 'ResizeObserver', { configurable: true, value: class { observe() {} unobserve() {} disconnect() {} } });
});
beforeEach(() => { localStorage.clear(); jest.restoreAllMocks(); jest.clearAllMocks(); });

it('has two clear tabs and adds providers without a permanent setup form', async () => {
  const email = mount(empty);
  expect(screen.getByRole('radio', { name: 'Aliases' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('radio', { name: 'Mailboxes' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Email service')).toBeNull();
  fireEvent.click((await screen.findAllByRole('button', { name: 'Add alias provider' }))[0]);
  fireEvent.change(await screen.findByLabelText('API key'), { target: { value: 'key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'connect', providerId: 'simplelogin', values: { apiKey: 'key', baseUrl: 'https://app.simplelogin.io' } }));
});

it('groups aliases inside their owner and targets the selected provider account', async () => {
  const email = mount(configured);
  expect(await screen.findByRole('button', { name: /work@mail.test.*SimpleLogin/ })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: /personal@mail.test.*SimpleLogin/ })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'New alias for work@mail.test' }));
  expect(screen.queryByLabelText('Website')).toBeNull();
  expect(screen.getByLabelText('Alias name (optional)')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Alias name (optional)'), { target: { value: 'Shopping' } });
  expect(screen.getByLabelText('Alias provider')).toHaveValue('SimpleLogin · work@mail.test');
  expect(screen.getByLabelText('Alias provider')).toHaveAttribute('readonly');
  fireEvent.change(screen.getByLabelText('Forward to'), { target: { value: 'work@mail.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create alias' }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'createAlias', note: 'Shopping', accountId: 'alias-work', forwardTo: 'work@mail.test' }));
  fireEvent.click(screen.getByRole('button', { name: /personal@mail.test.*SimpleLogin/ }));
  fireEvent.click(screen.getByRole('switch', { name: 'Disable personal@sl.test' }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'setAliasEnabled', id: '1', accountId: 'alias-personal', enabled: false }));
});

it('creates a general alias without a name or website', async () => {
  const email = mount(configured);
  await screen.findByText('work@sl.test');
  fireEvent.click(screen.getByRole('button', { name: 'New alias for work@mail.test' }));
  expect(screen.getByText(/you can use on any website/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Create alias' }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'createAlias', accountId: 'alias-work' }));
});

it('creates from a collapsed provider group without opening it or choosing another account', async () => {
  const email = mount(configured);
  const group = await screen.findByRole('button', { name: /personal@mail.test.*SimpleLogin/ });
  expect(group).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'New alias' })).toBeNull();
  const requests = email.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'New alias for personal@mail.test' }));
  expect(email.mock.calls).toHaveLength(requests);
  expect(group).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByLabelText('Alias provider')).toHaveValue('SimpleLogin · personal@mail.test');
  expect(screen.getByLabelText('Alias provider')).toHaveAttribute('readonly');
  fireEvent.click(screen.getByRole('button', { name: 'Create alias' }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'createAlias', accountId: 'alias-personal' }));
});

it('refreshes only the chosen alias provider without expanding its group', async () => {
  const email = mount(configured);
  const group = await screen.findByRole('button', { name: /personal@mail.test.*SimpleLogin/ });
  expect(screen.queryByRole('button', { name: 'Refresh aliases' })).toBeNull();
  email.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh aliases for personal@mail.test' }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'refreshAliases', accountId: 'alias-personal' }));
  expect(email).toHaveBeenCalledTimes(1);
  expect(group).toHaveAttribute('aria-expanded', 'false');
});

it('shows temporary copy feedback for aliases and reports a failed copy honestly', async () => {
  mount(configured);
  const button = await screen.findByRole('button', { name: 'work@sl.test' });
  jest.useFakeTimers();
  try {
    await act(async () => { fireEvent.click(button); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('work@sl.test');
    expect(within(button).getByRole('status')).toHaveTextContent('Copied');
    act(() => jest.advanceTimersByTime(2000));
    expect(within(button).getByRole('status')).toBeEmptyDOMElement();
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error('Denied'));
    await act(async () => { fireEvent.click(button); });
    expect(within(button).getByRole('status')).toHaveTextContent('Copy failed');
    expect(within(button).queryByText('Copied')).toBeNull();
  } finally { jest.useRealTimers(); }
});

it('ignores clipboard completion after the copy button is removed', async () => {
  mount(configured);
  const button = await screen.findByRole('button', { name: 'work@sl.test' });
  let finish!: () => void;
  (navigator.clipboard.writeText as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  fireEvent.click(button);
  cleanup();
  const schedule = jest.spyOn(global, 'setTimeout');
  try {
    await act(async () => finish());
    expect(schedule).not.toHaveBeenCalledWith(expect.any(Function), 2000);
  } finally { schedule.mockRestore(); }
});

it('collapses alias accounts without requests and retains their controls when reopening', async () => {
  const email = mount(configured);
  const work = await screen.findByRole('button', { name: /work@mail.test.*SimpleLogin/ });
  const control = screen.getByRole('switch', { name: 'Disable work@sl.test' });
  const requests = email.mock.calls.length;
  fireEvent.click(work);
  expect(work).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('switch', { name: 'Disable work@sl.test' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /personal@mail.test.*SimpleLogin/ }));
  expect(screen.getByRole('switch', { name: 'Disable personal@sl.test' })).toBeInTheDocument();
  fireEvent.click(work);
  expect(screen.getByRole('switch', { name: 'Disable work@sl.test' })).toBe(control);
  expect(screen.queryByRole('switch', { name: 'Disable personal@sl.test' })).toBeNull();
  expect(email.mock.calls).toHaveLength(requests);
});

it('keeps ownership separate from a shared forwarding inbox and removes the chosen account', async () => {
  const status: EmailStatus = {
    ...configured,
    aliasProviders: configured.aliasProviders!.map((provider, index) => ({ ...provider, summary: `owner${index}@mail.test` })),
    aliases: configured.aliases.map((alias) => ({ ...alias, forwardTo: ['shared@mail.test'] })),
  };
  const email = mount(status);
  const first = await screen.findByRole('button', { name: /owner0@mail.test.*SimpleLogin/ });
  const second = screen.getByRole('button', { name: /owner1@mail.test.*SimpleLogin/ });
  expect(screen.getAllByText('owner0@mail.test')).toHaveLength(1);
  const firstAccount = first.closest('section')!;
  expect(within(firstAccount).getByRole('heading', { name: 'Forwards to shared@mail.test' })).toBeVisible();
  expect(within(firstAccount).getByRole('switch', { name: 'Disable work@sl.test' })).toBeVisible();
  expect(within(firstAccount).queryByText('personal@sl.test')).toBeNull();
  fireEvent.click(second);
  expect(within(second.closest('section')!).getByRole('heading', { name: 'Forwards to shared@mail.test' })).toBeVisible();
  expect(screen.getByRole('switch', { name: 'Disable personal@sl.test' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Remove owner1@mail.test alias provider' }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'disconnect', kind: 'alias', accountId: 'alias-personal' }));
  expect(second).toHaveAttribute('aria-expanded', 'true');
});

it('reads only the selected mailbox and retains the message when switching tabs', async () => {
  const email = mount(configured);
  await screen.findByText('work@sl.test');
  expect(email.mock.calls.some((args) => (args as unknown as [{ action: string }])[0]?.action === 'refresh')).toBe(false);
  fireEvent.click(screen.getByRole('radio', { name: /Mailboxes/ }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'refresh', mailboxId: 'inbox-work', automatic: true }));
  expect(screen.queryByRole('button', { name: /Personal message/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Confirm work account/ }));
  fireEvent.click(screen.getByRole('button', { name: '482913' }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('482913');
  await waitFor(() => expect(within(screen.getByRole('button', { name: '482913' })).getByRole('status')).toHaveTextContent('Copied'));
  fireEvent.click(screen.getByRole('radio', { name: /Aliases/ }));
  fireEvent.click(screen.getByRole('radio', { name: /Mailboxes/ }));
  expect(screen.getByRole('button', { name: '482913' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /personal@mail.test.*Gmail/ }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'refresh', mailboxId: 'inbox-personal', automatic: true }));
  expect(screen.getByRole('button', { name: /Personal message/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Confirm work account/ })).toBeNull();
  expect(screen.getByRole('button', { name: /personal@mail.test.*Gmail/ })).toHaveAttribute('aria-expanded', 'true');
  const requests = email.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: /personal@mail.test.*Gmail/ }));
  expect(screen.queryByRole('button', { name: /Personal message/ })).toBeNull();
  expect(screen.getByRole('button', { name: /personal@mail.test.*Gmail/ })).toHaveAttribute('aria-expanded', 'false');
  expect(email.mock.calls).toHaveLength(requests);
  fireEvent.click(screen.getByRole('button', { name: /work@mail.test.*Fastmail/ }));
  expect(screen.getByRole('button', { name: '482913' })).toBeInTheDocument();
});

it('refreshes the chosen mailbox from its header without changing the expanded account', async () => {
  const email = mount(configured);
  await screen.findByText('work@sl.test');
  fireEvent.click(screen.getByRole('radio', { name: /Mailboxes/ }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'refresh', mailboxId: 'inbox-work', automatic: true }));
  expect(screen.queryByRole('button', { name: 'Refresh inbox' })).toBeNull();
  email.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh personal@mail.test' }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'refresh', mailboxId: 'inbox-personal' }));
  expect(email).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /personal@mail.test.*Gmail/ })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: /work@mail.test.*Fastmail/ })).toHaveAttribute('aria-expanded', 'true');
});

it('adds a browser mailbox in a group and opens its existing login session without duplicating tabs', async () => {
  const group: IApp = { id: 'work', sessionId: 'work-session', sessionProfileId: 'work-profile', spaceId: 'work-space', sessionName: 'Work', name: 'Example', url: 'https://example.com/', icon: '' };
  let tabs = [group];
  jest.spyOn(AppManager, 'getAll').mockImplementation(() => tabs);
  const save = jest.spyOn(AppManager, 'set').mockImplementation((next) => { tabs = next; });
  const add = jest.spyOn(AppManager, 'add').mockImplementation((item) => { tabs = [...tabs, item]; });
  const focus = jest.fn();
  const email = mount(empty, focus);
  await screen.findByRole('radio', { name: 'Aliases' });
  fireEvent.click(screen.getByRole('radio', { name: 'Mailboxes' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Add mailbox' })[0]);
  expect(await screen.findByRole('button', { name: 'Mailbox tab group' })).toHaveTextContent('Work');
  const count = email.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Mailbox tab group' }));
  fireEvent.click(await screen.findByRole('option', { name: /Work/ }));
  expect(email.mock.calls).toHaveLength(count);
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'work@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save mailbox' }));
  expect(tabs[0].browserEmails).toEqual([expect.objectContaining({ providerId: 'google', address: 'work@example.com' })]);
  expect(aiGroupId(tabs[0])).toBe(aiGroupId(group));
  const { eventBus } = require('../utils/EventBus');
  const refresh = eventBus.on.mock.calls.find((entry: unknown[]) => entry[0] === 'app_list_update')?.[1];
  act(() => refresh?.());
  fireEvent.click(screen.getByRole('button', { name: 'Open work@example.com' }));
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'work-session', sessionProfileId: 'work-profile', spaceId: 'work-space', url: 'https://mail.google.com/' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open work@example.com' }));
  expect(add).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith(tabs[1].id);
});

it('offers browser mapping or a connected inbox while keeping OAuth setup checks', async () => {
  mount(empty);
  fireEvent.click(screen.getByRole('radio', { name: 'Mailboxes' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Add mailbox' })[0]);
  fireEvent.click(screen.getByRole('radio', { name: 'Connected inbox' }));
  expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByRole('option').some((option) => option.textContent === 'Microsoft (not set up in this build)')).toBe(true));
  fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'imap:icloud' } });
  expect(screen.getByLabelText('App password')).toBeInTheDocument();
  expect(screen.queryByLabelText('IMAP server')).toBeNull();
});

it('offers Zoho Mail for browser mapping and connected monitoring with an editable server', async () => {
  const email = mount(empty);
  fireEvent.click(screen.getByRole('radio', { name: 'Mailboxes' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Add mailbox' })[0]);
  expect(within(screen.getByLabelText('Email service')).getByRole('option', { name: 'Zoho Mail' })).toHaveValue('zoho');
  fireEvent.click(screen.getByRole('radio', { name: 'Connected inbox' }));
  fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'imap:zoho' } });
  expect(screen.getByLabelText('IMAP server')).toHaveValue('imap.zoho.com');
  expect(screen.queryByLabelText('Port')).toBeNull();
  fireEvent.change(screen.getByLabelText('IMAP server'), { target: { value: 'imappro.zoho.eu' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'hello@studio.example' } });
  fireEvent.change(screen.getByLabelText('App password'), { target: { value: 'zoho-app-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'connect', providerId: 'imap', values: { host: 'imappro.zoho.eu', port: '993', user: 'hello@studio.example', password: 'zoho-app-password' } }));
});

it('retains opened message details while receiving status scoped to different mailboxes', async () => {
  const email = mount({ ...configured, messages: [], messagesFor: null, revision: 1 });
  await screen.findByText('work@sl.test');
  email.mockImplementation(async (request: any) => ({ ...configured, revision: 2, messagesFor: request.mailboxId || null, messages: request.mailboxId ? configured.messages.filter((message) => message.mailboxId === request.mailboxId) : [] }));
  fireEvent.click(screen.getByRole('radio', { name: /Mailboxes/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Confirm work account/ }));
  fireEvent.click(screen.getByRole('button', { name: /personal@mail.test.*Gmail/ }));
  await screen.findByRole('button', { name: /Personal message/ });
  fireEvent.click(screen.getByRole('button', { name: /work@mail.test.*Fastmail/ }));
  expect(screen.getByRole('button', { name: '482913' })).toBeVisible();
  expect(email.mock.calls[0]).toEqual([{ action: 'status', summariesOnly: true }]);
});
it('pauses automatic refresh when the browser window becomes hidden', async () => {
  let visibility = 'visible';
  const visible = jest.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState);
  const email = mount(configured);
  await screen.findByText('work@sl.test');
  fireEvent.click(screen.getByRole('radio', { name: /Mailboxes/ }));
  await waitFor(() => expect(email).toHaveBeenCalledWith({ action: 'refresh', mailboxId: 'inbox-work', automatic: true }));
  jest.useFakeTimers();
  try {
    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    const requests = email.mock.calls.length;
    act(() => jest.advanceTimersByTime(120000));
    expect(email.mock.calls).toHaveLength(requests);
    visibility = 'visible';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(email.mock.calls.length).toBeGreaterThan(requests);
  } finally { jest.useRealTimers(); visible.mockRestore(); }
});
it('keeps other mailbox refresh and add controls available during a slow refresh', async () => {
  const email = mount(configured);
  await screen.findByText('work@sl.test');
  fireEvent.click(screen.getByRole('radio', { name: /Mailboxes/ }));
  let finish!: (status: EmailStatus) => void;
  email.mockImplementationOnce(() => new Promise<EmailStatus>((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh personal@mail.test' }));
  expect(screen.getByRole('button', { name: 'Refresh personal@mail.test' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Refresh work@mail.test' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Add mailbox' })).toBeEnabled();
  await act(async () => finish(configured));
});

it('keeps connected-inbox drafts when switching the dialog method', async () => {
  mount(empty);
  fireEvent.click(screen.getByRole('radio', { name: 'Mailboxes' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Add mailbox' })[0]);
  fireEvent.click(screen.getByRole('radio', { name: 'Connected inbox' }));
  fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'imap:zoho' } });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner@example.com' } });
  fireEvent.change(screen.getByLabelText('App password'), { target: { value: 'draft-password' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Browser tab' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Connected inbox' }));
  expect(screen.getByLabelText('Service')).toHaveValue('imap:zoho');
  expect(screen.getByLabelText('Username')).toHaveValue('owner@example.com');
  expect(screen.getByLabelText('App password')).toHaveValue('draft-password');
});
it('reveals the optional custom server without loading or losing the API key', async () => {
  const email = mount(empty);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Add alias provider' }))[0]);
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'draft-key' } });
  expect(screen.getByLabelText('Server')).not.toBeVisible();
  const requests = email.mock.calls.length;
  fireEvent.click(screen.getByText('Custom server'));
  expect(screen.getByLabelText('Server')).toBeVisible();
  expect(screen.getByLabelText('API key')).toHaveValue('draft-key');
  expect(email.mock.calls).toHaveLength(requests);
});
it('ignores a status response older than the currently displayed revision', async () => {
  const email = mount({ ...configured, revision: 5 });
  await screen.findByText('work@sl.test');
  fireEvent.click(screen.getByRole('radio', { name: /Mailboxes/ }));
  email.mockImplementationOnce(async () => ({ ...configured, revision: 4, messagesFor: 'inbox-personal', messages: [{ ...configured.messages[1], subject: 'Outdated response' }] }));
  fireEvent.click(screen.getByRole('button', { name: /personal@mail.test.*Gmail/ }));
  await screen.findByRole('button', { name: /Personal message/ });
  expect(screen.queryByText('Outdated response')).toBeNull();
});

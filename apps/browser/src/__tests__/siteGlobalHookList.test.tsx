beforeAll(() => { HTMLElement.prototype.scrollIntoView = jest.fn(); global.ResizeObserver = jest.fn(() => ({ observe() {}, unobserve() {}, disconnect() {} })) as any; });
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { SiteGlobalHookList } from '../components/UI/SiteGlobalHookList';
it('disables only this website, preserves other hooks, and opens the scoped editor', async () => {
  const hook = { id: 'matching', name: 'Reader', enabled: true, path: '/articles/*', sites: [{ host: 'example.com', includeSubdomains: false }], exclusions: [], before: '', after: '', css: 'p{}' };
  const other = { ...hook, id: 'other', name: 'Other website', sites: [{ host: 'other.com', includeSubdomains: false }] };
  const config = { enabled: true, hooks: [hook, other] };
  const request = jest.fn(async (input) => input.action === 'global-editor-open' ? null : ({ global: input.action === 'global-save' ? input.config : input.allGroups ? config : { enabled: true, hooks: [] }, globalHash: 'hash' }));
  (window as any).electron = { hookMarketplace: { request } };
  render(<Theme><SiteGlobalHookList url="https://example.com/articles/one" disabled={false} /></Theme>);
  expect(await screen.findByText('Reader')).toBeInTheDocument();
  expect(screen.queryByText('Other website')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: 'Enable Reader on this website' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'global-save', allGroups: true, config: { enabled: true, hooks: [{ ...hook, exclusions: ['example.com'] }, other] } })));
  expect(screen.getByText('Disabled here')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: 'Enable Reader on this website' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'global-save', allGroups: true, config })));
  fireEvent.click(screen.getByRole('button', { name: /^Reader/ }));
  await waitFor(() => expect(request).toHaveBeenCalledWith({ action: 'global-editor-open', allGroups: true, hookId: 'matching' }));
});

it('does not start duplicate loads when focus repeats during a refresh', async () => {
  let finish: (value: any) => void = () => {};
  const pending = new Promise(resolve => { finish = resolve; });
  const request = jest.fn(() => pending);
  (window as any).electron = { hookMarketplace: { request } };
  render(<Theme><SiteGlobalHookList url="https://example.com" disabled={false} /></Theme>);
  fireEvent(window, new Event('focus'));
  fireEvent(window, new Event('focus'));
  expect(request).toHaveBeenCalledTimes(2);
  const { act } = await import('@testing-library/react');
  await act(async () => { finish({ global: { enabled: true, hooks: [] }, globalHash: 'same' }); await pending; });
});

it('keeps excluded hooks visible but cannot override a global disable or a wildcard exclusion', async () => {
  const hook = { id: 'reader', name: 'Reader', enabled: false, path: '/*', exclusions: ['example.com'], before: '', after: '', css: '' };
  const request = jest.fn(async (input) => ({ global: { enabled: true, hooks: input.allGroups ? [hook, { ...hook, id: 'wildcard', name: 'Wildcard', enabled: true, exclusions: ['*.example.com'] }] : [] }, globalHash: 'hash' }));
  (window as any).electron = { hookMarketplace: { request } };
  render(<Theme><SiteGlobalHookList url="https://example.com/" disabled={false} /></Theme>);
  expect(await screen.findByText('Reader')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Enable Reader on this website' })).toBeEnabled();
  fireEvent.click(screen.getByRole('switch', { name: 'Enable Reader on this website' }));
  expect(await screen.findByText(/This hook is disabled globally/)).toBeInTheDocument();
  expect(request.mock.calls.some(([input]) => input.action === 'global-save')).toBe(false);
  expect(screen.getByRole('switch', { name: 'Enable Wildcard on this website' })).toBeDisabled();
  expect(screen.getByText('Disabled everywhere')).toBeInTheDocument();
});

it('explains a disabled global master switch without saving a website override', async () => {
  const hook = { id: 'reader', name: 'Reader', enabled: true, path: '/*', exclusions: [], before: '', after: '', css: '' };
  const request = jest.fn(async (input) => ({ global: { enabled: false, hooks: input.allGroups ? [hook] : [] }, globalHash: 'hash' }));
  (window as any).electron = { hookMarketplace: { request } };
  render(<Theme><SiteGlobalHookList url="https://example.com/" disabled={false} /></Theme>);
  fireEvent.click(await screen.findByRole('switch', { name: 'Enable Reader on this website' }));
  expect(await screen.findByText(/Global hooks are disabled. Enable them in Preferences/)).toBeInTheDocument();
  expect(request.mock.calls.some(([input]) => input.action === 'global-save')).toBe(false);
});

it('enables an Auto hook only for the current website and saves the choice immediately', async () => {
  const hook = { id: 'auto', name: 'Auto reader', enabled: true, autoMode: true, enabledSites: [], path: '/*', exclusions: [], before: '', after: 'log("ready")', css: '' };
  const request = jest.fn(async input => ({ global: input.action === 'global-save' ? input.config : { enabled: true, hooks: input.allGroups ? [hook] : [] }, globalHash: 'hash' }));
  window.electron.hookMarketplace = { request } as any;
  render(<Theme><SiteGlobalHookList url="https://example.com/page" disabled={false} /></Theme>);
  const toggle = await screen.findByRole('switch', { name: 'Enable Auto reader on this website' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(toggle);
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ action: 'global-save', allGroups: true, config: { enabled: true, hooks: [{ ...hook, enabledSites: ['example.com'] }] } })));
});

it('offers copy to local hooks without modifying the original global hook', async () => {
  const hook = { id: 'reader', name: 'Reader', enabled: true, path: '/*', exclusions: [], before: '', after: 'log("ready")', css: '' };
  const request = jest.fn(async input => ({ global: { enabled: true, hooks: input.allGroups ? [hook] : [] }, globalHash: 'hash' }));
  window.electron = { hookMarketplace: { request } } as any;
  const onCopyLocal = jest.fn();
  render(<Theme><SiteGlobalHookList url="https://example.com/" disabled={false} onCopyLocal={onCopyLocal} /></Theme>);
  fireEvent.keyDown(await screen.findByRole('button', { name: 'Global options for Reader' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy to local hooks' }));
  expect(onCopyLocal).toHaveBeenCalledWith(hook);
  expect(request.mock.calls.some(([input]) => input.action === 'global-save')).toBe(false);
});

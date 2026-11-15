import { act, render } from '@testing-library/react';
import { AccountSyncPublisher } from '../components/UI/AccountSyncPublisher';
import { browser } from '../browser/client';
import type { IApp } from '../types';
import type { BrowserState } from '../browser/contracts';

jest.mock('../browser/client', () => ({
  browser: { accountSync: jest.fn(async () => ({})) },
}));
jest.mock('../utils/SpaceManager', () => {
  const spaces: unknown[] = [];
  return { useSpaces: () => ({ spaces }) };
});
jest.mock('../utils/windowWorkspace', () => ({
  windowWorkspace: { state: () => undefined },
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

test('tab loading, title and audio changes do not republish unchanged URLs', () => {
  const tab = {
    id: 'one',
    name: 'Example',
    url: 'https://example.com',
    sessionId: 'group',
    icon: '',
  } as IApp;
  const tabs = [tab];
  const state: BrowserState = {
    id: 'one',
    url: tab.url,
    title: 'Example',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
  const view = render(
    <AccountSyncPublisher tabs={tabs} states={{ one: state }} />,
  );
  act(() => jest.advanceTimersByTime(500));
  expect(browser.accountSync).toHaveBeenCalledTimes(1);
  view.rerender(
    <AccountSyncPublisher
      tabs={tabs}
      states={{
        one: { ...state, title: 'Music', audible: true, loading: true },
      }}
    />,
  );
  act(() => jest.advanceTimersByTime(1000));
  expect(browser.accountSync).toHaveBeenCalledTimes(1);
  view.rerender(
    <AccountSyncPublisher
      tabs={tabs}
      states={{ one: { ...state, url: 'https://example.com/new' } }}
    />,
  );
  act(() => jest.advanceTimersByTime(500));
  expect(browser.accountSync).toHaveBeenCalledTimes(2);
  expect(browser.accountSync).toHaveBeenLastCalledWith(
    'snapshot',
    expect.objectContaining({
      currentUrls: { one: 'https://example.com/new' },
    }),
  );
  act(() => window.dispatchEvent(new Event('online')));
  expect(browser.accountSync).toHaveBeenLastCalledWith('network-restored');
});

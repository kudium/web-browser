import {
  retainTabHistory,
  savedNavigationURL,
  tabDefaultURL,
  tabResumeURL,
  validTabDefaultURL,
} from '../browser/tabDefaults';
import { newPageTab } from '../utils/tabMetadata';
import { isBrowserLayout } from '../main/browserRequests';
import { AppManager } from '../utils/AppManager';
import type { IApp } from '../types';

jest.mock('../utils/EventBus', () => ({ eventBus: { dispatch: jest.fn() } }));

const scriptURL = ['java', 'script:alert(1)'].join('');

const tab: IApp = {
  id: 'tab',
  name: 'Example',
  icon: '',
  url: 'https://example.com/latest',
  tabDefaultURL: 'https://example.com/home',
};

test('saved defaults take priority over last URL, independently of pin state', () => {
  expect(tabResumeURL(tab, 'https://example.com/away')).toBe(tab.tabDefaultURL);
  expect(tabResumeURL({ ...tab, tabPinned: false })).toBe(tab.tabDefaultURL);
  expect(
    tabResumeURL(
      { ...tab, tabDefaultURL: undefined },
      'https://example.com/away'
    )
  ).toBe('https://example.com/away');
});

test('unload clears navigation history for defaults and all group unloads', () => {
  expect(retainTabHistory(tab)).toBe(false);
  const ordinary = { ...tab, tabDefaultURL: undefined };
  expect(retainTabHistory(ordinary)).toBe(true);
  expect(retainTabHistory(ordinary, true)).toBe(false);
});

test('invalid saved defaults cannot execute scripts or prevent restoration', () => {
  [scriptURL, 'file:///tmp/test', '', 'bad', 42].forEach((value) => {
    expect(validTabDefaultURL(value)).toBeUndefined();
  });
  const invalid = { ...tab, tabDefaultURL: scriptURL };
  expect(tabDefaultURL(invalid)).toBeUndefined();
  expect(tabResumeURL(invalid)).toBe(tab.url);
});

test('new pages do not inherit the source tab default or pin', () => {
  const next = newPageTab(
    { ...tab, tabPinned: true },
    'https://example.com/new',
    'new'
  );
  expect(next.tabDefaultURL).toBeUndefined();
  expect(next.tabPinned).toBe(false);
});

test('saved defaults persist through storage and layout validation', () => {
  AppManager.set([tab]);
  expect(AppManager.getAll()[0].tabDefaultURL).toBe(tab.tabDefaultURL);
  const layout = { apps: [tab], visible: [] };
  expect(isBrowserLayout(layout)).toBe(true);
  expect(
    isBrowserLayout({ ...layout, apps: [{ ...tab, tabDefaultURL: 42 }] })
  ).toBe(false);
});

test('live navigation survives saved layout reload, including same-page URL changes', () => {
  const original = {
    ...tab,
    url: 'https://www.google.com/search?q=example',
    tabDefaultURL: undefined,
  };
  AppManager.set([original]);
  [
    'https://example.com/article',
    'https://example.com/article#details',
  ].forEach((url) => {
    const current = AppManager.getAll()[0];
    const state = {
      id: current.id,
      url,
      title: 'Article',
      discarded: false,
      initialLoading: false,
      loading: false,
      canGoBack: true,
      canGoForward: false,
    };
    AppManager.update('id', current.id, {
      ...current,
      url: savedNavigationURL(current, state),
    });
    const restored = JSON.parse(JSON.stringify(AppManager.getAll()))[0];
    expect(tabResumeURL(restored)).toBe(url);
  });
});
test('initial restoration does not overwrite the saved destination', () => {
  const state = {
    id: tab.id,
    url: 'about:blank',
    title: '',
    initialLoading: true,
    loading: true,
    canGoBack: false,
    canGoForward: false,
  };
  expect(savedNavigationURL(tab, state)).toBe(tab.url);
});

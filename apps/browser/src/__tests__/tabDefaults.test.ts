import {
  retainTabHistory,
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

/** @jest-environment node */
import {
  autoLoginAccounts,
  buildAutoLoginMenu,
} from '../main/passwordManager/autoLogin';
import type { MenuItemConstructorOptions } from 'electron';
jest.mock('electron', () => ({ dialog: { showMessageBox: jest.fn() } }));

it('runs the only saved account directly from the context menu', () => {
  const run = jest.fn();
  const menu = buildAutoLoginMenu(
    [{ id: 'regular', title: 'Website', username: 'fixture-user' }],
    run,
  );
  expect(menu[0].label).toBe('Auto login');
  expect(menu[0].submenu).toBeUndefined();
  expect(run).not.toHaveBeenCalled();
  (menu[0].click as () => void)();
  expect(run).toHaveBeenCalledWith('regular');
});
it('places multiple account choices in a submenu and passes the chosen account ID', () => {
  const run = jest.fn();
  const menu = buildAutoLoginMenu(
    [
      { id: 'regular', title: 'Website', username: 'regular-user' },
      { id: 'business', title: 'Website', username: 'business-user' },
    ],
    run,
  );
  const accounts = menu[0].submenu as MenuItemConstructorOptions[];
  expect(accounts.map((item) => item.label)).toEqual([
    'Website · regular-user',
    'Website · business-user',
  ]);
  expect(menu[0].click).toBeUndefined();
  expect(run).not.toHaveBeenCalled();
  (accounts[1].click as () => void)();
  expect(run).toHaveBeenCalledWith('business');
});
it('does not offer an action when no saved account matches', () => {
  expect(buildAutoLoginMenu([], jest.fn())).toEqual([]);
});

it('discovers accounts in one vault pass and only projects the selected account', () => {
  const matchingItems = jest.fn(() =>
    Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      origin: 'https://example.com',
      title: 'Account',
      kind: 'login',
      username: `user${i}`,
      password: 'fixture-secret',
      fields: [],
    })),
  );
  const forFill = jest.fn();
  const vault = { matchingItems, forFill } as any;
  expect(
    autoLoginAccounts(vault, 'https://example.com', undefined, '999'),
  ).toEqual([
    { id: '999', title: 'Account', username: 'user999', loginURL: undefined },
  ]);
  expect(matchingItems).toHaveBeenCalledTimes(1);
  expect(forFill).not.toHaveBeenCalled();
});

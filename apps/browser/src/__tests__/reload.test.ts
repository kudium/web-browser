import type { Session } from 'electron';
import { clearPageCookies } from '../main/reload';
import { defaultShortcuts, matchShortcut } from '../browser/shortcuts';

it('removes page cookies using their domain, security and path in the current group', async () => {
  const get = jest.fn().mockResolvedValue([
    { name: 'login', domain: '.example.com', path: '/account', secure: true },
    { name: 'theme', domain: 'app.example.com', path: '/', secure: false },
  ]);
  const remove = jest.fn().mockResolvedValue(undefined);
  await clearPageCookies(
    { cookies: { get, remove } } as unknown as Session,
    'https://app.example.com/account/home'
  );
  expect(get).toHaveBeenCalledWith({
    url: 'https://app.example.com/account/home',
  });
  expect(remove.mock.calls).toEqual([
    ['https://example.com/account', 'login'],
    ['http://app.example.com/', 'theme'],
  ]);
});

it('does not clear cookies for internal pages', async () => {
  const get = jest.fn();
  await clearPageCookies(
    { cookies: { get } } as unknown as Session,
    'about:blank'
  );
  expect(get).not.toHaveBeenCalled();
});

it('matches cache-bypassing refresh on macOS and other platforms', () => {
  expect(
    matchShortcut({ key: 'r', meta: true, shift: true }, defaultShortcuts, true)
  ).toBe('reload-ignore-cache');
  expect(
    matchShortcut(
      { key: 'r', control: true, shift: true },
      defaultShortcuts,
      false
    )
  ).toBe('reload-ignore-cache');
  expect(matchShortcut({ key: 'r', meta: true }, defaultShortcuts, true)).toBe(
    'reload'
  );
});

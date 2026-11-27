/** @jest-environment node */
import { EventEmitter } from 'events';
import type { IApp } from '../types';
import { AISessionIdentityCache, tabOrigins } from '../main/aiSessionIdentity';

const tab = (id: string, url: string, profile = 'p1'): IApp =>
  ({ id, url, name: id, icon: '', sessionId: 'g1', sessionProfileId: profile } as IApp);

function fakeSession(hosts: Record<string, number>) {
  const cookies = Object.assign(new EventEmitter(), {
    get: jest.fn(async ({ domain }: { domain: string }) =>
      Array.from({ length: hosts[domain] || 0 }, (_, index) => ({ name: `c${index}` }))
    ),
  });
  return { cookies } as unknown as import('electron').Session & { cookies: typeof cookies };
}

it('lists distinct http(s) origins of a group', () => {
  expect(tabOrigins([tab('a', 'https://x.test/a'), tab('b', 'https://x.test/b'), tab('c', 'kudium://home'), tab('d', 'http://y.test:8080/')])).toEqual([
    'https://x.test',
    'http://y.test:8080',
  ]);
});

it('reports origins with cookies, names the saved-login account, caches until cookies change', async () => {
  const session = fakeSession({ 'qa.test': 2 });
  const accountFor = jest.fn((origin: string) => (origin === 'https://qa.test' ? 'US devops' : undefined));
  const cache = new AISessionIdentityCache({ sessionFor: () => session, accountFor });
  const member = tab('t1', 'https://qa.test/');
  await expect(cache.identities(member, ['https://qa.test', 'https://none.test'])).resolves.toEqual([
    { origin: 'https://qa.test', account: 'US devops' },
  ]);
  expect(session.cookies.get).toHaveBeenCalledTimes(2);
  await cache.identities(member, ['https://qa.test', 'https://none.test']);
  expect(session.cookies.get).toHaveBeenCalledTimes(2);
  session.cookies.emit('changed');
  await cache.identities(member, ['https://qa.test']);
  expect(session.cookies.get).toHaveBeenCalledTimes(3);
  expect(accountFor).not.toHaveBeenCalledWith('https://none.test', expect.anything());
});

it('returns nothing for partitions that do not exist', async () => {
  const cache = new AISessionIdentityCache({ sessionFor: () => undefined, accountFor: () => 'x' });
  await expect(cache.identities(tab('t', 'https://a.test/'), ['https://a.test'])).resolves.toEqual([]);
});

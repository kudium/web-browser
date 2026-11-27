/** @jest-environment node */
import { simpleLoginClient, simpleLoginRequest } from '../main/emailSimpleLogin';

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) } as Response;
}

const values = { apiKey: 'key', baseUrl: 'https://app.simplelogin.io' };

it('sends the API key in the Authentication header without following redirects', async () => {
  const fetchImpl = jest.fn(async () => response(200, { email: 'me@x.test' }));
  await simpleLoginRequest(values, '/api/user_info', {}, fetchImpl as unknown as typeof fetch);
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.href).toBe('https://app.simplelogin.io/api/user_info');
  expect(init.redirect).toBe('error');
  expect((init.headers as Record<string, string>).Authentication).toBe('key');
});

it('surfaces SimpleLogin errors as user-facing messages', async () => {
  await expect(
    simpleLoginRequest(values, '/api/user_info', {}, (async () => response(401, { error: 'x' })) as unknown as typeof fetch)
  ).rejects.toThrow('rejected the API key');
  await expect(
    simpleLoginRequest(values, '/api/alias/random/new', { method: 'POST' }, (async () =>
      response(400, { error: 'You have reached the limit of aliases' })) as unknown as typeof fetch)
  ).rejects.toThrow('reached the limit');
  await expect(
    simpleLoginRequest(values, '/api/user_info', {}, (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch)
  ).rejects.toThrow('could not be reached');
  await expect(simpleLoginRequest({ apiKey: 'k', baseUrl: 'http://evil.test' }, '/api/user_info')).rejects.toThrow('must use HTTPS');
  await expect(simpleLoginRequest({ apiKey: '' }, '/api/user_info')).rejects.toThrow('API key is required');
});

it('maps aliases, reads the website from the note and pages through the list', async () => {
  const pages = [
    Array.from({ length: 20 }, (_, index) => ({ id: index + 1, email: `a${index + 1}@sl.test`, enabled: true, note: 'Kudium · example.com', creation_timestamp: 1700000000, nb_forward: index })),
    [{ id: 21, email: 'a21@sl.test', enabled: false, note: null }],
  ];
  const calls: string[] = [];
  const fetchImpl = (async (url: URL) => {
    calls.push(url.pathname + url.search);
    if (url.pathname === '/api/v2/aliases') return response(200, { aliases: pages[Number(url.searchParams.get('page_id'))] || [] });
    if (url.pathname === '/api/alias/random/new') return response(201, { id: 30, email: 'new@sl.test', enabled: true, note: 'Kudium · site.test' });
    if (url.pathname === '/api/aliases/30/toggle') return response(200, { enabled: false });
    if (url.pathname === '/api/aliases/30') return response(200, { deleted: true });
    return response(404, { error: 'missing' });
  }) as unknown as typeof fetch;
  const realFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    const aliases = await simpleLoginClient.listAliases(values);
    expect(aliases).toHaveLength(21);
    expect(aliases[0]).toEqual({ id: '1', email: 'a1@sl.test', providerId: 'simplelogin', hostname: 'example.com', note: 'Kudium · example.com', enabled: true, createdAt: 1700000000000, forwards: 0 });
    expect(aliases[20]).toEqual(expect.objectContaining({ id: '21', enabled: false, hostname: undefined }));
    const created = await simpleLoginClient.createAlias(values, { hostname: 'site.test' });
    expect(created).toEqual(expect.objectContaining({ id: '30', email: 'new@sl.test', hostname: 'site.test' }));
    expect(calls).toContain('/api/alias/random/new?hostname=site.test&mode=word');
    await simpleLoginClient.setAliasEnabled(values, '30', false);
    await simpleLoginClient.deleteAlias(values, '30');
    await expect(simpleLoginClient.deleteAlias(values, '../user')).rejects.toThrow('Unknown alias.');
  } finally {
    global.fetch = realFetch;
  }
});

it('reports actual forwarding destinations and applies an explicitly chosen mailbox', async () => {
  const realFetch = global.fetch;
  const fetchImpl = jest.fn(async (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/alias/random/new') return response(201, { id: 30, email: 'new@sl.test', mailboxes: [{ id: 1, email: 'default@example.com' }] });
    if (init.method === 'PATCH') {
      expect(JSON.parse(String(init.body))).toEqual({ mailbox_ids: [2] });
      return response(200, {});
    }
    return response(200, { id: 30, email: 'new@sl.test', mailboxes: [{ id: 2, email: 'work@example.com' }] });
  });
  global.fetch = fetchImpl as unknown as typeof fetch;
  try {
    const alias = await simpleLoginClient.createAlias(values, { hostname: 'site.test', mailboxId: '2' });
    expect(alias.forwardTo).toEqual(['work@example.com']);
    expect(alias.forwardingMailboxes).toEqual([{ id: '2', email: 'work@example.com' }]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  } finally { global.fetch = realFetch; }
});

it('stores an optional alias name without a website and restores it from the provider', async () => {
  const realFetch = global.fetch;
  const fetchImpl = jest.fn(async (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/alias/random/new') {
      expect(url.searchParams.has('hostname')).toBe(false);
      expect(JSON.parse(String(init.body))).toEqual({ note: 'Kudium · name: Shopping' });
      return response(201, { id: 40, email: 'generated@sl.test' });
    }
    return response(200, { aliases: [{ id: 40, email: 'generated@sl.test', note: 'Kudium · name: Shopping' }, { id: 41, email: 'general@sl.test', note: 'Kudium · general' }] });
  });
  global.fetch = fetchImpl as unknown as typeof fetch;
  try {
    const created = await simpleLoginClient.createAlias(values, { note: 'Shopping' });
    expect(created).toMatchObject({ name: 'Shopping', hostname: undefined });
    const aliases = await simpleLoginClient.listAliases(values);
    expect(aliases[0]).toMatchObject({ name: 'Shopping', hostname: undefined });
    expect(aliases[1].hostname).toBeUndefined();
  } finally { global.fetch = realFetch; }
});

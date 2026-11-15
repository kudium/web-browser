/** @jest-environment node */
/* The portable package is shared with the web service; mocked getters run after setup. */
/* eslint-disable import/no-relative-packages, no-use-before-define */
import { EventEmitter } from 'events';
import { lookup } from 'dns/promises';
import { request } from 'https';
import { parseHookPackage } from '../../../../packages/hooks/package';
import {
  fetchHookPackage,
  hookPackageURL,
  hookPackageHash,
} from '../main/hookPackageFetch';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('https', () => ({ request: jest.fn() }));
const pkg = parseHookPackage({
  schemaVersion: 1,
  minimumBrowserVersion: '1.0.0',
  name: 'Reader',
  description: 'Reading styles',
  license: 'MIT',
  applicability: 'general',
  sites: [],
  path: '/*',
  lifecycle: { before: '', after: '', css: 'p{line-height:1.7}' },
});
let mockReplies: Array<{
  status: number;
  location?: string;
  body?: string;
  type?: string;
}>;
beforeEach(() => {
  jest.clearAllMocks();
  mockReplies = [];
  (lookup as jest.Mock).mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ]);
  (request as jest.Mock).mockImplementation((_url, _options, callback) => {
    const outgoing: any = new EventEmitter();
    outgoing.setTimeout = jest.fn();
    outgoing.destroy = (error: Error) => outgoing.emit('error', error);
    outgoing.end = () =>
      queueMicrotask(() => {
        const reply = mockReplies.shift()!;
        const response: any = new EventEmitter();
        response.statusCode = reply.status;
        response.headers = {
          'content-type': reply.type || 'application/json',
          location: reply.location,
        };
        response.resume = () => {};
        callback(response);
        if (reply.body) response.emit('data', Buffer.from(reply.body));
        response.emit('end');
      });
    return outgoing;
  });
});
it('rejects non-HTTPS, credentials, local DNS, and every non-public resolved address', async () => {
  [
    'http://example.com/a',
    'https://user:pass@example.com/a',
    'https://localhost/a',
    'file:///a',
  ].forEach((url) => expect(() => hookPackageURL(url)).toThrow());
  (lookup as jest.Mock).mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  await expect(
    fetchHookPackage('https://example.com/package', '1.0.0')
  ).rejects.toThrow('public');
  expect(request).not.toHaveBeenCalled();
});
it('pins public DNS results and imports source without sending account credentials', async () => {
  mockReplies.push({ status: 200, body: JSON.stringify(pkg) });
  const result = await fetchHookPackage('https://example.com/package', '1.0.0');
  expect(result.verified).toBe(false);
  expect(result.package.lifecycle.css).toContain('line-height');
  const options = (request as jest.Mock).mock.calls[0][1];
  expect(options.headers).not.toHaveProperty('Authorization');
  expect(options.headers).not.toHaveProperty('Cookie');
  const callback = jest.fn();
  options.lookup('example.com', { all: false }, callback);
  expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
});
it('validates redirected destinations and bounds redirects, MIME and package size', async () => {
  mockReplies.push({ status: 302, location: 'https://127.0.0.1/package' });
  await expect(
    fetchHookPackage('https://example.com/package', '1.0.0')
  ).rejects.toThrow('public');
  mockReplies.push(
    ...Array.from({ length: 4 }, () => ({ status: 302, location: '/next' }))
  );
  await expect(
    fetchHookPackage('https://example.com/package', '1.0.0')
  ).rejects.toThrow('redirects');
  mockReplies = [];
  mockReplies.push({ status: 200, body: '{}', type: 'text/html' });
  await expect(
    fetchHookPackage('https://example.com/package', '1.0.0')
  ).rejects.toThrow('JSON');
  mockReplies.push({ status: 200, body: ' '.repeat(256 * 1024 + 1) });
  await expect(
    fetchHookPackage('https://example.com/package', '1.0.0')
  ).rejects.toThrow('256');
});
it('retains unique publisher handles in verified packages and rejects malformed handles', async () => {
  const envelope = { id: 'one', version: 1, publisher: { id: 'author', name: 'Author', username: 'atlas_studio' }, contentHash: hookPackageHash(pkg), package: pkg };
  mockReplies.push({ status: 200, body: JSON.stringify(envelope) });
  expect((await fetchHookPackage('https://browser.kudium.com/v1/hooks/one/package', '1.0.0')).publication?.publisher.username).toBe('atlas_studio');
  mockReplies.push({ status: 200, body: JSON.stringify({ ...envelope, publisher: { ...envelope.publisher, username: '@invalid name' } }) });
  await expect(fetchHookPackage('https://browser.kudium.com/v1/hooks/one/package', '1.0.0')).rejects.toThrow('metadata');
});
it('verifies marketplace metadata against source and rejects unsupported browser/stage versions', async () => {
  const envelope = {
    id: 'one',
    version: 1,
    publisher: { id: 'author', name: 'Author' },
    contentHash: hookPackageHash(pkg),
    package: pkg,
  };
  mockReplies.push({ status: 200, body: JSON.stringify(envelope) });
  expect(
    (
      await fetchHookPackage(
        'https://browser.kudium.com/v1/hooks/one/versions/1/package',
        '1.0.0'
      )
    ).verified
  ).toBe(true);
  mockReplies.push({
    status: 200,
    body: JSON.stringify({ ...envelope, contentHash: 'bad' }),
  });
  await expect(
    fetchHookPackage('https://browser.kudium.com/v1/hooks/one/package', '1.0.0')
  ).rejects.toThrow('metadata');
  mockReplies.push({
    status: 200,
    body: JSON.stringify({ ...pkg, minimumBrowserVersion: '2.0.0' }),
  });
  await expect(
    fetchHookPackage('https://example.com/package', '1.0.0')
  ).rejects.toThrow('2.0.0');
  mockReplies.push({
    status: 200,
    body: JSON.stringify({
      ...pkg,
      lifecycle: { ...pkg.lifecycle, ready: 'x' },
    }),
  });
  await expect(
    fetchHookPackage('https://example.com/package', '1.0.0')
  ).rejects.toThrow('lifecycle');
});

it('round-trips an optional test website URL and preserves legacy package shape', () => {
  expect(parseHookPackage(pkg)).toEqual(pkg);
  expect(
    Object.prototype.hasOwnProperty.call(parseHookPackage(pkg), 'testUrl')
  ).toBe(false);
  const withTest = { ...pkg, testUrl: 'https://example.com/articles/one' };
  expect(parseHookPackage(withTest)).toEqual(withTest);
  expect(parseHookPackage(JSON.parse(JSON.stringify(withTest))).testUrl).toBe(
    withTest.testUrl
  );
  for (const testUrl of [
    'file:///tmp/test',
    'javascript:alert(1)',
    'https://user:secret@example.com',
    'not-a-url',
  ]) {
    expect(() => parseHookPackage({ ...pkg, testUrl })).toThrow('test website');
  }
});

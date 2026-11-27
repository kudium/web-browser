/** @jest-environment node */
import { EventEmitter } from 'events';

const ruleSets = new Map<object, Set<(details: unknown) => boolean>>();
jest.mock('../main/requestRules', () => ({
  addRequestRule: (session: object, rule: (details: unknown) => boolean) => {
    const rules = ruleSets.get(session) || new Set();
    ruleSets.set(session, rules);
    rules.add(rule);
    return () => rules.delete(rule);
  },
}));

import {
  AIConsoleLog,
  AIPageLogs,
  AIRequestLog,
  AI_LOG_LIMIT,
  parseRequestFilter,
  redactURL,
} from '../main/aiPageLogs';
import { aiWaitCondition } from '../browser/aiWait';
import { AI_TAINTING_READS } from '../browser/aiTaint';

it('redacts credential-looking query values, userinfo and card-like digit runs', () => {
  expect(redactURL('https://api.test/login?user=sam&password=hunter2&access_token=abc&page=2')).toBe(
    'https://api.test/login?user=sam&password=%5Bredacted%5D&access_token=%5Bredacted%5D&page=2'
  );
  expect(redactURL('https://u:p@host.test/x')).toBe('https://%5Bredacted%5D:%5Bredacted%5D@host.test/x');
  expect(redactURL('https://pay.test/charge/4111111111111111/receipt')).toBe('https://pay.test/charge/[redacted]/receipt');
  expect(redactURL('https://app.test/#token=zzz')).toBe('https://app.test/#[redacted]');
  expect(redactURL('not a url 4111 1111 1111 1111')).toBe('not a url [redacted]');
});

it('parses substring and /regex/ filters and rejects bad ones', () => {
  expect(parseRequestFilter('API/Users')('https://a.test/api/users?x')).toBe(true);
  expect(parseRequestFilter('/users\\/\\d+$/')('https://a.test/api/users/42')).toBe(true);
  expect(parseRequestFilter('/users\\/\\d+$/')('https://a.test/api/users/')).toBe(false);
  expect(() => parseRequestFilter('/(/')).toThrow('regular expression');
  expect(() => parseRequestFilter('   ')).toThrow('empty');
});

it('keeps a bounded console ring with since and limit', () => {
  const log = new AIConsoleLog();
  for (let index = 0; index < AI_LOG_LIMIT + 5; index += 1) log.push(index % 4, `m${index}`, index, 'https://a.test/app.js?token=x');
  const all = log.read({ limit: 200 });
  expect(all.total).toBe(AI_LOG_LIMIT);
  expect(all.dropped).toBe(5);
  expect(all.truncated).toBe(true);
  expect(all.entries).toHaveLength(200);
  expect(all.entries[199]).toMatchObject({ message: `m${AI_LOG_LIMIT + 4}`, level: 'verbose', source: 'https://a.test/app.js?token=%5Bredacted%5D' });
  expect(log.read({ since: Date.now() + 1000 }).entries).toEqual([]);
  expect(() => log.read({ limit: 0 })).toThrow('limit');
  expect(() => log.read({ since: -1 })).toThrow('since');
  expect(log.read({ limit: 1 }).entries[0].level).toBe('verbose');
});

it('records request start, completion and failure with redacted URLs and answers wait filters', () => {
  const log = new AIRequestLog();
  log.started({ id: 1, method: 'GET', url: 'https://a.test/api/items?apiKey=k', resourceType: 'xhr', timestamp: 1000 });
  log.started({ id: 2, method: 'POST', url: 'https://a.test/api/save', resourceType: 'xhr', timestamp: 1010 });
  log.completed({ id: 1, statusCode: 200, fromCache: false, timestamp: 1045 });
  log.failed({ id: 2, error: 'net::ERR_FAILED', timestamp: 1020 });
  log.completed({ id: 3, statusCode: 500, fromCache: false }); // unknown id is ignored
  expect(log.read().entries).toEqual([
    { id: 1, at: 1000, method: 'GET', url: 'https://a.test/api/items?apiKey=%5Bredacted%5D', type: 'xhr', status: 200, fromCache: false, durationMs: 45 },
    { id: 2, at: 1010, method: 'POST', url: 'https://a.test/api/save', type: 'xhr', error: 'net::ERR_FAILED', durationMs: 10 },
  ]);
  expect(log.read({ filter: '/save$/' }).entries.map((entry) => entry.id)).toEqual([2]);
  expect(log.read({ since: 1005 }).entries.map((entry) => entry.id)).toEqual([2]);
  expect(log.seen('api/save', 1005)).toBe(true);
  expect(log.seen('api/save', 1011)).toBe(false);
});

function fakeContents(id: number, session: object) {
  const emitter = new EventEmitter() as EventEmitter & { id: number; session: object; isDestroyed: () => boolean };
  emitter.id = id;
  emitter.session = session;
  emitter.isDestroyed = () => false;
  return emitter;
}
function fakeSession() {
  const listeners: Record<string, ((details: unknown) => void) | null> = {};
  return {
    webRequest: {
      onCompleted: (filterOrListener: unknown, listener?: (details: unknown) => void) => {
        listeners.completed = listener ?? (filterOrListener as null);
      },
      onErrorOccurred: (filterOrListener: unknown, listener?: (details: unknown) => void) => {
        listeners.error = listener ?? (filterOrListener as null);
      },
    },
    listeners,
  };
}

it('fans one session observer out to each tab and detaches on destroy', () => {
  const session = fakeSession();
  const logs = new AIPageLogs();
  const one = fakeContents(1, session);
  const two = fakeContents(2, session);
  logs.attach(one as never);
  logs.attach(two as never);
  logs.attach(one as never);
  expect(ruleSets.get(session)!.size).toBe(1);
  const [rule] = [...ruleSets.get(session)!];
  rule({ id: 7, method: 'GET', url: 'https://a.test/one', resourceType: 'xhr', webContentsId: 1 });
  rule({ id: 8, method: 'GET', url: 'https://a.test/two', resourceType: 'image', webContentsId: 2 });
  rule({ id: 9, method: 'GET', url: 'https://a.test/none', resourceType: 'xhr' });
  session.listeners.completed!({ id: 7, statusCode: 204, fromCache: true, webContentsId: 1 });
  session.listeners.error!({ id: 8, error: 'net::ERR_ABORTED', webContentsId: 2 });
  one.emit('console-message', {}, { level: 3, message: 'boom', lineNumber: 12, sourceId: 'https://a.test/app.js' });
  expect(logs.requests(one as never).read().entries).toEqual([
    expect.objectContaining({ id: 7, url: 'https://a.test/one', status: 204, fromCache: true }),
  ]);
  expect(logs.requests(two as never).read().entries).toEqual([expect.objectContaining({ id: 8, error: 'net::ERR_ABORTED' })]);
  expect(logs.console(one as never).read().entries).toEqual([
    expect.objectContaining({ level: 'error', message: 'boom', line: 12, source: 'https://a.test/app.js' }),
  ]);
  expect(logs.console(two as never).read().entries).toEqual([]);
  one.emit('destroyed');
  expect(one.listenerCount('console-message')).toBe(0);
  expect(ruleSets.get(session)!.size).toBe(1);
  two.emit('destroyed');
  expect(ruleSets.get(session)!.size).toBe(0);
  expect(session.listeners.completed).toBeNull();
});

it('composes a request condition into wait_until and taints on log reads', () => {
  expect(aiWaitCondition({ request: '/api\\/save/' })).toMatchObject({ request: '/api\\/save/' });
  expect(aiWaitCondition({ url: 'https://a.test/', request: 'save' })).toMatchObject({ url: 'https://a.test/', request: 'save' });
  expect(() => aiWaitCondition({ request: '/(/' })).toThrow('regular expression');
  expect(() => aiWaitCondition({ request: '' })).toThrow('request');
  expect(AI_TAINTING_READS).toEqual(expect.arrayContaining(['read_console', 'read_requests']));
});

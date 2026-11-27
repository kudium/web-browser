/** @jest-environment node */
import type { IApp } from '../types';
import { aiTabSearchQuery, findAITabs, fuzzyScore, groupSessions } from '../browser/aiTabSearch';

const tab = (id: string, url: string, name: string, extra: Partial<IApp> = {}): IApp =>
  ({ id, url, name, icon: '', sessionId: 'g1', sessionName: 'QA builds', spaceId: 'default', ...extra } as IApp);
const tabs = [
  tab('t1', 'https://qa.simpro.test/dashboard', 'Simpro QA – Dashboard'),
  tab('t2', 'https://docs.test/guide', 'Documentation'),
  tab('t3', 'http://localhost:5173/', 'Web', { sessionId: 'g2', sessionName: 'Delight', pinned: true }),
  tab('t4', 'https://old.test/', 'Archived', { archived: true }),
];
const G1 = JSON.stringify(['g1', 'default']);
const G2 = JSON.stringify(['g2', 'default']);
const sessions = (entry: IApp) =>
  entry.sessionId === 'g1' ? [{ origin: 'https://qa.simpro.test', account: 'US devops' }] : [];

it('validates the search arguments', () => {
  expect(aiTabSearchQuery({ query: ' qa ' })).toEqual({ query: 'qa' });
  expect(aiTabSearchQuery({ signedIn: true, limit: 5 })).toEqual({ signedIn: true, limit: 5 });
  expect(() => aiTabSearchQuery({})).toThrow('Give a query');
  expect(() => aiTabSearchQuery({ signedIn: 'yes' })).toThrow('boolean');
  expect(() => aiTabSearchQuery({ query: 'x', limit: 999 })).toThrow('limit');
});

it('scores direct hits above subsequence hits and rejects misses', () => {
  expect(fuzzyScore('qa', 'Simpro QA – Dashboard')).toBeGreaterThan(fuzzyScore('qsd', 'Simpro QA – Dashboard'));
  expect(fuzzyScore('qsd', 'Simpro QA – Dashboard')).toBeGreaterThan(0);
  expect(fuzzyScore('zzz', 'Simpro QA – Dashboard')).toBe(0);
});

it('finds tabs by query, origin, group and signed-in account, never archived ones', () => {
  // "qa" hits t1 by title and t2 only through its group name, so t1 ranks first.
  const byQuery = findAITabs(tabs, { query: 'qa' }, { focused: 't2', sessions });
  expect(byQuery.map((item) => item.id)).toEqual(['t1', 't2']);
  expect(findAITabs(tabs, { query: 'simpro' }, { sessions }).map((item) => item.id)).toEqual(['t1']);
  expect(byQuery[0]).toMatchObject({
    groupId: G1,
    group: 'QA builds',
    reference: '@qa-builds/simpro-qa-dashboard',
    account: 'US devops',
    signedIn: true,
    origin: 'https://qa.simpro.test',
  });
  expect(findAITabs(tabs, { query: 'devops' }, { sessions }).map((item) => item.id)).toEqual(['t1']);
  expect(findAITabs(tabs, { origin: 'localhost:5173' }).map((item) => item.id)).toEqual(['t3']);
  expect(findAITabs(tabs, { groupId: G2 }).map((item) => item.id)).toEqual(['t3']);
  expect(findAITabs(tabs, { signedIn: false }, { sessions }).map((item) => item.id).sort()).toEqual(['t2', 't3']);
  expect(findAITabs(tabs, { query: 'archived' })).toEqual([]);
  expect(findAITabs(tabs, { query: 'e', limit: 1 })).toHaveLength(1);
});

it('reports group sessions once per origin', () => {
  expect(groupSessions(tabs, G1, () => [
    { origin: 'https://qa.simpro.test', account: 'US devops' },
    { origin: 'https://qa.simpro.test' },
  ])).toEqual([{ origin: 'https://qa.simpro.test', account: 'US devops' }]);
  expect(groupSessions(tabs, 'missing', sessions)).toEqual([]);
});

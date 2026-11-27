/**
 * `find_tabs` (spec 4.13): fuzzy search over title, URL, group name and the
 * saved-login reference of the tab's origin. Pure, so the ranking is tested
 * without a browser. Session fields name accounts, never values.
 */
import type { IApp } from '../types';
import { aiGroupId, aiGroups } from './aiGroups';
import { aiOrigin } from './aiTaint';

export interface AISessionIdentity {
  /** Origin with a live signed-in session (cookies present) in the partition. */
  origin: string;
  /** Saved-login reference title for that origin, when one matches. */
  account?: string;
}
export interface AITabMatch {
  id: string;
  title: string;
  url: string;
  origin?: string;
  groupId: string;
  group: string;
  reference: string;
  pinned: boolean;
  focused: boolean;
  /** Signed-in account reference for the tab's origin (name only). */
  account?: string;
  signedIn: boolean;
  score: number;
}
export interface AITabSearchQuery {
  query?: string;
  origin?: string;
  groupId?: string;
  signedIn?: boolean;
  limit?: number;
}

export const AI_TAB_SEARCH_MAX = 50;

export function aiTabSearchQuery(args: Record<string, unknown>): AITabSearchQuery {
  const text = (value: unknown, field: string, max: number) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f]/.test(value))
      throw new Error(`${field} must be a string of at most ${max} characters.`);
    return value.trim() || undefined;
  };
  const query = text(args.query, 'query', 200);
  const origin = text(args.origin, 'origin', 2048);
  const groupId = text(args.groupId, 'groupId', 300);
  if (args.signedIn !== undefined && typeof args.signedIn !== 'boolean')
    throw new Error('signedIn must be boolean.');
  if (
    args.limit !== undefined &&
    (!Number.isInteger(args.limit) || Number(args.limit) < 1 || Number(args.limit) > AI_TAB_SEARCH_MAX)
  )
    throw new Error(`limit must be an integer from 1 to ${AI_TAB_SEARCH_MAX}.`);
  if (!query && !origin && !groupId && args.signedIn === undefined)
    throw new Error('Give a query, origin, groupId or signedIn filter.');
  return {
    ...(query ? { query } : {}),
    ...(origin ? { origin } : {}),
    ...(groupId ? { groupId } : {}),
    ...(args.signedIn !== undefined ? { signedIn: args.signedIn as boolean } : {}),
    ...(args.limit !== undefined ? { limit: Number(args.limit) } : {}),
  };
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

/** Subsequence match with a bonus for word-start hits; 0 when absent. */
export function fuzzyScore(query: string, candidate: string): number {
  const needle = normalize(query);
  const haystack = normalize(candidate);
  if (!needle || !haystack) return 0;
  const direct = haystack.indexOf(needle);
  if (direct >= 0) return 100 - Math.min(40, direct) + (direct === 0 || /\W/.test(haystack[direct - 1]) ? 10 : 0);
  let position = 0;
  let score = 0;
  let previous = -2;
  for (const char of needle) {
    const index = haystack.indexOf(char, position);
    if (index < 0) return 0;
    score += index === previous + 1 ? 3 : 1;
    if (index === 0 || /\W/.test(haystack[index - 1])) score += 2;
    previous = index;
    position = index + 1;
  }
  return Math.min(60, score);
}

function originMatches(wanted: string, origin: string | undefined) {
  if (!origin) return false;
  const candidate = aiOrigin(/^[a-z]+:\/\//i.test(wanted) ? wanted : `https://${wanted}`);
  const alternate = aiOrigin(`http://${wanted.replace(/^[a-z]+:\/\//i, '')}`);
  return origin === candidate || origin === alternate || origin.endsWith(`.${wanted.replace(/^[a-z]+:\/\//i, '')}`);
}

export function findAITabs(
  tabs: IApp[],
  search: AITabSearchQuery,
  options: {
    focused?: string;
    /** Signed-in origins per login profile (partition), names only. */
    sessions?: (tab: IApp) => AISessionIdentity[];
  } = {}
): AITabMatch[] {
  const groups = aiGroups(tabs);
  const pages = new Map(
    groups.flatMap((group) => group.tabs.map((page) => [page.id, { group, page }] as const))
  );
  const limit = search.limit ?? 20;
  const matches: AITabMatch[] = [];
  tabs.forEach((tab) => {
    if (tab.archived) return;
    const entry = pages.get(tab.id);
    if (!entry) return;
    const origin = aiOrigin(tab.url);
    if (search.groupId && entry.group.id !== search.groupId) return;
    if (search.origin && !originMatches(search.origin, origin)) return;
    const sessions = options.sessions?.(tab) ?? [];
    const session = origin ? sessions.find((item) => item.origin === origin) : undefined;
    const signedIn = !!session;
    if (search.signedIn !== undefined && signedIn !== search.signedIn) return;
    const title = tab.customName || tab.name || '';
    let score = 1;
    if (search.query) {
      score = Math.max(
        fuzzyScore(search.query, title) * 1.0,
        fuzzyScore(search.query, tab.url) * 0.8,
        fuzzyScore(search.query, entry.group.name) * 0.7,
        session?.account ? fuzzyScore(search.query, session.account) * 0.9 : 0
      );
      if (score <= 0) return;
    }
    matches.push({
      id: tab.id,
      title,
      url: tab.url,
      ...(origin ? { origin } : {}),
      groupId: entry.group.id,
      group: entry.group.name,
      reference: `@${entry.group.slug}/${entry.page.slug}`,
      pinned: !!tab.pinned,
      focused: tab.id === options.focused,
      ...(session?.account ? { account: session.account } : {}),
      signedIn,
      score: Math.round(score),
    });
  });
  return matches
    .sort((a, b) => b.score - a.score || Number(b.focused) - Number(a.focused) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** The `sessions` field of list_groups: signed-in origins per group, names only. */
export function groupSessions(
  tabs: IApp[],
  groupId: string,
  sessions: (tab: IApp) => AISessionIdentity[]
): AISessionIdentity[] {
  const member = tabs.find((tab) => !tab.archived && aiGroupId(tab) === groupId);
  if (!member) return [];
  const seen = new Map<string, AISessionIdentity>();
  sessions(member).forEach((item) => {
    if (!seen.has(item.origin)) seen.set(item.origin, item);
  });
  return [...seen.values()];
}

import type { Session } from 'electron';
import type { IApp } from '../types';
import type { AISessionIdentity } from '../browser/aiTabSearch';
import { loginProfileKey } from '../utils/groups';
import { aiOrigin } from '../browser/aiTaint';

/**
 * Which origins a group's partition is signed into (spec 4.13). "Signed in"
 * is approximated by the presence of cookies for the origin's host; the
 * saved-login reference for that origin names the account (title only,
 * never a value). Computed once per partition and origin, cached until the
 * partition's cookie-change event.
 */
export class AISessionIdentityCache {
  private cache = new Map<string, Map<string, AISessionIdentity | null>>();

  private watched = new Set<string>();

  constructor(
    private readonly options: {
      sessionFor: (profile: string) => Session | undefined;
      /** Saved-login reference title for an origin in the tab's data scope, or undefined. */
      accountFor: (origin: string, tab: IApp) => string | undefined;
    }
  ) {}

  invalidate(profile?: string) {
    if (profile === undefined) this.cache.clear();
    else this.cache.delete(profile);
  }

  private watch(profile: string, session: Session) {
    if (this.watched.has(profile)) return;
    this.watched.add(profile);
    session.cookies.on('changed', () => this.cache.delete(profile));
  }

  /** Identities for the origins of the given tabs (one partition). */
  async identities(member: IApp, origins: string[]): Promise<AISessionIdentity[]> {
    const profile = loginProfileKey(member);
    const session = this.options.sessionFor(profile);
    if (!session) return [];
    this.watch(profile, session);
    let known = this.cache.get(profile);
    if (!known) {
      known = new Map();
      this.cache.set(profile, known);
    }
    const result: AISessionIdentity[] = [];
    for (const origin of origins) {
      let identity = known.get(origin);
      if (identity === undefined) {
        identity = await this.compute(session, origin, member);
        known.set(origin, identity);
      }
      if (identity) result.push(identity);
    }
    return result;
  }

  private async compute(session: Session, origin: string, member: IApp): Promise<AISessionIdentity | null> {
    const host = (() => {
      try {
        return new URL(origin).hostname;
      } catch {
        return undefined;
      }
    })();
    if (!host) return null;
    let cookies: { name: string }[] = [];
    try {
      cookies = await session.cookies.get({ domain: host });
    } catch {
      return null;
    }
    if (!cookies.length) return null;
    const account = this.options.accountFor(origin, member);
    return { origin, ...(account ? { account } : {}) };
  }
}

/** Distinct http(s) origins of a group's tabs. */
export function tabOrigins(tabs: IApp[]): string[] {
  const origins = new Set<string>();
  tabs.forEach((tab) => {
    const origin = aiOrigin(tab.url);
    if (origin && /^https?:/.test(origin)) origins.add(origin);
  });
  return [...origins];
}

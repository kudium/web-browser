import type { IApp } from '../types';
import { aiGroupId } from './aiGroups';

export interface LinkRoutingRule {
  id: string;
  hostname: string;
  includeSubdomains: boolean;
  enabled: boolean;
  spaceId: string;
  groupId?: string;
}

export function validateLinkRoutingRules(value: unknown): LinkRoutingRule[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Use at most 100 link routing rules.');
  const ids = new Set<string>();
  return value.map(rule => {
    if (!rule || typeof rule !== 'object' || typeof rule.id !== 'string' ||
      !/^[\w-]{1,128}$/.test(rule.id) || ids.has(rule.id) ||
      typeof rule.hostname !== 'string' || rule.hostname.length > 253 ||
      typeof rule.enabled !== 'boolean' || typeof rule.includeSubdomains !== 'boolean' ||
      typeof rule.spaceId !== 'string' || !/^[\w-]{1,128}$/.test(rule.spaceId) ||
      (rule.groupId !== undefined && (typeof rule.groupId !== 'string' || rule.groupId.length > 1024)))
      throw new Error('Invalid link routing rule.');
    const text = rule.hostname.trim().toLowerCase().replace(/\.$/, '');
    if (!text || /[\s/:?#@*]/.test(text)) throw new Error('Enter a hostname such as example.com, without a path or wildcard.');
    const hostname = new URL(`https://${text}`).hostname;
    if (!hostname || hostname.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))
      throw new Error('Invalid website hostname.');
    ids.add(rule.id);
    return {id: rule.id, hostname, includeSubdomains: rule.includeSubdomains,
      enabled: rule.enabled, spaceId: rule.spaceId, ...(rule.groupId ? {groupId: rule.groupId} : {})};
  });
}

/** First usable rule wins. Missing/archived destinations never create a new login. */
export function resolveLinkRoute(url: string, rules: readonly LinkRoutingRule[],
  spaces: readonly {id: string}[], apps: readonly IApp[]) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return undefined;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    for (const rule of rules) {
      if (!rule.enabled || !(host === rule.hostname ||
        (rule.includeSubdomains && host.endsWith(`.${rule.hostname}`)))) continue;
      if (!spaces.some(space => space.id === rule.spaceId)) continue;
      const source = rule.groupId ? apps.find(app => !app.archived &&
        (app.spaceId || 'default') === rule.spaceId && aiGroupId(app) === rule.groupId) : undefined;
      if (rule.groupId && !source) continue;
      return {rule, spaceId: rule.spaceId, source};
    }
  } catch { /* Malformed external URLs are not routable. */ }
  return undefined;
}

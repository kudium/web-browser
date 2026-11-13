/* Shared portable source contract; both apps build this module directly. */
/* eslint-disable import/no-relative-packages */
import type {
  HookPackage,
  PublishedHookPackage,
} from '../../../../packages/hooks/package';
// eslint-disable-next-line import/no-relative-packages
import { parseHookPackage } from '../../../../packages/hooks/package';
import type { SiteHook } from './siteDeveloper';

export type {
  HookPackage,
  PublishedHookPackage,
} from '../../../../packages/hooks/package';
export interface InstalledHookSource {
  url: string;
  packageId?: string;
  version?: number;
  contentHash: string;
  package: HookPackage;
}
export interface GlobalHook extends SiteHook {
  exclusions: string[];
}
export interface GlobalHookConfig {
  enabled: boolean;
  hooks: GlobalHook[];
}
export interface HookDestination {
  id: string;
  name: string;
  groupName: string;
  groupId: string;
  profile: string;
  url: string;
}
export interface HookImportPreview {
  receipt: string;
  source: string;
  verified: boolean;
  publication?: Omit<PublishedHookPackage, 'package'>;
  package: HookPackage;
}
export const ALL_GROUPS_HOOK_SCOPE = '@all-groups';
type ScopedHookMarketplaceRequest =
  | { action: 'destinations' }
  | { action: 'browse' }
  | { action: 'preview'; url: string }
  | { action: 'state'; id?: string }
  | {
      action: 'install';
      id?: string;
      receipt: string;
      global: boolean;
      replaceId?: string;
      expectedHash?: string;
    }
  | {
      action: 'global-save';
      id?: string;
      config: GlobalHookConfig;
      expectedHash: string;
    }
  | {
      action: 'publish';
      id?: string;
      hookId: string;
      description: string;
      name?: string;
      license: HookPackage['license'];
      general: boolean;
      listingId?: string;
      expectedVersion?: number;
    }
  | { action: 'updates'; id?: string }
  | { action: 'account-status' }
  | { action: 'account-preferences' };
export type HookMarketplaceRequest = ScopedHookMarketplaceRequest & {
  allGroups?: boolean;
};
export interface HookMarketplaceState {
  destination: HookDestination;
  global: GlobalHookConfig;
  globalHash: string;
  siteHooks: SiteHook[];
  defaultHook?: SiteHook;
}
export interface HookUpdate {
  hookId: string;
  global: boolean;
  modified: boolean;
  localHash: string;
  localPackage: HookPackage;
  preview?: HookImportPreview;
  current: InstalledHookSource;
  error?: string;
}

/**
 * Validate provenance separately; it is metadata, never an execution
 * permission.
 */
export function validInstalledHookSource(
  value: unknown
): value is InstalledHookSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as InstalledHookSource;
  try {
    if (
      Object.keys(item).some(
        (key) =>
          !['url', 'packageId', 'version', 'contentHash', 'package'].includes(
            key
          )
      )
    )
      return false;
    const source = new URL(item.url);
    if (
      source.protocol !== 'https:' ||
      source.username ||
      source.password ||
      item.url.length > 4096 ||
      !/^[a-f0-9]{64}$/.test(item.contentHash)
    )
      return false;
    if (
      item.packageId !== undefined &&
      (typeof item.packageId !== 'string' ||
        !item.packageId ||
        item.packageId.length > 100)
    )
      return false;
    if (
      item.version !== undefined &&
      (!Number.isSafeInteger(item.version) || item.version < 1)
    )
      return false;
    parseHookPackage(item.package);
    return true;
  } catch {
    return false;
  }
}

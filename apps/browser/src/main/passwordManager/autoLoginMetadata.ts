import type {
  VaultItem,
  DataOverride,
  VaultSummary,
} from '../../browser/passwordManager';
import { effectiveRecords } from './records';
import { loginCredentials } from './loginCredentials';

export type LoginAccountMetadata = {
  id: string;
  title: string;
  username: string;
  origin: string;
  scope?: string;
  loginURL?: string;
};
export type AutoLoginMetadata = {
  accounts: LoginAccountMetadata[];
  overrides: { scope: string; id: string; account?: LoginAccountMetadata }[];
};
function accountOf(item: VaultItem): LoginAccountMetadata | undefined {
  const credentials = loginCredentials(item);
  return credentials && item.origin
    ? {
        id: item.id,
        title: item.title,
        username: credentials.username,
        origin: item.origin,
        scope: item.scope,
        loginURL: item.loginURL,
      }
    : undefined;
}

/** A separate nonsecret projection: no password, field values, notes or documents. */
export function autoLoginMetadata(
  items: VaultItem[],
  overrides: DataOverride[],
): AutoLoginMetadata {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    accounts: items.flatMap((item) => {
      const account = accountOf(item);
      return account ? [account] : [];
    }),
    overrides: overrides.map((override) => {
      const base = byId.get(override.recordId);
      const effective =
        base && effectiveRecords([base], [override], override.scope)[0];
      return {
        scope: override.scope,
        id: override.recordId,
        account: effective ? accountOf(effective) : undefined,
      };
    }),
  };
}

/** Older files have only basic login metadata; first normal unlock upgrades the index. */
export function legacyAutoLoginMetadata(
  items: VaultSummary[],
): AutoLoginMetadata {
  return {
    accounts: items
      .filter((item) => item.kind === 'login' && item.origin && item.username)
      .map((item) => ({
        id: item.id,
        title: item.title,
        username: item.username,
        origin: item.origin,
        scope: item.scope,
        loginURL: item.loginURL,
      })),
    overrides: [],
  };
}

export class AutoLoginMetadataCache {
  private lookups = new Map<
    string | undefined,
    Map<string, LoginAccountMetadata[]>
  >();
  constructor(private index: AutoLoginMetadata) {}
  accounts(origin: string, scope?: string) {
    let byOrigin = this.lookups.get(scope);
    if (!byOrigin) {
      const overrides = new Map(
        this.index.overrides
          .filter((item) => item.scope === scope)
          .map((item) => [item.id, item]),
      );
      const accounts = this.index.accounts
        .filter((account) => !account.scope || account.scope === scope)
        .flatMap((account) => {
          const override =
            !account.scope && scope ? overrides.get(account.id) : undefined;
          return override
            ? override.account
              ? [override.account]
              : []
            : [account];
        });
      // An override can add login credentials to an inherited non-login record.
      const present = new Set(accounts.map((account) => account.id));
      for (const override of overrides.values()) {
        if (override.account && !present.has(override.id))
          accounts.push(override.account);
      }
      byOrigin = new Map();
      for (const account of accounts) {
        const existing = byOrigin.get(account.origin) || [];
        existing.push(account);
        byOrigin.set(account.origin, existing);
      }
      this.lookups.set(scope, byOrigin);
    }
    return byOrigin.get(origin) || [];
  }
}

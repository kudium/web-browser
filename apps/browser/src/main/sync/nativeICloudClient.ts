import { AccountSyncClient } from './accountClient';
import { CloudKitEncryptedStore } from './cloudKitStore';
import { cloudKitTransport } from './cloudKitTransport';

/**
 * Provisioned integration entry point. No native call occurs until Connect is
 * requested.
 */
export function nativeICloudClient(
  options: Pick<
    ConstructorParameters<typeof AccountSyncClient>[0],
    'load' | 'save' | 'preferences' | 'enable'
  >,
  native: { request: (value: string) => Promise<string> }
) {
  const store = new CloudKitEncryptedStore(native);
  return new AccountSyncClient({
    ...options,
    provider: 'icloud',
    request: cloudKitTransport(store),
    nativeAccount: async () => {
      const id = await store.account();
      return { id, token: id, email: 'iCloud account on this Mac' };
    },
    open: async () => {
      throw new Error('Native iCloud never opens website authentication.');
    },
  });
}

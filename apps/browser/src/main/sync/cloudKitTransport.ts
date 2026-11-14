import { CloudKitEncryptedStore } from './cloudKitStore';
import { syncRequest, SyncHTTPError } from './transport';

/** Native-only API adapter shared with the tested recovery/snapshot sync client. */
export function cloudKitTransport(
  store: CloudKitEncryptedStore
): typeof syncRequest {
  return async (
    path,
    token,
    body,
    headers = {},
    method = body ? 'POST' : 'GET'
  ) => {
    // Sign-out detaches the app; it never signs the system out of iCloud.
    if (path === '/api/auth/sign-out' && method === 'POST')
      return { status: 200, headers: new Headers(), body: {} };
    if (!token) throw new Error('Connect the native iCloud account first.');
    const result = (value: unknown) => ({
      status: 200,
      headers: new Headers(),
      body: value,
    });
    if (path.startsWith('/v1/sync/changes?') && method === 'GET') {
      const records = await store.list(token);
      return result({
        cursor: 'native-full-refresh',
        hasMore: false,
        changes: records,
      });
    }
    const match = path.match(/^\/v1\/sync\/records\/([A-Za-z0-9_-]{1,128})$/);
    if (match && method === 'GET') {
      const record = await store.get(token, match[1]);
      if (!record || record.deleted)
        throw new SyncHTTPError(404, 'not_found', record?.revision);
      return result(record);
    }
    if (match && method === 'PUT') {
      const envelope = body as Parameters<CloudKitEncryptedStore['put']>[1];
      if (!envelope || envelope.recordId !== match[1])
        throw new Error('CloudKit record mismatch.');
      let revision = 0;
      if (headers['If-Match']) {
        if (!/^"[1-9][0-9]*"$/.test(headers['If-Match']))
          throw new Error('Invalid CloudKit condition.');
        revision = Number(headers['If-Match'].slice(1, -1));
      } else if (headers['If-None-Match'] !== '*')
        throw new Error('A conditional CloudKit write is required.');
      try {
        return result(await store.put(token, envelope, revision));
      } catch (error) {
        if (
          (error as Error).message ===
          'CloudKit record changed. Refresh before retrying.'
        )
          throw new SyncHTTPError(
            409,
            'conflict',
            (await store.get(token, match[1]))?.revision
          );
        throw error;
      }
    }
    if (
      path === '/v1/sync/data' &&
      method === 'DELETE' &&
      headers['X-Confirm-Delete'] === 'all-sync-data'
    ) {
      const records = await store.list(token);
      // Erase payloads first, then the root check; concurrent writes fail closed on revision checks.
      const ordered = records.sort(
        (a, b) =>
          Number(a.recordId === 'account_key_check_v1') -
          Number(b.recordId === 'account_key_check_v1')
      );
      // eslint-disable-next-line no-restricted-syntax -- CloudKit conditional deletes must run sequentially.
      for (const record of ordered) {
        // eslint-disable-next-line no-await-in-loop
        await store.remove(token, record.recordId, record.revision);
      }
      return result({ deleted: true });
    }
    throw new Error('Unsupported native CloudKit operation.');
  };
}

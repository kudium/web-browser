export const SYNC_ORIGIN = 'https://browser.kudium.com';

interface TransportResult {
  status: number;
  headers: Headers;
  body: any;
}
export class SyncHTTPError extends Error {
  constructor(
    public status: number,
    public code: string,
    public revision?: number
  ) {
    super(code);
  }
}
export async function syncRequest(
  path: string,
  token?: string,
  body?: unknown,
  headers: Record<string, string> = {},
  method = body ? 'POST' : 'GET'
): Promise<TransportResult> {
  if (!path.startsWith('/api/auth/') && !path.startsWith('/v1/sync/'))
    throw new Error('Invalid sync request');
  const response = await fetch(`${SYNC_ORIGIN}${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      'User-Agent': 'Kudium Browser desktop sync',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const content = await response.text();
  if (content.length > 12 * 1024 * 1024)
    throw new Error('Sync response exceeds the size limit');
  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('Invalid sync response');
  }
  if (!response.ok)
    throw new SyncHTTPError(
      response.status,
      data.error || 'sync_request_failed',
      Number.isSafeInteger(data.revision) && data.revision > 0
        ? data.revision
        : undefined
    );
  return { status: response.status, headers: response.headers, body: data };
}

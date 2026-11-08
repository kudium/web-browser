import type { SyncEnvelope } from './encryption';

interface CloudRecord {
  recordId: string;
  revision: number;
  deleted: boolean;
  envelope?: SyncEnvelope;
}
/**
 * Inject the provisioned main-process native module; never expose it to
 * renderer IPC.
 */
export class CloudKitEncryptedStore {
  private native: { request: (value: string) => Promise<string> };

  constructor(native: { request: (value: string) => Promise<string> }) {
    this.native = native;
  }

  private async call(value: Record<string, unknown>) {
    const result = await this.native.request(JSON.stringify(value));
    if (
      typeof result !== 'string' ||
      Buffer.byteLength(result) > 8 * 1024 * 1024
    )
      throw new Error('CloudKit response exceeds the limit.');
    const parsed = JSON.parse(result);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Invalid CloudKit response.');
    return parsed;
  }

  async account() {
    const value = await this.call({ operation: 'account' });
    if (
      Object.keys(value).length !== 1 ||
      typeof value.accountId !== 'string' ||
      !value.accountId ||
      value.accountId.length > 256
    )
      throw new Error('Invalid iCloud account.');
    return value.accountId as string;
  }

  private async guarded(accountId: string, operation: Record<string, unknown>) {
    if ((await this.account()) !== accountId)
      throw new Error('iCloud account changed. Reconnect before syncing.');
    const value = await this.call({ ...operation, accountId });
    if ((await this.account()) !== accountId)
      throw new Error('iCloud account changed during sync.');
    return value;
  }

  private static envelope(value: unknown, recordId: string): SyncEnvelope {
    const data = value as SyncEnvelope;
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      Object.keys(data).some(
        (key) =>
          ![
            'version',
            'recordId',
            'keyVersion',
            'nonce',
            'ciphertext',
            'tag',
          ].includes(key)
      ) ||
      Object.keys(data).length !== 6 ||
      data.version !== 1 ||
      data.recordId !== recordId ||
      !Number.isSafeInteger(data.keyVersion) ||
      data.keyVersion < 1 ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(recordId)
    )
      throw new Error('Invalid encrypted CloudKit envelope.');
    const decode = (input: unknown, max: number, exact = false) => {
      if (typeof input !== 'string' || input.length > Math.ceil(max / 3) * 4)
        throw new Error('Invalid encrypted CloudKit bytes.');
      const bytes = Buffer.from(input, 'base64');
      if (
        bytes.toString('base64') !== input ||
        bytes.length > max ||
        (exact && bytes.length !== max)
      )
        throw new Error('Invalid encrypted CloudKit bytes.');
    };
    decode(data.nonce, 12, true);
    decode(data.tag, 16, true);
    decode(data.ciphertext, 700 * 1024);
    return data;
  }

  private static record(value: any, recordId?: string): CloudRecord {
    if (
      typeof value.recordId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(value.recordId) ||
      (recordId && value.recordId !== recordId) ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      typeof value.deleted !== 'boolean' ||
      Object.keys(value).some(
        (field) =>
          !['recordId', 'revision', 'deleted', 'envelope'].includes(field)
      ) ||
      (value.deleted && value.envelope !== undefined)
    )
      throw new Error('Invalid CloudKit record.');
    return {
      recordId: value.recordId,
      revision: value.revision,
      deleted: value.deleted,
      ...(!value.deleted
        ? {
            envelope: CloudKitEncryptedStore.envelope(
              JSON.parse(value.envelope),
              value.recordId
            ),
          }
        : {}),
    };
  }

  async get(accountId: string, recordId: string) {
    const value = await this.guarded(accountId, { operation: 'get', recordId });
    if (
      value.missing === true &&
      value.revision === 0 &&
      Object.keys(value).length === 2
    )
      return undefined;
    return CloudKitEncryptedStore.record(value, recordId);
  }

  async list(accountId: string) {
    const value = await this.guarded(accountId, { operation: 'list' });
    if (
      !Array.isArray(value.records) ||
      value.records.length > 1000 ||
      Object.keys(value).length !== 1
    )
      throw new Error('Invalid CloudKit record list.');
    const records = value.records.map((item: unknown) =>
      CloudKitEncryptedStore.record(item)
    );
    if (
      new Set(records.map((item: CloudRecord) => item.recordId)).size !==
      records.length
    )
      throw new Error('Duplicate CloudKit records.');
    return records as CloudRecord[];
  }

  async put(accountId: string, envelope: SyncEnvelope, revision: number) {
    CloudKitEncryptedStore.envelope(envelope, envelope.recordId);
    return this.write(
      accountId,
      envelope.recordId,
      revision,
      JSON.stringify(envelope)
    );
  }

  async remove(accountId: string, recordId: string, revision: number) {
    return this.write(accountId, recordId, revision);
  }

  private async write(
    accountId: string,
    recordId: string,
    revision: number,
    envelope?: string
  ) {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(recordId) ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      throw new Error('Invalid CloudKit write.');
    const value = await this.guarded(accountId, {
      operation: envelope === undefined ? 'remove' : 'put',
      recordId,
      revision,
      ...(envelope === undefined ? {} : { envelope }),
    });
    if (value.conflict === true)
      throw new Error('CloudKit record changed. Refresh before retrying.');
    return CloudKitEncryptedStore.record(value, recordId);
  }
}

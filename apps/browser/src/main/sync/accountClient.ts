import { createHash, randomBytes, randomUUID } from 'crypto';
import type {
  AccountSyncInput,
  AccountSyncStatus,
  RemoteWorkspace,
  RestoredWorkspace,
} from '../../browser/accountSync';
import type { BrowserPreferences } from '../../browser/preferences';
import type { IApp } from '../../types';
import type { Space } from '../../utils/SpaceManager';
import { buildSyncSnapshot, validateIncomingSnapshot } from './snapshot';
import {
  encryptSyncRecord,
  decryptSyncRecord,
  SyncEnvelope,
} from './encryption';
import { SyncedNote, validateSyncedNotes } from '../../browser/notes';
import { SyncedLogin, validateSyncedLogins } from './passwords';
import { syncRequest, SyncHTTPError, SYNC_ORIGIN } from './transport';

const clientId = 'kudium-desktop';
const keyRecord = 'account_key_check_v1';
interface Credential {
  token: string;
  email: string;
  accountId: string;
  deviceId: string;
  key?: string;
  enrolled?: boolean;
}
interface Stored {
  credential?: Credential;
  cursor?: string;
  revision?: number;
  lastSyncedAt?: number;
}
export { syncRequest, SyncHTTPError, SYNC_ORIGIN } from './transport';
export class AccountSyncClient {
  private saved: Stored;

  private phase: AccountSyncStatus['phase'] = 'off';

  private message = 'Connect your Kudium account to set up encrypted sync.';

  private pending?: {
    code: string;
    userCode: string;
    expiresAt: number;
    interval: number;
  };

  private generation = 0;

  private busy = false;

  private remote = new Map<
    string,
    { revision: number; snapshot: ReturnType<typeof validateIncomingSnapshot> }
  >();

  private input?: {
    apps: IApp[];
    spaces: Space[];
    currentUrls?: Record<string, string>;
  };

  private lastDigest?: string;

  private noteRecords = new Set<string>();

  private passwordRecords = new Set<string>();

  private managedKeyAttempted = false;

  private failures = 0;

  private retryAt = 0;

  constructor(
    private options: {
      load: () => Stored;
      save: (value: Stored) => void;
      preferences: () => BrowserPreferences;
      enable: () => void;
      open: (url: string) => Promise<void>;
      request?: typeof syncRequest;
      provider?: 'kudiumbrowser' | 'icloud';
      nativeAccount?: () => Promise<{
        id: string;
        email: string;
        token: string;
      }>;
    }
  ) {
    if (
      options.provider === 'icloud' &&
      (!options.nativeAccount || !options.request)
    )
      throw new Error('iCloud requires its native account and transport.');
    this.saved = options.load();
    this.saved.cursor = undefined;
    if (this.saved.credential) {
      this.phase = 'recovery-required';
      if (this.saved.credential.key) this.phase = 'key-required';
      if (this.saved.credential.enrolled) this.phase = 'ready';
      this.message = 'Account connected. Sync runs when enabled.';
    }
  }

  private request(...args: Parameters<typeof syncRequest>) {
    return (this.options.request || syncRequest)(...args);
  }

  private persist() {
    this.options.save(this.saved);
  }

  status(): AccountSyncStatus {
    const remote: RemoteWorkspace[] = Array.from(
      this.remote,
      ([recordId, { snapshot }]) => ({
        recordId,
        deviceId: snapshot.deviceId,
        updatedAt: snapshot.createdAt,
        groups: new Set(
          snapshot.workspace?.apps.map((tab) => tab.sessionId) || []
        ).size,
        tabs: snapshot.openTabs?.length || snapshot.workspace?.apps.length || 0,
      })
    );
    return {
      phase: this.phase,
      connected: Boolean(this.saved.credential),
      email: this.saved.credential?.email,
      userCode: this.pending?.userCode,
      recoveryKey:
        this.phase === 'key-required' ? this.saved.credential?.key : undefined,
      lastSyncedAt: this.saved.lastSyncedAt,
      message: this.message,
      remote,
      noteDevices: this.options.preferences().cloudSync.categories.notes
        ? [...this.noteRecords].map((recordId) => ({
            recordId,
            deviceId: recordId.slice(6),
          }))
        : [],
      passwordDevices: this.options.preferences().cloudSync.categories.passwords
        ? [...this.passwordRecords]
            .filter(
              (recordId) =>
                recordId !== `passwords_${this.saved.credential?.deviceId}`
            )
            .map((recordId) => ({ recordId, deviceId: recordId.slice(10) }))
        : [],
    };
  }

  async connect(authMode?: 'sign-in' | 'sign-up') {
    if (
      authMode !== undefined &&
      authMode !== 'sign-in' &&
      authMode !== 'sign-up'
    )
      throw new Error('Choose sign in or create account.');
    if (this.pending && Date.now() < this.pending.expiresAt) {
      await this.openAuthorization(authMode);
      return;
    }
    this.cancel();
    const { generation } = this;
    if (this.options.nativeAccount) {
      const account = await this.options.nativeAccount();
      await this.enroll(account.token, account, generation);
      return;
    }
    const { body } = await this.request('/api/auth/device/code', undefined, {
      client_id: clientId,
      scope: 'sync',
    });
    if (generation !== this.generation) return;
    if (
      typeof body.device_code !== 'string' ||
      body.device_code.length > 256 ||
      !/^[-A-Za-z0-9]{4,32}$/.test(body.user_code) ||
      !Number.isFinite(body.expires_in) ||
      !Number.isFinite(body.interval)
    )
      throw new Error('Invalid device authorization response');
    this.pending = {
      code: body.device_code,
      userCode: body.user_code,
      expiresAt: Date.now() + Math.min(body.expires_in, 600) * 1000,
      interval: Math.max(5, Math.min(body.interval, 30)) * 1000,
    };
    this.phase = 'connecting';
    this.message = 'Compare the code and approve this device on the website.';
    await this.openAuthorization(authMode);
  }

  private async openAuthorization(authMode?: 'sign-in' | 'sign-up') {
    if (!this.pending) return;
    const destination = `/device?user_code=${encodeURIComponent(
      this.pending.userCode
    )}`;
    await this.options.open(
      authMode
        ? `${SYNC_ORIGIN}/${authMode}?next=${encodeURIComponent(destination)}`
        : `${SYNC_ORIGIN}${destination}`
    );
  }

  cancel() {
    this.generation += 1;
    this.pending = undefined;
    this.phase = this.saved.credential?.enrolled ? 'ready' : 'off';
  }

  async poll() {
    const { pending } = this;
    if (!pending || this.busy) return;
    if (Date.now() > pending.expiresAt) {
      this.cancel();
      this.phase = 'error';
      this.message = 'Connection expired. Please connect again.';
      return;
    }
    const { generation } = this;
    this.busy = true;
    try {
      const result = await this.request('/api/auth/device/token', undefined, {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: pending.code,
        client_id: clientId,
      });
      if (generation !== this.generation) return;
      const token = result.headers.get('set-auth-token');
      if (!token || token.length > 16384)
        throw new Error(
          'The service did not issue a signed desktop credential.'
        );
      const session = (await this.request('/api/auth/get-session', token)).body;
      if (!session?.user?.id || typeof session.user.email !== 'string')
        throw new Error('Invalid account session');
      if (generation !== this.generation) {
        await this.request('/api/auth/sign-out', token, {}).catch(() => {});
        return;
      }
      await this.enroll(token, session.user, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      if (
        error instanceof SyncHTTPError &&
        error.code === 'authorization_pending'
      )
        return;
      if (error instanceof SyncHTTPError && error.code === 'slow_down') {
        pending.interval += 5000;
        return;
      }
      this.phase = 'error';
      this.message =
        error instanceof SyncHTTPError && error.status === 401
          ? 'Account connection expired. Connect again.'
          : 'Unable to connect. Please try again.';
      this.pending = undefined;
    } finally {
      this.busy = false;
    }
  }

  private async enroll(
    token: string,
    user: { id: string; email: string },
    generation: number
  ) {
    if (generation !== this.generation) return;
    const accountId = createHash('sha256')
      .update(
        `${this.options.provider === 'icloud' ? 'icloud' : 'better-auth'}\0${
          user.id
        }`
      )
      .digest('hex');
    const previous = this.saved.credential;
    this.saved = {
      credential: {
        token,
        email: user.email,
        accountId,
        deviceId:
          previous?.accountId === accountId ? previous.deviceId : randomUUID(),
        key: previous?.accountId === accountId ? previous.key : undefined,
        enrolled: previous?.accountId === accountId ? previous.enrolled : false,
      },
    };
    this.remote.clear();
    this.noteRecords.clear();
    this.passwordRecords.clear();
    this.lastDigest = undefined;
    this.pending = undefined;
    this.persist();
    const credential = this.saved.credential!;
    this.managedKeyAttempted = false;
    if (await this.recoverAccountKey()) return;
    if (generation !== this.generation) return;
    try {
      const root = (await this.request(`/v1/sync/records/${keyRecord}`, token))
        .body;
      if (generation !== this.generation) return;
      let valid = false;
      if (credential.key && credential.enrolled) {
        const key = Buffer.from(credential.key, 'base64url');
        try {
          const check = decryptSyncRecord(root.envelope, key) as any;
          valid =
            check?.kind === 'kudium-sync-key' && check.accountId === accountId;
        } catch {
          valid = false;
        } finally {
          key.fill(0);
        }
      }
      if (valid) {
        this.phase = 'ready';
        this.message = 'Connected. Review your sync choices and enable sync.';
      } else {
        credential.enrolled = false;
        credential.key = undefined;
        this.phase = 'recovery-required';
        this.message =
          'Enter the recovery key from your first device to unlock sync.';
      }
      this.persist();
    } catch (error) {
      if (generation !== this.generation) return;
      if (!(error instanceof SyncHTTPError) || error.status !== 404)
        throw error;
      credential.enrolled = false;
      credential.key = randomBytes(32).toString('base64url');
      this.persist();
      this.phase = 'key-required';
      this.message =
        'Save this recovery key. You will need it on your other devices.';
    }
  }

  pollingInterval() {
    return this.pending?.interval || 5000;
  }

  connectionRevision() {
    return this.generation;
  }

  async autoUnlock() {
    if (
      this.managedKeyAttempted ||
      !this.saved.credential ||
      this.saved.credential.enrolled
    )
      return;
    this.managedKeyAttempted = true;
    await this.recoverAccountKey();
  }

  async recoverAccountKey(recoveryKey?: string): Promise<boolean> {
    if (this.options.provider === 'icloud') return false;
    const { credential } = this.saved;
    if (!credential) throw new Error('Connect your account first.');
    const { generation } = this;
    const migrationKey = recoveryKey?.trim() || credential.key;
    let endpointAvailable = false;
    try {
      const response = await this.request(
        '/v1/sync/account-key',
        credential.token,
        migrationKey ? { recoveryKey: migrationKey } : {}
      );
      endpointAvailable = true;
      if (
        generation !== this.generation ||
        credential !== this.saved.credential
      )
        return false;
      const value = response.body?.key;
      if (
        response.body?.managed !== true ||
        typeof value !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(value) ||
        Buffer.from(value, 'base64url').toString('base64url') !== value
      )
        throw new Error('The server returned an invalid account key.');
      const key = Buffer.from(value, 'base64url');
      try {
        const root = (
          await this.request(`/v1/sync/records/${keyRecord}`, credential.token)
        ).body;
        const proof = decryptSyncRecord(root.envelope, key) as any;
        if (
          proof?.kind !== 'kudium-sync-key' ||
          proof.accountId !== credential.accountId
        )
          throw new Error('The account key could not unlock your synced data.');
      } finally {
        key.fill(0);
      }
      if (
        generation !== this.generation ||
        credential !== this.saved.credential
      )
        return false;
      credential.key = value;
      credential.enrolled = true;
      this.managedKeyAttempted = true;
      this.persist();
      this.phase = 'ready';
      this.message = 'Your synced data is unlocked with your account.';
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      if (
        error instanceof SyncHTTPError &&
        error.status === 409 &&
        error.code === 'recovery_key_required'
      ) {
        this.phase = 'recovery-required';
        this.message =
          'Older encrypted backups need their recovery key once. If you no longer have it, you can reset cloud sync and start fresh.';
        return false;
      }
      if (
        !endpointAvailable &&
        error instanceof SyncHTTPError &&
        (error.status === 404 ||
          (error.status === 503 &&
            error.code === 'managed_sync_not_configured'))
      )
        return false;
      if (error instanceof SyncHTTPError && error.status === 400)
        throw new Error(
          'That recovery key could not unlock your backups. Check the key or choose Reset cloud sync.'
        );
      throw error;
    }
  }

  /** Reset cloud records and sync bookkeeping only; keep the current local snapshot and data stores intact. */
  async resetSync(confirmed: boolean) {
    if (confirmed !== true)
      throw new Error('Confirm resetting cloud sync first.');
    await this.deleteData();
    this.managedKeyAttempted = false;
    const { credential } = this.saved;
    const { generation } = this;
    if (await this.recoverAccountKey()) {
      this.message =
        'Cloud sync was reset. Your local data was kept. Enable sync to back it up again.';
    } else {
      if (
        generation !== this.generation ||
        credential !== this.saved.credential
      )
        return;
      credential!.key = randomBytes(32).toString('base64url');
      this.persist();
      this.phase = 'key-required';
      this.message =
        'Cloud sync was reset. Save your new recovery key to start again.';
    }
  }

  async enable(input: AccountSyncInput) {
    const { credential } = this.saved;
    if (!credential) throw new Error('Connect your account first.');
    const { generation } = this;
    if (await this.recoverAccountKey(input.recoveryKey)) {
      this.options.enable();
      this.message =
        'Sync is on. Your account unlocks your data on other devices.';
      return;
    }
    if (generation !== this.generation || credential !== this.saved.credential)
      return;
    const value = input.recoveryKey?.trim() || credential.key;
    if (
      !value ||
      !/^[A-Za-z0-9_-]{43}$/.test(value) ||
      Buffer.from(value, 'base64url').length !== 32 ||
      Buffer.from(value, 'base64url').toString('base64url') !== value
    )
      throw new Error('Enter a valid recovery key.');
    if (this.phase === 'key-required' && !input.savedRecoveryKey)
      throw new Error('Save your recovery key before enabling sync.');
    const key = Buffer.from(value, 'base64url');
    try {
      let root: any;
      try {
        root = (
          await this.request(`/v1/sync/records/${keyRecord}`, credential.token)
        ).body;
      } catch (error) {
        if (!(error instanceof SyncHTTPError) || error.status !== 404)
          throw error;
        const envelope = encryptSyncRecord(
          { kind: 'kudium-sync-key', accountId: credential.accountId },
          key,
          keyRecord
        );
        try {
          await this.request(
            `/v1/sync/records/${keyRecord}`,
            credential.token,
            envelope,
            error.revision
              ? { 'If-Match': `"${error.revision}"` }
              : { 'If-None-Match': '*' },
            'PUT'
          );
          root = { envelope };
        } catch (conflict) {
          if (!(conflict instanceof SyncHTTPError) || conflict.status !== 409)
            throw conflict;
          root = (
            await this.request(
              `/v1/sync/records/${keyRecord}`,
              credential.token
            )
          ).body;
        }
      }
      const check = decryptSyncRecord(root.envelope, key) as any;
      if (
        check?.kind !== 'kudium-sync-key' ||
        check.accountId !== credential.accountId
      )
        throw new Error('This recovery key does not belong to your account.');
      if (generation !== this.generation) return;
      credential.key = value;
      credential.enrolled = true;
      this.persist();
      this.options.enable();
      this.phase = 'ready';
      this.message = 'Encrypted sync is on.';
    } finally {
      key.fill(0);
    }
  }

  snapshot(input: AccountSyncInput) {
    if (!Array.isArray(input.apps) || !Array.isArray(input.spaces))
      throw new Error('Invalid workspace');
    if (input.apps.length > 5000 || input.spaces.length > 200)
      throw new Error('Workspace too large');
    if (
      input.currentUrls &&
      (typeof input.currentUrls !== 'object' ||
        Array.isArray(input.currentUrls) ||
        Object.keys(input.currentUrls).length > 5000)
    )
      throw new Error('Invalid current tabs');
    this.input = {
      apps: input.apps,
      spaces: input.spaces,
      currentUrls: input.currentUrls,
    };
  }

  /* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue -- Change pages must be processed in cursor order before upload. */
  async sync(force = false) {
    const { credential } = this.saved;
    const preferences = this.options.preferences();
    if (
      (!force && Date.now() < this.retryAt) ||
      this.busy ||
      this.pending ||
      !credential?.enrolled ||
      !credential.key ||
      !preferences.cloudSync.enabled ||
      preferences.cloudSync.provider !==
        (this.options.provider || 'kudiumbrowser') ||
      !this.input
    )
      return;
    const { generation } = this;
    this.busy = true;
    this.phase = 'syncing';
    const key = Buffer.from(credential.key, 'base64url');
    const active = () =>
      generation === this.generation &&
      this.options.preferences().cloudSync.enabled &&
      this.options.preferences().cloudSync.provider ===
        (this.options.provider || 'kudiumbrowser');
    try {
      const root = (
        await this.request(`/v1/sync/records/${keyRecord}`, credential.token)
      ).body;
      const rootCheck = decryptSyncRecord(root.envelope, key) as any;
      if (
        rootCheck?.kind !== 'kudium-sync-key' ||
        rootCheck.accountId !== credential.accountId
      )
        throw new Error('Sync key mismatch');
      let { cursor } = this.saved;
      for (let page = 0; page < 5000; page += 1) {
        const { body } = await this.request(
          `/v1/sync/changes?limit=20${
            cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
          }`,
          credential.token
        );
        if (!active()) return;
        if (
          !Array.isArray(body.changes) ||
          typeof body.cursor !== 'string' ||
          body.cursor.length > 256 ||
          typeof body.hasMore !== 'boolean'
        )
          throw new Error('Invalid change feed');
        for (const item of body.changes) {
          if (item.recordId === keyRecord) continue;
          if (
            typeof item.recordId === 'string' &&
            /^notes_[a-zA-Z0-9_-]{1,128}$/.test(item.recordId)
          ) {
            if (item.deleted) this.noteRecords.delete(item.recordId);
            else this.noteRecords.add(item.recordId);
            continue;
          }
          if (
            typeof item.recordId === 'string' &&
            /^passwords_[a-zA-Z0-9_-]{1,128}$/.test(item.recordId)
          ) {
            if (item.deleted) this.passwordRecords.delete(item.recordId);
            else this.passwordRecords.add(item.recordId);
            continue;
          }
          if (
            typeof item.recordId !== 'string' ||
            !/^device_[a-zA-Z0-9_-]{1,128}$/.test(item.recordId) ||
            !Number.isSafeInteger(item.revision)
          )
            continue;
          if (item.deleted) {
            this.remote.delete(item.recordId);
            if (item.recordId === `device_${credential.deviceId}`)
              this.saved.revision = item.revision;
            continue;
          }
          if (item.envelope?.recordId !== item.recordId)
            throw new Error('Sync record mismatch');
          const snapshot = validateIncomingSnapshot(
            decryptSyncRecord(item.envelope, key)
          );
          if (item.recordId !== `device_${snapshot.deviceId}`)
            throw new Error('Invalid device record');
          if (snapshot.deviceId === credential.deviceId)
            this.saved.revision = item.revision;
          else
            this.remote.set(item.recordId, {
              revision: item.revision,
              snapshot,
            });
        }
        cursor = body.cursor;
        if (!body.hasMore) break;
        if (page === 4999) throw new Error('Sync history is too large.');
      }
      if (!active()) return;
      const snapshot = buildSyncSnapshot(
        {
          settings: preferences.cloudSync,
          deviceId: credential.deviceId,
          ...this.input,
          preferences,
        },
        this.options.provider === 'icloud'
      );
      const digest = createHash('sha256')
        .update(JSON.stringify({ ...snapshot, createdAt: 0 }))
        .digest('hex');
      if (digest !== this.lastDigest) {
        const recordId = `device_${credential.deviceId}`;
        const envelope = encryptSyncRecord(snapshot, key, recordId);
        const revision = this.saved.revision || 0;
        if (!active()) return;
        const { body } = await this.request(
          `/v1/sync/records/${recordId}`,
          credential.token,
          envelope,
          revision ? { 'If-Match': `"${revision}"` } : { 'If-None-Match': '*' },
          'PUT'
        );
        if (!active()) return;
        if (!Number.isSafeInteger(body.revision) || body.revision < 1)
          throw new Error('Invalid revision');
        this.saved.revision = body.revision;
        this.lastDigest = digest;
      }
      this.failures = 0;
      this.retryAt = 0;
      this.saved.cursor = cursor;
      this.saved.lastSyncedAt = Date.now();
      this.persist();
      this.phase = 'ready';
      this.message = 'Your selected browsing data is synced.';
    } catch (error) {
      if (generation !== this.generation) return;
      this.phase = 'error';
      this.message =
        'Sync couldn’t finish. Your local data is safe; we’ll retry.';
      if (error instanceof SyncHTTPError && error.status === 401)
        this.message = 'Session expired. Reconnect your account.';
      if (error instanceof SyncHTTPError && error.status === 409)
        this.message = 'A newer copy exists. Sync again to reconcile.';
    } finally {
      key.fill(0);
      this.busy = false;
      if (!active() && generation === this.generation) {
        this.phase = 'ready';
        this.message = 'Sync is paused.';
      }
    }
  }

  /* eslint-enable no-await-in-loop, no-restricted-syntax, no-continue */
  assertPasswordAccess() {
    const settings = this.options.preferences().cloudSync;
    if (
      !this.saved.credential?.enrolled ||
      !settings.enabled ||
      settings.provider !== (this.options.provider || 'kudiumbrowser') ||
      !settings.categories.passwords
    )
      throw new Error('Enable password sync and unlock your account first.');
  }

  private async privateDataKey(category: 'passwords' | 'notes' = 'passwords') {
    const { credential } = this.saved;
    const settings = this.options.preferences().cloudSync;
    if (
      !credential?.enrolled ||
      !credential.key ||
      !settings.enabled ||
      settings.provider !== (this.options.provider || 'kudiumbrowser') ||
      !settings.categories[category]
    )
      throw new Error(
        `Enable ${category} sync and connect your account first.`
      );
    const { generation } = this;
    const key = Buffer.from(credential.key, 'base64url');
    try {
      const root = (
        await this.request(`/v1/sync/records/${keyRecord}`, credential.token)
      ).body;
      const check = decryptSyncRecord(root.envelope, key) as any;
      if (
        generation !== this.generation ||
        !this.options.preferences().cloudSync.categories[category] ||
        check.kind !== 'kudium-sync-key' ||
        check.accountId !== credential.accountId
      )
        throw new Error('Private data sync access changed.');
      return { key, credential, generation };
    } catch (error) {
      key.fill(0);
      throw error;
    }
  }

  async syncPasswords(
    value: SyncedLogin[],
    current: () => boolean = () => true
  ) {
    return this.uploadPrivateSnapshot(
      'passwords',
      validateSyncedLogins(value),
      current
    );
  }

  async restorePasswords(recordId: string) {
    return this.restorePrivateSnapshot(
      'passwords',
      recordId,
      validateSyncedLogins
    );
  }

  async syncNotes(value: SyncedNote[], current: () => boolean) {
    return this.uploadPrivateSnapshot(
      'notes',
      validateSyncedNotes(value),
      current
    );
  }

  async restoreNotes(recordId: string) {
    return this.restorePrivateSnapshot('notes', recordId, validateSyncedNotes);
  }

  private async uploadPrivateSnapshot<T>(
    category: 'passwords' | 'notes',
    items: T[],
    current: () => boolean = () => true
  ) {
    const { key, credential, generation } = await this.privateDataKey(category);
    try {
      const recordId = `${category}_${credential.deviceId}`;
      let revision = 0;
      try {
        revision = (
          await this.request(`/v1/sync/records/${recordId}`, credential.token)
        ).body.revision;
      } catch (error) {
        if (!(error instanceof SyncHTTPError) || error.status !== 404)
          throw error;
        revision = error.revision || 0;
      }
      if (
        generation !== this.generation ||
        !current() ||
        !this.options.preferences().cloudSync.enabled ||
        this.options.preferences().cloudSync.provider !==
          (this.options.provider || 'kudiumbrowser') ||
        !this.options.preferences().cloudSync.categories[category]
      )
        throw new Error('Private data sync was paused.');
      const envelope = encryptSyncRecord(
        { version: 1, deviceId: credential.deviceId, items },
        key,
        recordId
      );
      await this.request(
        `/v1/sync/records/${recordId}`,
        credential.token,
        envelope,
        revision ? { 'If-Match': `"${revision}"` } : { 'If-None-Match': '*' },
        'PUT'
      );
      if (category === 'notes') this.noteRecords.add(recordId);
      this.message =
        category === 'passwords'
          ? `${items.length} saved logins synced securely.`
          : `${items.length} notes backed up securely.`;
    } finally {
      key.fill(0);
    }
  }

  private async restorePrivateSnapshot<T>(
    category: 'passwords' | 'notes',
    recordId: string,
    validate: (value: unknown) => T[]
  ) {
    if (!new RegExp(`^${category}_[a-zA-Z0-9_-]{1,128}$`).test(recordId))
      throw new Error('Choose a private data backup.');
    const { key, credential, generation } = await this.privateDataKey(category);
    try {
      const result = (
        await this.request(`/v1/sync/records/${recordId}`, credential.token)
      ).body;
      if (result.envelope?.recordId !== recordId)
        throw new Error('Private data backup mismatch.');
      const data = decryptSyncRecord(result.envelope, key) as any;
      if (
        generation !== this.generation ||
        !this.options.preferences().cloudSync.enabled ||
        this.options.preferences().cloudSync.provider !==
          (this.options.provider || 'kudiumbrowser') ||
        !this.options.preferences().cloudSync.categories[category] ||
        data.version !== 1 ||
        `${category}_${data.deviceId}` !== recordId ||
        Object.keys(data).some(
          (field) => !['version', 'deviceId', 'items'].includes(field)
        )
      )
        throw new Error('Invalid private data backup.');
      return validate(data.items);
    } finally {
      key.fill(0);
    }
  }

  remotePreferences(recordId: string) {
    if (!this.options.preferences().cloudSync.categories.preferences)
      throw new Error('Select browser preferences to use synced preferences.');
    const value = this.remote.get(recordId)?.snapshot.preferences;
    if (!value) throw new Error('No synced preferences are available.');
    return value;
  }

  restore(recordId: string): RestoredWorkspace {
    const snapshot = this.remote.get(recordId)?.snapshot;
    if (!snapshot) throw new Error('Choose a synced workspace.');
    const settings = this.options.preferences().cloudSync;
    const spaces: Space[] = [];
    const apps: IApp[] = [];
    const folderIds = new Map<string, string>();
    const spaceIds = new Map<string, string>();
    const groupIds = new Map<string, string>();
    const spaceFor = (id: string) => {
      if (!spaceIds.has(id)) {
        const original = snapshot.workspace?.spaces.find(
          (space) => space.id === id
        );
        const local = randomUUID();
        spaceIds.set(id, local);
        spaces.push({
          id: local,
          name: `${original?.name || 'Other device'} · Synced`,
          color: original?.color || 'iris',
          folders: (original?.folders || []).map((folder) => {
            const mapped = randomUUID();
            folderIds.set(`${id}_${folder.id}`, mapped);
            return { id: mapped, name: folder.name };
          }),
        });
      }
      return spaceIds.get(id)!;
    };
    const groupFor = (id: string) => {
      if (!groupIds.has(id)) groupIds.set(id, randomUUID());
      return groupIds.get(id)!;
    };
    if (settings.categories.workspace)
      snapshot.workspace?.apps
        .filter((tab) => !tab.archived)
        .forEach((tab) =>
          apps.push({
            id: randomUUID(),
            sessionId: groupFor(`${tab.spaceId}_${tab.sessionId}`),
            spaceId: spaceFor(tab.spaceId),
            folderId: tab.folderId
              ? folderIds.get(`${tab.spaceId}_${tab.folderId}`)
              : undefined,
            name: tab.name,
            url: settings.categories.openTabs
              ? snapshot.openTabs?.find((open) => open.id === tab.id)?.url ||
                tab.homeUrl
              : tab.homeUrl,
            tabDefaultURL: tab.homeUrl,
            icon: '',
            sessionName: tab.sessionName,
            favorite: tab.favorite,
            pinned: tab.pinned,
          })
        );
    else if (settings.categories.openTabs)
      snapshot.openTabs?.forEach((tab) =>
        apps.push({
          id: randomUUID(),
          sessionId: groupFor(`${tab.spaceId}_${tab.sessionId}`),
          spaceId: spaceFor(tab.spaceId),
          name: tab.title,
          url: tab.url,
          icon: '',
          pinned: false,
        })
      );
    if (!apps.length)
      throw new Error('No selected browsing data is available to restore.');
    return { apps, spaces };
  }

  pause() {
    if (this.pending) return;
    this.generation += 1;
    this.lastDigest = undefined;
    this.phase = this.saved.credential?.enrolled ? 'ready' : 'off';
    this.message = 'Sync is paused.';
  }

  async disconnect() {
    this.cancel();
    const { credential } = this.saved;
    this.saved = {};
    this.remote.clear();
    this.noteRecords.clear();
    this.passwordRecords.clear();
    this.input = undefined;
    this.lastDigest = undefined;
    this.persist();
    if (credential)
      try {
        await this.request('/api/auth/sign-out', credential.token, {});
      } catch {
        /* Local credentials are removed even offline. */
      }
    this.phase = 'off';
    this.message = 'Disconnected. Local browsing data was kept.';
  }

  async publishHook(data: unknown): Promise<{ id: string; version: number }> {
    const token = this.saved.credential?.token;
    if (!token)
      throw new Error('Sign in through Sync Preferences, then publish again.');
    const response = await fetch(`${SYNC_ORIGIN}/api/hooks/publish`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? 'Your account session expired. Sign in through Sync Preferences.'
          : result.error || 'Publishing failed.'
      );
    return result;
  }

  async deleteData() {
    const { credential } = this.saved;
    if (!credential) throw new Error('Connect your account first.');
    this.pause();
    const { generation } = this;
    await this.request(
      '/v1/sync/data',
      credential.token,
      undefined,
      { 'X-Confirm-Delete': 'all-sync-data' },
      'DELETE'
    );
    if (generation !== this.generation || credential !== this.saved.credential)
      throw new Error(
        'Your account changed while resetting sync. Reconnect before continuing.'
      );
    this.pause();
    credential.enrolled = false;
    credential.key = undefined;
    this.saved.cursor = undefined;
    this.saved.revision = undefined;
    this.lastDigest = undefined;
    this.remote.clear();
    this.noteRecords.clear();
    this.passwordRecords.clear();
    this.persist();
    this.phase = 'recovery-required';
    this.message =
      'Cloud data deleted. Disconnect and reconnect to create a new sync key.';
  }
}

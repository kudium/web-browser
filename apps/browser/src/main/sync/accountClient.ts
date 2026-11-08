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

  private passwordRecords = new Set<string>();

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
    }
  ) {
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
      const accountId = createHash('sha256')
        .update(`better-auth\0${session.user.id}`)
        .digest('hex');
      const previous = this.saved.credential;
      this.saved = {
        credential: {
          token,
          email: session.user.email,
          accountId,
          deviceId:
            previous?.accountId === accountId
              ? previous.deviceId
              : randomUUID(),
          key: previous?.accountId === accountId ? previous.key : undefined,
          enrolled:
            previous?.accountId === accountId ? previous.enrolled : false,
        },
      };
      this.remote.clear();
      this.passwordRecords.clear();
      this.lastDigest = undefined;
      this.pending = undefined;
      this.persist();
      const credential = this.saved.credential!;
      try {
        const root = (
          await this.request(`/v1/sync/records/${keyRecord}`, token)
        ).body;
        if (generation !== this.generation) return;
        let valid = false;
        if (credential.key && credential.enrolled) {
          const key = Buffer.from(credential.key, 'base64url');
          try {
            const check = decryptSyncRecord(root.envelope, key) as any;
            valid =
              check?.kind === 'kudium-sync-key' &&
              check.accountId === accountId;
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

  pollingInterval() {
    return this.pending?.interval || 5000;
  }

  async enable(input: AccountSyncInput) {
    const { credential } = this.saved;
    if (!credential) throw new Error('Connect your account first.');
    const { generation } = this;
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
      preferences.cloudSync.provider !== 'kudiumbrowser' ||
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
      this.options.preferences().cloudSync.provider === 'kudiumbrowser';
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
      const snapshot = buildSyncSnapshot({
        settings: preferences.cloudSync,
        deviceId: credential.deviceId,
        ...this.input,
        preferences,
      });
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
      settings.provider !== 'kudiumbrowser' ||
      !settings.categories.passwords
    )
      throw new Error('Enable password sync and unlock your account first.');
  }

  private async passwordKey() {
    const { credential } = this.saved;
    const settings = this.options.preferences().cloudSync;
    if (
      !credential?.enrolled ||
      !credential.key ||
      !settings.enabled ||
      settings.provider !== 'kudiumbrowser' ||
      !settings.categories.passwords
    )
      throw new Error('Enable password sync and connect your account first.');
    const { generation } = this;
    const key = Buffer.from(credential.key, 'base64url');
    try {
      const root = (
        await this.request(`/v1/sync/records/${keyRecord}`, credential.token)
      ).body;
      const check = decryptSyncRecord(root.envelope, key) as any;
      if (
        generation !== this.generation ||
        !this.options.preferences().cloudSync.categories.passwords ||
        check.kind !== 'kudium-sync-key' ||
        check.accountId !== credential.accountId
      )
        throw new Error('Password sync access changed.');
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
    const items = validateSyncedLogins(value);
    const { key, credential, generation } = await this.passwordKey();
    try {
      const recordId = `passwords_${credential.deviceId}`;
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
      if (generation !== this.generation || !current())
        throw new Error('Password sync was paused.');
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
      this.message = `${items.length} saved logins synced securely.`;
    } finally {
      key.fill(0);
    }
  }

  async restorePasswords(recordId: string) {
    if (!/^passwords_[a-zA-Z0-9_-]{1,128}$/.test(recordId))
      throw new Error('Choose a password snapshot.');
    const { key, credential, generation } = await this.passwordKey();
    try {
      const result = (
        await this.request(`/v1/sync/records/${recordId}`, credential.token)
      ).body;
      if (result.envelope?.recordId !== recordId)
        throw new Error('Password snapshot mismatch.');
      const data = decryptSyncRecord(result.envelope, key) as any;
      if (
        generation !== this.generation ||
        data.version !== 1 ||
        `passwords_${data.deviceId}` !== recordId ||
        Object.keys(data).some(
          (field) => !['version', 'deviceId', 'items'].includes(field)
        )
      )
        throw new Error('Invalid password snapshot.');
      return validateSyncedLogins(data.items);
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

  async deleteData() {
    const { credential } = this.saved;
    if (!credential) throw new Error('Connect your account first.');
    await this.request(
      '/v1/sync/data',
      credential.token,
      undefined,
      { 'X-Confirm-Delete': 'all-sync-data' },
      'DELETE'
    );
    this.pause();
    credential.enrolled = false;
    credential.key = undefined;
    this.saved.cursor = undefined;
    this.saved.revision = undefined;
    this.remote.clear();
    this.passwordRecords.clear();
    this.persist();
    this.phase = 'recovery-required';
    this.message =
      'Cloud data deleted. Disconnect and reconnect to create a new sync key.';
  }
}

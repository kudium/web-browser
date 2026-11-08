/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
import fs from 'fs';
import path from 'path';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import {
  atomicStorageWrite as atomicWrite,
  readStorageFile,
} from './storageFiles';
import {
  StorageMigration,
  MIGRATED_STORAGE_FILES,
  storageDigest,
} from './storageMigration';
import type { MigratedStorageFile } from './storageMigration';
import {
  readStorageContainer,
  replaceStorageCiphertext,
  validateStoragePayload,
} from './storageSchemas';
import {
  STORAGE_ENVELOPE_VERSION,
  STORAGE_KEY_FORMAT_VERSION,
} from './storageIdentity';

export interface AsyncOSStorage {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(
    value: Buffer
  ): Promise<{ result: string; shouldReEncrypt: boolean }>;
  getSelectedStorageBackend?(): string;
  decryptLegacyStringAsync?(value: Buffer): Promise<string>;
  osIdentity?: string;
}

/**
 * The synchronous stores never yield between an authorization check and a
 * write.
 */
export interface SynchronousSecureStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
  getSelectedStorageBackend?(): string;
  isFileAvailable?(file: string): boolean;
}

const PREFIX = Buffer.from('KUDIUM-LOCAL-AES-GCM-v1\0');
const AAD = Buffer.from('com.kudium.kudiumbrowser/local-storage/v1');
/** OS-wrapped data key with authenticated, versioned local envelopes. */
export class LocalSecureStorage implements SynchronousSecureStorage {
  private key?: Buffer;

  private initialization?: Promise<void>;

  private unavailableFiles = new Set<string>();

  private migration?: StorageMigration;

  // eslint-disable-next-line no-useless-constructor
  constructor(private root: string, private osStorage: AsyncOSStorage) {
    // Parameter properties retain the OS adapter and profile root.
  }

  getSelectedStorageBackend() {
    return this.osStorage.getSelectedStorageBackend?.() || 'unknown';
  }

  isEncryptionAvailable() {
    return !!this.key;
  }

  isFileAvailable(file: string) {
    return !!this.key && !this.unavailableFiles.has(path.resolve(file));
  }

  recoveryFailures() {
    return [...this.unavailableFiles].map((file) =>
      path.relative(this.root, file)
    );
  }

  initialize() {
    if (!this.initialization) this.initialization = this.initializeOnce();
    return this.initialization;
  }

  private async initializeOnce() {
    if (
      !(await this.osStorage.isAsyncEncryptionAvailable()) ||
      this.getSelectedStorageBackend() === 'basic_text'
    )
      return;
    const file = path.join(this.root, 'secure-storage', 'key.json');
    if (fs.existsSync(file)) {
      const envelope = JSON.parse(readStorageFile(file).toString('utf8'));
      if (envelope.version !== 1 || typeof envelope.osEncrypted !== 'string')
        throw new Error('Invalid local encryption key envelope.');
      const decrypted = await this.decryptOSString(
        Buffer.from(envelope.osEncrypted, 'base64')
      );
      const key = Buffer.from(decrypted.result, 'base64');
      if (key.length !== 32) throw new Error('Invalid local encryption key.');
      const keyId = storageDigest(key);
      if (
        (envelope.keyId !== undefined && envelope.keyId !== keyId) ||
        (envelope.algorithm !== undefined &&
          envelope.algorithm !== 'aes-256-gcm') ||
        (envelope.dataEnvelopeVersion !== undefined &&
          envelope.dataEnvelopeVersion !== STORAGE_ENVELOPE_VERSION)
      ) {
        key.fill(0);
        throw new Error('Unsupported or mismatched local key metadata.');
      }
      const previous = readStorageFile(file);
      const updateMetadata =
        envelope.keyId === undefined ||
        envelope.osIdentity === undefined ||
        envelope.osIdentity === 'unknown';
      if (decrypted.shouldReEncrypt || updateMetadata) {
        const history = path.join(
          this.root,
          'secure-storage',
          'key-history',
          `${storageDigest(previous)}.json`
        );
        if (!fs.existsSync(history)) atomicWrite(history, previous, true);
      }
      if (decrypted.shouldReEncrypt) {
        envelope.osEncrypted = (
          await this.osStorage.encryptStringAsync(decrypted.result)
        ).toString('base64');
      }
      if (decrypted.shouldReEncrypt || updateMetadata) {
        Object.assign(envelope, {
          keyId,
          algorithm: 'aes-256-gcm',
          dataEnvelopeVersion: STORAGE_ENVELOPE_VERSION,
          osIdentity: this.osStorage.osIdentity || 'unknown',
        });
        atomicWrite(file, JSON.stringify(envelope));
      }
      this.key = key;
    } else {
      const key = randomBytes(32);
      try {
        const osEncrypted = await this.osStorage.encryptStringAsync(
          key.toString('base64')
        );
        // Never replace an existing key: losing it would destroy local records.
        atomicWrite(
          file,
          JSON.stringify({
            version: STORAGE_KEY_FORMAT_VERSION,
            keyId: storageDigest(key),
            algorithm: 'aes-256-gcm',
            dataEnvelopeVersion: STORAGE_ENVELOPE_VERSION,
            osIdentity: this.osStorage.osIdentity || 'unknown',
            osEncrypted: osEncrypted.toString('base64'),
          }),
          true
        );
        this.key = key;
      } catch (error) {
        key.fill(0);
        throw error;
      }
    }
    try {
      await this.migrateLegacyRecords();
    } catch (error) {
      this.key?.fill(0);
      this.key = undefined;
      // Do not open stores that might discard an unreadable legacy record.
      throw error;
    }
  }

  private requireKey() {
    if (!this.key) throw new Error('Secure local storage is unavailable.');
    return this.key;
  }

  private static isEnvelope(value: Buffer) {
    return value.subarray(0, PREFIX.length).equals(PREFIX);
  }

  encryptString(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.requireKey(), iv);
    cipher.setAAD(AAD);
    const plaintext = Buffer.from(value, 'utf8');
    try {
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      return Buffer.concat([PREFIX, iv, cipher.getAuthTag(), ciphertext]);
    } finally {
      plaintext.fill(0);
    }
  }

  decryptString(value: Buffer) {
    if (
      !LocalSecureStorage.isEnvelope(value) ||
      value.length < PREFIX.length + 28
    )
      throw new Error('Invalid local encryption envelope.');
    const offset = PREFIX.length;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.requireKey(),
      value.subarray(offset, offset + 12)
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(value.subarray(offset + 12, offset + 28));
    const plaintext = Buffer.concat([
      decipher.update(value.subarray(offset + 28)),
      decipher.final(),
    ]);
    try {
      return plaintext.toString('utf8');
    } finally {
      plaintext.fill(0);
    }
  }

  private async decryptOSString(value: Buffer) {
    try {
      return await this.osStorage.decryptStringAsync(value);
    } catch (error) {
      if (!this.osStorage.decryptLegacyStringAsync) throw error;
      return {
        result: await this.osStorage.decryptLegacyStringAsync(value),
        shouldReEncrypt: true,
      };
    }
  }

  private async plaintext(value: Buffer) {
    if (LocalSecureStorage.isEnvelope(value)) return this.decryptString(value);
    if (value.subarray(0, 7).toString('utf8') === 'KUDIUM-')
      throw new Error('Unsupported local encryption format.');
    return (await this.decryptOSString(value)).result;
  }

  private async validateReplacement(
    relative: MigratedStorageFile,
    source: Buffer,
    target: Buffer
  ) {
    const old = readStorageContainer(relative, source);
    const next = readStorageContainer(relative, target);
    if (!old.ciphertext || !next.ciphertext)
      throw new Error('Migration ciphertext is missing.');
    const original = await this.plaintext(old.ciphertext);
    const restored = this.decryptString(next.ciphertext);
    if (original !== restored)
      throw new Error('Migration changed decrypted content.');
    validateStoragePayload(relative, restored);
    if (old.data) {
      const comparison = replaceStorageCiphertext(
        relative,
        source,
        next.ciphertext
      );
      if (!comparison.equals(target))
        throw new Error('Migration changed unrelated container fields.');
    }
  }

  private async migrateLegacyRecords() {
    this.migration = new StorageMigration(
      this.root,
      storageDigest(this.requireKey())
    );
    const validate = (
      relative: MigratedStorageFile,
      source: Buffer,
      target: Buffer
    ) => this.validateReplacement(relative, source, target);
    // A crash after installing a file but before updating its receipt is resumable.
    const resumeFailures = await this.migration.commit(validate);
    for (const relative of resumeFailures)
      this.unavailableFiles.add(path.resolve(this.root, relative));
    for (const relative of MIGRATED_STORAGE_FILES) {
      const file = path.join(this.root, relative);
      if (!fs.existsSync(file)) continue;
      let source: Buffer | undefined;
      try {
        source = readStorageFile(file);
        const { ciphertext } = readStorageContainer(relative, source);
        if (!ciphertext) continue;
        if (LocalSecureStorage.isEnvelope(ciphertext)) {
          validateStoragePayload(relative, this.decryptString(ciphertext));
          continue;
        }
        this.migration.preserve(relative, source);
        const original = await this.plaintext(ciphertext);
        validateStoragePayload(relative, original);
        const target = replaceStorageCiphertext(
          relative,
          source,
          this.encryptString(original)
        );
        await validate(relative, source, target);
        this.migration.stage(relative, source, target);
        this.unavailableFiles.delete(path.resolve(file));
      } catch {
        this.unavailableFiles.add(path.resolve(file));
        if (source) {
          try {
            this.migration.preserve(relative, source);
          } catch {
            /* Never replace an inconsistent backup. */
          }
        }
        this.migration.block(relative);
      }
    }
    for (const relative of await this.migration.commit(validate))
      this.unavailableFiles.add(path.resolve(this.root, relative));
  }

  confirmHealthyLaunch(id: string) {
    if (this.isEncryptionAvailable() && this.unavailableFiles.size === 0)
      this.migration?.confirmLaunch(id);
  }

  dispose() {
    this.key?.fill(0);
    this.key = undefined;
  }
}

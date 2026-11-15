import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const maxBytes = 8 * 1024 * 1024;
export interface SyncEnvelope {
  version: 1;
  recordId: string;
  keyVersion: number;
  nonce: string;
  ciphertext: string;
  tag: string;
}
function header(recordId: string, keyVersion: number) {
  if (
    typeof recordId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(recordId) ||
    !Number.isSafeInteger(keyVersion) ||
    keyVersion < 1
  )
    throw new Error('Invalid sync metadata');
  return Buffer.from(JSON.stringify({ version: 1, recordId, keyVersion }));
}
function keyCheck(key: Buffer) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error('A 256-bit sync key is required');
}
/**
 * Provider-independent crypto. Key provisioning/roaming is a separate native
 * task.
 */
export function encryptSyncRecord(
  value: unknown,
  key: Buffer,
  recordId: string,
  keyVersion = 1
): SyncEnvelope {
  keyCheck(key);
  const metadata = header(recordId, keyVersion);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  if (plaintext.length > maxBytes)
    throw new Error('Sync record exceeds the size limit');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(metadata);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: 1,
    recordId,
    keyVersion,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}
function decode(value: unknown, max: number) {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(max / 3) * 4
  )
    throw new Error('Invalid encrypted sync data');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > max || bytes.toString('base64') !== value)
    throw new Error('Invalid encrypted sync data');
  return bytes;
}
export function decryptSyncRecord(
  envelope: SyncEnvelope,
  key: Buffer
): unknown {
  keyCheck(key);
  try {
    if (
      !envelope ||
      envelope.version !== 1 ||
      Object.keys(envelope).length !== 6
    )
      throw new Error('Invalid envelope');
    const metadata = header(envelope.recordId, envelope.keyVersion);
    const nonce = decode(envelope.nonce, 12);
    const tag = decode(envelope.tag, 16);
    const ciphertext = decode(envelope.ciphertext, maxBytes);
    if (
      nonce.length !== 12 ||
      tag.length !== 16 ||
      ciphertext.length > maxBytes
    )
      throw new Error('Invalid envelope');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(metadata);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        'utf8'
      )
    );
  } catch {
    throw new Error('Unable to decrypt sync record');
  }
}

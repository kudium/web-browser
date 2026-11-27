/**
 * End-to-end envelope for Kudium's own relay clients (`e2e` frames). The
 * device holds an X25519 key pair in its private store and publishes the
 * public key; a client seals each inner frame to it with an ephemeral key
 * (ECDH → HKDF-SHA256 → AES-256-GCM), so the relay forwards ciphertext only.
 * Responses are sealed back to the client's ephemeral public key.
 */
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  KeyObject,
} from 'crypto';

export const RELAY_E2E_VERSION = 1 as const;
const INFO = 'kudium-relay-e2e-v1';
const RAW_X25519_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');
const RAW_X25519_PRIVATE_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

export interface RelayDeviceKeys {
  /** Base64 raw 32-byte X25519 public key. */
  publicKey: string;
  /** Base64 raw 32-byte X25519 private key; never leaves the private store. */
  privateKey: string;
}
export interface RelayEnvelope {
  v: typeof RELAY_E2E_VERSION;
  /** Sender's ephemeral public key (base64 raw). */
  epk: string;
  nonce: string;
  ct: string;
  tag: string;
}

export function generateRelayDeviceKeys(): RelayDeviceKeys {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return { publicKey: rawPublic(publicKey), privateKey: rawPrivate(privateKey) };
}

function rawPublic(key: KeyObject) {
  return (key.export({ type: 'spki', format: 'der' }) as Buffer).subarray(RAW_X25519_PREFIX.length).toString('base64');
}
function rawPrivate(key: KeyObject) {
  return (key.export({ type: 'pkcs8', format: 'der' }) as Buffer).subarray(RAW_X25519_PRIVATE_PREFIX.length).toString('base64');
}
function publicKeyFromRaw(raw: string) {
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32) throw new Error('Invalid X25519 public key.');
  return createPublicKey({ key: Buffer.concat([RAW_X25519_PREFIX, bytes]), type: 'spki', format: 'der' });
}
function privateKeyFromRaw(raw: string) {
  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32) throw new Error('Invalid X25519 private key.');
  return createPrivateKey({ key: Buffer.concat([RAW_X25519_PRIVATE_PREFIX, bytes]), type: 'pkcs8', format: 'der' });
}
function deriveKey(privateKey: KeyObject, publicKey: KeyObject, salt: Buffer) {
  const shared = diffieHellman({ privateKey, publicKey });
  return Buffer.from(hkdfSync('sha256', shared, salt, INFO, 32));
}

/** Seal plaintext to a peer's raw public key; returns the envelope as a base64 string. */
export function sealRelayPayload(peerPublicKey: string, plaintext: string): { payload: string; ephemeral: RelayDeviceKeys } {
  const peer = publicKeyFromRaw(peerPublicKey);
  const ephemeral = generateKeyPairSync('x25519');
  const epk = rawPublic(ephemeral.publicKey);
  const key = deriveKey(ephemeral.privateKey, peer, Buffer.concat([Buffer.from(epk, 'base64'), Buffer.from(peerPublicKey, 'base64')]));
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const envelope: RelayEnvelope = {
    v: RELAY_E2E_VERSION,
    epk,
    nonce: nonce.toString('base64'),
    ct: ct.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
  return {
    payload: Buffer.from(JSON.stringify(envelope)).toString('base64'),
    ephemeral: { publicKey: epk, privateKey: rawPrivate(ephemeral.privateKey) },
  };
}

/** Open an envelope with the recipient's raw private key; returns plaintext and the sender's ephemeral key. */
export function openRelayPayload(privateKey: string, payload: string): { plaintext: string; senderPublicKey: string } {
  let envelope: RelayEnvelope;
  try {
    envelope = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    throw new Error('Malformed e2e envelope.');
  }
  if (!envelope || envelope.v !== RELAY_E2E_VERSION || [envelope.epk, envelope.nonce, envelope.ct, envelope.tag].some((v) => typeof v !== 'string'))
    throw new Error('Unsupported e2e envelope.');
  const recipient = privateKeyFromRaw(privateKey);
  const recipientPublic = rawPublic(createPublicKey(recipient));
  const sender = publicKeyFromRaw(envelope.epk);
  const key = deriveKey(recipient, sender, Buffer.concat([Buffer.from(envelope.epk, 'base64'), Buffer.from(recipientPublic, 'base64')]));
  const nonce = Buffer.from(envelope.nonce, 'base64');
  if (nonce.length !== 12) throw new Error('Malformed e2e envelope.');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  try {
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ct, 'base64')), decipher.final()]).toString('utf8');
    return { plaintext, senderPublicKey: envelope.epk };
  } catch {
    throw new Error('The e2e envelope could not be opened.');
  }
}

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomBytes, randomUUID } from 'crypto';
import { safeStorage } from '../localStorage';
import type { SummaryProtection } from './vault';

const execute = promisify(execFile);
const credentialFile = () =>
  path.join(app.getPath('userData'), 'password-manager', 'os-key');
function helperPath() {
  if (process.platform !== 'darwin') return undefined;
  const candidates = [
    path.join(process.resourcesPath, 'assets/native/kudiumbrowser-password-auth'),
    path.join(app.getAppPath(), 'assets/native/kudiumbrowser-password-auth'),
  ];
  if (!app.isPackaged)
    candidates.push(
      path.resolve(
        app.getAppPath(),
        '../../assets/native/kudiumbrowser-password-auth'
      )
    );
  return candidates.find((candidate) => fs.existsSync(candidate));
}
export const usesOSAuthentication = () => fs.existsSync(credentialFile());
export async function canUseOSAuthentication() {
  const helper = helperPath();
  if (
    !helper ||
    !safeStorage.isEncryptionAvailable() ||
    safeStorage.getSelectedStorageBackend?.() === 'basic_text'
  )
    return false;
  try {
    await execute(helper, ['--check'], { timeout: 10000, maxBuffer: 1024 });
    return true;
  } catch {
    return false;
  }
}
let personalDataAuthenticated = false;
let personalDataAuthentication: Promise<void> | undefined;
let authenticationRevision = 0;

// Only the successful OS check is retained, never a password or decrypted data.
// Window closure and one-shot vault operations do not end the browser session.
export function revokeOSAuthentication() {
  authenticationRevision += 1;
  personalDataAuthenticated = false;
  personalDataAuthentication = undefined;
}

async function promptOS(
  purpose: 'personal-data' | 'group' = 'personal-data'
) {
  const helper = helperPath();
  if (!helper || !(await canUseOSAuthentication()))
    throw new Error('OS authentication is unavailable.');
  try {
    await execute(helper, purpose === 'group' ? ['--group'] : [], {
      timeout: 120000,
      maxBuffer: 1024,
    });
  } catch {
    throw new Error('Authentication was cancelled or unsuccessful.');
  }
}
export async function authenticateOS(
  purpose: 'personal-data' | 'group' = 'personal-data'
) {
  // Group protection has its own per-group grants and must not inherit access
  // from a previous Personal Data authentication.
  if (purpose === 'group') return promptOS(purpose);
  if (personalDataAuthenticated) return;
  if (!personalDataAuthentication) {
    const revision = authenticationRevision;
    const work = (async () => {
      await promptOS(purpose);
      if (revision !== authenticationRevision)
        throw new Error('Personal Data was locked during authentication.');
      personalDataAuthenticated = true;
    })();
    personalDataAuthentication = work;
  }
  const work = personalDataAuthentication;
  try {
    await work;
  } finally {
    if (personalDataAuthentication === work)
      personalDataAuthentication = undefined;
  }
}
export function readOSCredential() {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('OS credential storage is unavailable.');
  return safeStorage.decryptString(fs.readFileSync(credentialFile()));
}
export function writeOSCredential(password: string) {
  if (
    !safeStorage.isEncryptionAvailable() ||
    safeStorage.getSelectedStorageBackend?.() === 'basic_text'
  )
    throw new Error('Secure OS credential storage is unavailable.');
  const file = credentialFile();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  // Create only; migration never overwrites an existing credential.
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, safeStorage.encryptString(password), {
      mode: 0o600,
      flag: 'wx',
    });
    // Linking commits a fully written credential without replacing an existing key.
    fs.linkSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
export const newOSCredential = () => randomBytes(48).toString('base64');

// Basic metadata is browsable without an authentication prompt, but still uses
// OS-backed encryption at rest wherever secure safeStorage is available.
export const summaryProtection: SummaryProtection = {
  seal(value) {
    if (
      safeStorage.isEncryptionAvailable() &&
      safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
    )
      return {
        osEncrypted: safeStorage
          .encryptString(JSON.stringify(value))
          .toString('base64'),
      };
    return value;
  },
  open(value) {
    if (value && 'osEncrypted' in value)
      return JSON.parse(
        safeStorage.decryptString(Buffer.from(value.osEncrypted, 'base64'))
      );
    return value;
  },
};

export { initializeLocalStorage } from '../localStorage';

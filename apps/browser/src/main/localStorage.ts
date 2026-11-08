import { app, safeStorage as osStorage } from 'electron';
import log from 'electron-log';
import { randomUUID } from 'crypto';
import { LocalSecureStorage } from './secureStorage';
import { legacyStorageDecryptor } from './legacyStorage';
import {
  STORAGE_OS_IDENTITY,
  LEGACY_DEVELOPMENT_STORAGE_IDENTITY,
} from './storageIdentity';

// Pin the OS identity before other modules can initialize Electron encryption.
// Preserve the existing profile path: setting the name must never move user data.
const originalProfilePath = app.getPath('userData');
app.setName(STORAGE_OS_IDENTITY);
app.setPath('userData', originalProfilePath);

const launchId = randomUUID();
let initialization: Promise<void> | undefined;
let storage: LocalSecureStorage | undefined;
let legacyDecryptor: ReturnType<typeof legacyStorageDecryptor> | undefined;
/** Exposed only inside the main process, never over IPC. */
export const safeStorage = {
  isEncryptionAvailable: () => storage?.isEncryptionAvailable() || false,
  isFileAvailable: (file: string) => storage?.isFileAvailable(file) || false,
  getSelectedStorageBackend: () =>
    storage?.getSelectedStorageBackend() || 'unknown',
  encryptString: (value: string) => {
    if (!storage) throw new Error('Secure local storage has not initialized.');
    return storage.encryptString(value);
  },
  decryptString: (value: Buffer) => {
    if (!storage) throw new Error('Secure local storage has not initialized.');
    return storage.decryptString(value);
  },
};
/** Public health only; never expose filenames, ciphertext, or credentials. */
export function localStorageStatus() {
  return {
    available: safeStorage.isEncryptionAvailable(),
    needsRecovery: !!storage?.recoveryFailures().length,
  };
}

async function prepareLocalStorage() {
  app.setName(STORAGE_OS_IDENTITY);
  if (!storage) {
    // Development used Electron's identity before the public app name changed.
    // Release executables never expose this development-only recovery helper.
    if (!app.isPackaged)
      legacyDecryptor = legacyStorageDecryptor(
        LEGACY_DEVELOPMENT_STORAGE_IDENTITY
      );
    storage = new LocalSecureStorage(app.getPath('userData'), {
      osIdentity: STORAGE_OS_IDENTITY,
      isAsyncEncryptionAvailable: () => osStorage.isAsyncEncryptionAvailable(),
      encryptStringAsync: (value) => osStorage.encryptStringAsync(value),
      decryptStringAsync: (value) => osStorage.decryptStringAsync(value),
      getSelectedStorageBackend: () =>
        osStorage.getSelectedStorageBackend?.() || 'unknown',
      decryptLegacyStringAsync: legacyDecryptor?.decrypt,
    });
  }
  try {
    await storage.initialize();
    storage.recoveryFailures().forEach((file) => {
      log.warn(
        `Saved ${file} could not be restored; its encrypted file was preserved.`
      );
    });
  } catch (error) {
    // OS-key failures must disable persistent secrets, not the whole browser.
    log.error(
      'Secure local storage is unavailable; encrypted files were preserved.',
      error
    );
  } finally {
    legacyDecryptor?.dispose();
  }
}

export async function initializeLocalStorage() {
  if (!initialization) initialization = prepareLocalStorage();
  await initialization;
  return safeStorage;
}

export const localStorageRecoveryFiles = () =>
  storage?.recoveryFailures() || [];

export async function retryLocalStorage() {
  const previous = storage;
  storage = undefined;
  initialization = undefined;
  await initializeLocalStorage();
  // Initialization assigns the module-level instance across the await.
  const replacement = storage as LocalSecureStorage | undefined;
  if (replacement?.isEncryptionAvailable()) previous?.dispose();
  else {
    replacement?.dispose();
    storage = previous;
  }
  return localStorageStatus();
}

export function confirmLocalStorageLaunch() {
  try {
    storage?.confirmHealthyLaunch(launchId);
  } catch {
    log.warn('Storage migration launch confirmation could not be saved.');
  }
}

app.once('will-quit', () => storage?.dispose());

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { safeStorage } from './localStorage';
import { atomicStorageWrite, readStorageFile } from './storageFiles';

export interface PanelStateBinding {
  profile: string;
  groupId: string;
  origin: string;
  hookId: string;
}
export function panelStateRequest(input: unknown) {
  const request = input as { id?: unknown; value?: unknown };
  if (
    !request ||
    typeof request.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,60}$/.test(request.id)
  )
    throw new Error(
      'Provide a panel state id (1–60 letters, numbers, _ or -).',
    );
  const encoded = JSON.stringify(request.value ?? null);
  if (Buffer.byteLength(encoded, 'utf8') > 32000)
    throw new Error('Panel state exceeds 32 KB.');
  return { id: request.id, value: JSON.parse(encoded) };
}
/** Main owns scope; encrypted, atomic, bounded storage. No plaintext fallback. */
export function hookPanelState(
  binding: PanelStateBinding,
  action: string,
  input: unknown,
) {
  const request = panelStateRequest(input);
  if (
    !safeStorage.isEncryptionAvailable() ||
    safeStorage.getSelectedStorageBackend() === 'basic_text'
  )
    throw new Error('Secure panel state storage is unavailable.');
  const key = createHash('sha256')
    .update(JSON.stringify(binding))
    .digest('hex');
  const file = path.join(
    app.getPath('userData'),
    'hook-panel-state',
    key + '.bin',
  );
  let values: Record<string, unknown> = Object.create(null);
  if (fs.existsSync(file)) {
    if (!safeStorage.isFileAvailable(file))
      throw new Error('Saved panel state requires secure storage recovery.');
    const saved = JSON.parse(
      safeStorage.decryptString(readStorageFile(file, 512000)),
    );
    if (
      saved.version !== 1 ||
      saved.key !== key ||
      !saved.values ||
      typeof saved.values !== 'object' ||
      Array.isArray(saved.values) ||
      Object.keys(saved.values).length > 10
    )
      throw new Error('Invalid saved panel state.');
    values = Object.assign(Object.create(null), saved.values);
  }
  if (action === 'load')
    return Object.hasOwn(values, request.id) ? values[request.id] : null;
  if (action === 'clear') delete values[request.id];
  else if (action === 'save') values[request.id] = request.value;
  else throw new Error('Unknown panel state action.');
  if (Object.keys(values).length > 10)
    throw new Error(
      'A hook can save up to ten panel states per website and group.',
    );
  if (!Object.keys(values).length) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  const encoded = JSON.stringify({ version: 1, key, values });
  if (Buffer.byteLength(encoded, 'utf8') > 330000)
    throw new Error('Saved panel state exceeds its bound.');
  atomicStorageWrite(file, safeStorage.encryptString(encoded));
}

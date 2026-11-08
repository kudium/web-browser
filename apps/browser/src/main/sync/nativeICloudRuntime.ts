import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const nativePath = () =>
  app.isPackaged
    ? path.join(
        process.resourcesPath,
        'assets/native/kudium-cloudkit-bridge.node'
      )
    : path.join(app.getAppPath(), 'assets/native/kudium-cloudkit-bridge.node');

/**
 * Explicit provisioned integration builds only, until real two-Mac acceptance
 * passes.
 */
export function cloudKitAvailable() {
  return (
    process.platform === 'darwin' &&
    process.env.KUDIUM_ICLOUD_INTEGRATION === 'true' &&
    fs.existsSync(nativePath())
  );
}
export function loadCloudKitBridge(): {
  request: (value: string) => Promise<string>;
} {
  if (!cloudKitAvailable())
    throw new Error('iCloud requires a provisioned integration build.');
  const native = createRequire(__filename)(nativePath());
  if (typeof native.request !== 'function')
    throw new Error('Invalid native CloudKit module.');
  return native;
}

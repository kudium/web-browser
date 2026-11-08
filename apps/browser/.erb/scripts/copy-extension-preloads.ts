import fs from 'fs';
import path from 'path';

export function copyExtensionPreloads(destination: string) {
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'legacy-storage-decrypt.cjs'),
    path.join(destination, 'legacy-storage-decrypt.cjs')
  );
  [
    ['electron-chrome-extensions/preload', 'chrome-extension-api.preload.js'],
    ['electron-chrome-web-store/preload', 'chrome-web-store.preload.js'],
  ].forEach(([moduleName, filename]) =>
    fs.copyFileSync(
      require.resolve(moduleName),
      path.join(destination, filename)
    )
  );
}

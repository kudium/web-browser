import fs from 'fs';
import path from 'path';

/**
 * Electron warns before our compatibility APIs are installed in extension
 * frames.
 */
const compatibilityPermissions = new Set([
  'privacy',
  'declarativeContent',
  'webNavigation',
  'contextMenus',
  'cookies',
  'sidePanel',
  // The dependency exposes a limited downloads shim, not the full Chrome API.
  'downloads',
]);

export function extensionWarningKey(
  message: string,
  type: string,
  hasServiceWorker = false
): string | undefined {
  if (type !== 'ExtensionLoadWarning') return undefined;
  const match = /^Warnings loading extension at (.+):\r?\n([\s\S]+)$/.exec(
    message
  );
  if (!match) return undefined;
  const lines = match[2].trim().split(/\r?\n/);
  const permissions = lines.map((line) => {
    if (
      hasServiceWorker &&
      line.trim() ===
        "'background.scripts' requires manifest version of 2 or lower."
    )
      return 'background.scripts';
    const permission = /^\s*Permission '([^']+)' is unknown\.\s*$/.exec(line);
    return permission && compatibilityPermissions.has(permission[1])
      ? permission[1]
      : undefined;
  });
  // Preserve warnings containing anything we do not explicitly recognize.
  if (permissions.some((permission) => !permission)) return undefined;
  return `${match[1]}:${permissions.sort().join(',')}`;
}

function hasValidServiceWorker(directory: string) {
  try {
    const file = path.join(directory, 'manifest.json');
    if (fs.statSync(file).size > 1024 * 1024) return false;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const worker = manifest.background?.service_worker;
    if (
      manifest.manifest_version !== 3 ||
      typeof worker !== 'string' ||
      !worker
    )
      return false;
    const root = path.resolve(directory);
    const target = path.resolve(root, worker);
    return (
      target.startsWith(`${root}${path.sep}`) && fs.statSync(target).isFile()
    );
  } catch {
    return false;
  }
}

let installed = false;
/** Report known compatibility notices once; preserve real load diagnostics. */
export function consolidateExtensionWarnings() {
  if (installed) return;
  installed = true;
  const original = process.emitWarning;
  const seen = new Set<string>();
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const options = args[0];
    let type = warning instanceof Error ? warning.name : 'Warning';
    if (typeof options === 'string') type = options;
    else if (
      options &&
      typeof options === 'object' &&
      'type' in options &&
      typeof options.type === 'string'
    )
      type = options.type;
    const message = warning instanceof Error ? warning.message : warning;
    const location = /^Warnings loading extension at (.+):\r?\n/.exec(
      message
    )?.[1];
    const key = extensionWarningKey(
      message,
      type,
      !!location &&
        message.includes("'background.scripts'") &&
        hasValidServiceWorker(location)
    );
    if (key) {
      if (seen.has(key)) return;
      seen.add(key);
      const label = location
        ? `${path.basename(path.dirname(location))}/${path.basename(location)}`
        : 'extension';
      const notice = message.includes("Permission 'downloads'")
        ? 'loaded with limited downloads API support'
        : 'using browser compatibility APIs';
      // eslint-disable-next-line no-console
      console.info(`[extensions] ${label}: ${notice}`);
      return;
    }
    Reflect.apply(original, process, [warning, ...args]);
  }) as typeof process.emitWarning;
}

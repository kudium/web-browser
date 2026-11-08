/**
 * Electron warns before our compatibility APIs are installed in extension
 * frames.
 */
const compatibilityPermissions = new Set([
  'privacy',
  'declarativeContent',
  'webNavigation',
  'contextMenus',
]);

export function extensionWarningKey(
  message: string,
  type: string
): string | undefined {
  if (type !== 'ExtensionLoadWarning') return undefined;
  const match = /^Warnings loading extension at (.+):\r?\n([\s\S]+)$/.exec(
    message
  );
  if (!match) return undefined;
  const lines = match[2].trim().split(/\r?\n/);
  const permissions = lines.map((line) => {
    const permission = /^\s*Permission '([^']+)' is unknown\.\s*$/.exec(line);
    return permission && compatibilityPermissions.has(permission[1])
      ? permission[1]
      : undefined;
  });
  // Preserve warnings containing anything we do not explicitly recognize.
  if (permissions.some((permission) => !permission)) return undefined;
  return `${match[1]}:${permissions.sort().join(',')}`;
}

let installed = false;
/** Keep the first complete diagnostic for each extension version per app run. */
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
    const key = extensionWarningKey(
      warning instanceof Error ? warning.message : warning,
      type
    );
    if (key) {
      if (seen.has(key)) return;
      seen.add(key);
    }
    Reflect.apply(original, process, [warning, ...args]);
  }) as typeof process.emitWarning;
}

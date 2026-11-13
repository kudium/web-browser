import { createHash } from 'crypto';
import type { SiteDeveloperConfig } from '../browser/siteDeveloper';

/** One linear-time diff hunk per changed field, with unchanged hooks omitted. */
export function hookConfigDiff(
  current: SiteDeveloperConfig,
  proposed: SiteDeveloperConfig
) {
  const entries = (config: SiteDeveloperConfig) =>
    new Map<string, Record<string, any>>([
      [
        '',
        {
          id: '',
          name: config.name || 'Default hook',
          enabled: config.enabled,
          path: '/*',
          before: config.before,
          after: config.after,
          css: config.css,
          actions: config.actions,
          defaultEnabled: config.defaultEnabled,
        },
      ],
      ...(config.hooks || []).map((hook) => [hook.id, hook] as const),
    ]);
  const before = entries(current);
  const after = entries(proposed);
  const hunks: string[] = [];
  new Set([...before.keys(), ...after.keys()]).forEach((id) => {
    const old = before.get(id);
    const next = after.get(id);
    (
      [
        'name',
        'enabled',
        'defaultEnabled',
        'path',
        'sites',
        'exclusions',
        'testUrl',
        'before',
        'after',
        'css',
        'actions',
      ] as const
    ).forEach((field) => {
      if (JSON.stringify(old?.[field]) === JSON.stringify(next?.[field]))
        return;
      const lines = (value: unknown) =>
        value === undefined
          ? []
          : (typeof value === 'object'
              ? JSON.stringify(value, null, 2)
              : String(value)
            ).split('\n');
      const removed = lines(old?.[field]);
      const added = lines(next?.[field]);
      let start = 0;
      while (
        start < removed.length &&
        start < added.length &&
        removed[start] === added[start]
      )
        start += 1;
      let end = 0;
      while (
        end < removed.length - start &&
        end < added.length - start &&
        removed[removed.length - end - 1] === added[added.length - end - 1]
      )
        end += 1;
      hunks.push(
        `@@ ${next?.name || old?.name} · ${field} · line ${start + 1} @@\n${[
          ...removed
            .slice(start, removed.length - end)
            .map((line) => `- ${line}`),
          ...added.slice(start, added.length - end).map((line) => `+ ${line}`),
        ].join('\n')}`
      );
    });
  });
  return hunks.join('\n\n') || 'No script or target changes.';
}

export const hookConfigHash = (config: SiteDeveloperConfig) =>
  createHash('sha256').update(JSON.stringify(config)).digest('hex');

/** Retain browser-owned provenance and omitted optional fields while editing by ID. */
export function mergeAuthoredHooks(
  current: SiteDeveloperConfig,
  proposed: SiteDeveloperConfig,
  removeHookIds: string[] = []
): SiteDeveloperConfig {
  const removed = new Set(removeHookIds);
  if (
    removeHookIds.some(
      (id) => !current.hooks?.some((hook) => hook.id === id)
    ) ||
    proposed.hooks?.some((hook) => removed.has(hook.id))
  )
    throw new Error(
      'Remove only existing hooks that are not also being edited.'
    );
  const updates = new Map(proposed.hooks?.map((hook) => [hook.id, hook]));
  const existingIds = new Set(current.hooks?.map((hook) => hook.id));
  return {
    ...current,
    ...proposed,
    ...(current.hooks || proposed.hooks || removed.size
      ? {
          hooks: [
            ...(current.hooks || [])
              .filter((hook) => !removed.has(hook.id))
              .map((hook) => ({ ...hook, ...updates.get(hook.id) })),
            ...(proposed.hooks || []).filter(
              (hook) => !existingIds.has(hook.id)
            ),
          ],
        }
      : {}),
  };
}

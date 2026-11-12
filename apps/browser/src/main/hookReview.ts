import type { SiteDeveloperConfig } from '../browser/siteDeveloper';

/** One linear-time diff hunk per changed field, with unchanged hooks omitted. */
export function hookConfigDiff(
  current: SiteDeveloperConfig,
  proposed: SiteDeveloperConfig
) {
  const entries = (config: SiteDeveloperConfig) =>
    new Map([
      [
        '',
        {
          id: '',
          name: 'Default hook',
          enabled: config.enabled,
          path: '/*',
          before: config.before,
          after: config.after,
          css: config.css,
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
    (['name', 'enabled', 'path', 'before', 'after', 'css'] as const).forEach(
      (field) => {
        if (old?.[field] === next?.[field]) return;
        const removed = old ? String(old[field]).split('\n') : [];
        const added = next ? String(next[field]).split('\n') : [];
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
            ...added
              .slice(start, added.length - end)
              .map((line) => `+ ${line}`),
          ].join('\n')}`
        );
      }
    );
  });
  return hunks.join('\n\n') || 'No script or target changes.';
}

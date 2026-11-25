import { emptyDeveloperConfig, type SiteDeveloperConfig, type SiteHook } from './siteDeveloper';

/** Only durable content/settings edits move a hook; saving another hook does not. */
export function stampHookEdits<T extends SiteHook>(previous: T[], next: T[], now = Date.now()): T[] {
  const old = new Map(previous.map(hook => [hook.id, hook]));
  const content = ({ updatedAt, ...hook }: T) => JSON.stringify(hook);
  return next.map(hook => {
    const before = old.get(hook.id);
    const { updatedAt, ...rest } = hook;
    const time = before && content(before) === content(hook) ? before.updatedAt : Math.max(now, (before?.updatedAt || 0) + 1);
    return { ...rest, ...(time !== undefined ? { updatedAt: time } : {}) } as T;
  });
}
export function sortHooksForDisplay<T>(items: T[], hook: (item: T) => SiteHook, active: (item: T) => boolean): T[] {
  return [...items].sort((a, b) => Number(active(b)) - Number(active(a)) || (hook(b).updatedAt || 0) - (hook(a).updatedAt || 0));
}

export function defaultHookForOrdering(config: SiteDeveloperConfig): SiteHook {
  return { id: '', name: config.name || 'Default hook', enabled: config.defaultEnabled !== false,
    path: '/*', before: config.before, after: config.after, css: config.css,
    ...(config.actions ? { actions: config.actions } : {}), ...(config.updatedAt !== undefined ? { updatedAt: config.updatedAt } : {}),
  };
}
export function stampDeveloperEdits(previous: SiteDeveloperConfig | undefined, next: SiteDeveloperConfig, now = Date.now()): SiteDeveloperConfig {
  const current = stampHookEdits([defaultHookForOrdering(previous || emptyDeveloperConfig)], [defaultHookForOrdering(next)], now)[0];
  const { updatedAt, ...config } = next;
  return { ...config, ...(current.updatedAt !== undefined ? { updatedAt: current.updatedAt } : {}),
    ...(next.hooks ? { hooks: stampHookEdits(previous?.hooks || [], next.hooks, now) } : {}),
  };
}

export function firstDeveloperHook(config: SiteDeveloperConfig): string {
  return sortHooksForDisplay([defaultHookForOrdering(config), ...(config.hooks || [])], hook => hook, hook => config.enabled && hook.enabled)[0]?.id || '';
}

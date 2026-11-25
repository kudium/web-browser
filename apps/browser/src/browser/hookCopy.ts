import type { SiteHook } from './siteDeveloper';
import type { GlobalHook } from './hookMarketplace';

/** Copies are independently editable; installation/update identity is not inherited. */
export function copySiteHook(hook: SiteHook, newId: () => string = () => crypto.randomUUID()): SiteHook {
  return {
    id: newId(), name: `${(hook.name || 'Untitled hook').slice(0, 115)} copy`, enabled: true,
    path: hook.path, before: hook.before, after: hook.after, css: hook.css,
    ...(hook.testUrl ? { testUrl: hook.testUrl } : {}),
    ...(hook.sites ? { sites: hook.sites.map(site => ({ ...site })) } : {}),
    ...(hook.actions ? { actions: hook.actions.map(action => ({ ...action, contexts: [...action.contexts], ...(action.permissions ? { permissions: [...action.permissions] } : {}), id: newId() })) } : {}),
  };
}
export function copyGlobalHook(hook: GlobalHook): GlobalHook {
  return { ...copySiteHook(hook), exclusions: [...hook.exclusions],
    ...(hook.autoMode !== undefined ? { autoMode: hook.autoMode } : {}),
    ...(hook.enabledSites ? { enabledSites: [...hook.enabledSites] } : {}),
  };
}

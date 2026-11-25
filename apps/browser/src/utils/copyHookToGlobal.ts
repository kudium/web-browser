import { CURRENT_HOOK_PAGE, type GlobalHook, type HookMarketplaceState } from '../browser/hookMarketplace';
import { copyGlobalHook, copySiteHook } from '../browser/hookCopy';
import type { SiteHook } from '../browser/siteDeveloper';
import { assertDeveloperSources } from '../browser/hookValidation';

export async function copyHookToGlobal(hook: SiteHook, allGroups = true, preserveGlobalSettings = false) {
  const state = await window.electron.hookMarketplace.request({ action: 'state', id: CURRENT_HOOK_PAGE, allGroups }) as HookMarketplaceState;
  if (state.global.hooks.length >= 20) throw new Error('This destination already has 20 hooks. Remove one first.');
  const copy = preserveGlobalSettings ? copyGlobalHook(hook as GlobalHook) : { ...copySiteHook(hook), exclusions: [] };
  const config = { ...state.global, hooks: [...state.global.hooks, copy] };
  assertDeveloperSources({ enabled: config.enabled, before: '', after: '', css: '', hooks: config.hooks });
  const saved = await window.electron.hookMarketplace.request({ action: 'global-save', id: state.destination.id, allGroups, config, expectedHash: state.globalHash }) as HookMarketplaceState;
  window.dispatchEvent(new Event('kudium-hooks-changed'));
  return saved;
}

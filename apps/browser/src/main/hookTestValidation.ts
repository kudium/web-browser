import type { GlobalHook } from '../browser/hookMarketplace';
import { hookMatchesPath, hookMatchesWebsite } from '../browser/siteDeveloper';
import { validGlobalHooks } from './globalHooks';

export function hookTestApplies(hook: GlobalHook, url: string) {
  const target = new URL(url);
  return (
    ['http:', 'https:'].includes(target.protocol) &&
    hookMatchesPath(hook.path, url) &&
    hookMatchesWebsite(hook, url) &&
    !hook.exclusions.some((rule) =>
      rule.startsWith('*.')
        ? target.hostname === rule.slice(2) ||
          target.hostname.endsWith(`.${rule.slice(2)}`)
        : target.hostname === rule
    )
  );
}
export function validateHookTest(hook: GlobalHook, url: string) {
  if (!validGlobalHooks({ enabled: true, hooks: [hook] }))
    throw new Error('Invalid hook draft.');
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error('Enter a full website URL.');
  }
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    url.length > 4096
  )
    throw new Error('Use an HTTP or HTTPS website URL without credentials.');
  if (!hookTestApplies(hook, target.href))
    throw new Error(
      'This URL does not match the hook pathname, or its domain is excluded.'
    );
  return target.href;
}

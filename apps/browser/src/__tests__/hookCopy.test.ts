import { copySiteHook, copyGlobalHook } from '../browser/hookCopy';
import { copyHookToGlobal } from '../utils/copyHookToGlobal';
const hook = { id: 'original', name: 'Reader', enabled: false, path: '/articles/*', before: '', after: 'log("ready")', css: '', sites: [{ host: 'example.com', includeSubdomains: false }], actions: [{ id: 'action', name: 'Read', contexts: ['page' as const], permissions: ['page.read' as const], source: 'return 1;' }], exclusions: ['other.com'], autoMode: true, enabledSites: ['example.com'], installed: {} as any, publication: {} as any };
it('copies content with independent IDs and arrays, without update or publication identity', () => {
  let id = 0; const copy = copySiteHook(hook, () => `copy-${++id}`);
  expect(copy).toMatchObject({ id: 'copy-1', name: 'Reader copy', enabled: true, after: hook.after, actions: [{ id: 'copy-2' }] });
  expect(copy).not.toHaveProperty('installed'); expect(copy).not.toHaveProperty('publication'); expect(copy).not.toHaveProperty('autoMode'); expect(copy).not.toHaveProperty('exclusions');
  copy.sites![0].host = 'changed.com'; copy.actions![0].contexts.push('selection');
  expect(hook.sites[0].host).toBe('example.com'); expect(hook.actions[0].contexts).toEqual(['page']);
  const global = copyGlobalHook(hook); expect(global).toMatchObject({ autoMode: true, enabledSites: ['example.com'], exclusions: ['other.com'] });
  global.enabledSites!.push('new.com'); expect(hook.enabledSites).toEqual(['example.com']);
});
it('copies to global hooks with the current page, scope, latest hash and existing save API', async () => {
  const global = { enabled: false, hooks: [] };
  const request = jest.fn(async input => ({ global: input.action === 'global-save' ? input.config : global, globalHash: 'latest', destination: { id: 'original-page' } }));
  window.electron = { hookMarketplace: { request } } as any;
  const result = await copyHookToGlobal(hook);
  expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'global-save', id: 'original-page', allGroups: true, expectedHash: 'latest', config: { enabled: false, hooks: [expect.objectContaining({ enabled: true, exclusions: [], name: 'Reader copy' })] } }));
  expect(result.global.hooks[0]).not.toHaveProperty('installed'); expect(result.global.hooks[0]).not.toHaveProperty('autoMode');
});
it('enforces destination limits before attempting a save', async () => {
  const request = jest.fn(async () => ({ global: { enabled: true, hooks: Array(20).fill(hook) }, globalHash: 'latest', destination: { id: 'original-page' } }));
  window.electron = { hookMarketplace: { request } } as any;
  await expect(copyHookToGlobal(hook)).rejects.toThrow('20 hooks'); expect(request).toHaveBeenCalledTimes(1);
});

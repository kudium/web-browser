import { hookPanelExamples } from '../../../packages/hooks/panel-examples';
import { expect, test } from 'bun:test';
import { hookSourceValidator } from '../src/hook-validation';
import { marketplaceStore } from '../src/hook-marketplace';
import { createApp } from '../src/app';
import { HookSourceValidationError } from '../../../packages/hooks/source-validation';
import { hookVersions } from '../src/schema';
import type { Database } from '../src/db';
const empty = { before: '', after: '', css: '' };
const invalidPackage = { schemaVersion: 1, name: 'Broken', description: 'A hook', license: 'MIT', minimumBrowserVersion: '1.0.0', applicability: 'general', sites: [], path: '/*', lifecycle: { ...empty, after: 'const value = ;' } };

test('accepts async function bodies, strict lifecycle variables, modern JS and CSS without executing code', () => {
  const marker = '__hook_validation_must_not_run__';
  delete (globalThis as any)[marker];
  expect(hookSourceValidator.errors({ before: `globalThis.${marker} = true; await Promise.resolve(); return;`, after: 'const element = document?.querySelector("p"); context.onCleanup(() => element?.remove());', css: ':root { --accent: #abc; } @media (width > 600px) { .card { color: var(--accent); &:hover { opacity: .9; } } }', actions: [{ name: 'Read', source: 'await api.ai.compose(context.selection); return;' }] })).toEqual([]);
  expect((globalThis as any)[marker]).toBeUndefined();
});
test('identifies each malformed stage and action with source-relative locations', () => {
  const errors = hookSourceValidator.errors({ before: 'const x = ;', after: 'await Promise.resolve();\nconst y = ;', css: 'p {\n color: red;', actions: [{ id: 'broken', name: 'Explain', source: 'const value = ;' }] });
  expect(errors.map(error => error.stage)).toEqual(['before', 'after', 'css', 'action']);
  expect(errors[1].line).toBe(2);
  expect(errors[3].actionId).toBe('broken');
  expect(errors[3].actionIndex).toBe(0);
  expect(errors[3].label).toBe('Action “Explain”');
  expect(errors.every(error => error.line > 0 && error.column > 0)).toBe(true);
  expect(() => hookSourceValidator.assert({ ...empty, after: 'const y = ;' })).toThrow('After load, line 1, column');
});
test('validates the actual strict runtime wrapper and rejects module-only syntax', () => {
  for (const source of ['const url = "duplicate runtime binding";', 'with (context) {}', 'import x from "x";', 'export default 1;', '}\nfunction escaped() {']) expect(hookSourceValidator.errors({ ...empty, after: source }).length).toBe(1);
  expect(hookSourceValidator.errors({ ...empty, actions: [{ name: 'Duplicate', source: 'const api = {};' }] }).length).toBe(1);
});
test('server rejects malformed publishing before touching the database, including updates', async () => {
  let touched = false;
  const db = { transaction() { touched = true; throw new Error('Database should not be called'); } } as unknown as Database;
  const store = marketplaceStore(db);
  for (const id of [undefined, 'existing-hook']) {
    try { await store.publish('author', invalidPackage, id, 1); throw new Error('Expected rejection'); }
    catch (error) { expect((error as any).status).toBe(400); expect((error as any).cause).toBeInstanceOf(HookSourceValidationError); }
  }
  expect(touched).toBe(false);
});
test('web publishes clear structured syntax errors instead of a generic failure', async () => {
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  app.post('/validation-fixture', async c => c.json(await marketplaceStore({} as Database).publish('author', await c.req.json())));
  const response = await app.request('/validation-fixture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invalidPackage) });
  expect(response.status).toBe(400);
  const data = await response.json();
  expect(data.error).toContain('After load, line 1, column');
  expect(data.diagnostics[0].stage).toBe('after');
});

test('moderation cannot approve a previously stored malformed version', async () => {
  let written = false;
  const publicQuery = { from() { return this; }, innerJoin() { return this; }, async where() { return [{ hook: { status: 'pending' } }]; } };
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: () => {
      const result = Promise.resolve(table === hookVersions ? [{ package: invalidPackage }] : [{ version: 1 }]);
      return Object.assign(result, { for: () => result });
    } }) }),
    update: () => { written = true; throw new Error('Should not write'); },
  };
  const db = { select: () => publicQuery, transaction: (callback: (tx: unknown) => unknown) => callback(tx) } as unknown as Database;
  await expect(marketplaceStore(db).moderate('hook', 'admin', 'approved', '')).rejects.toThrow('After load, line 1');
  expect(written).toBe(false);
});

test('publishing markup escapes script and textarea breakout payloads as text', async () => {
  const { hookPublishPage, hookIndexPage } = await import('../src/hook-pages');
  const payload = '</textarea><script>globalThis.marketplaceInjected=true</script>';
  const pkg = { ...invalidPackage, schemaVersion: 2, name: payload, description: payload, lifecycle: { before: '', after: `const text = ${JSON.stringify(payload)};`, css: '' }, actions: [{ id: 'action', name: payload, contexts: ['page'], source: `api.showResult(${JSON.stringify(payload)});` }] };
  const hook = { id: 'safe-id', version: 1, name: payload, description: payload, likes: 0 };
  const html = hookPublishPage({ package: pkg, hook } as any);
  const listing = hookIndexPage({ items: [{ package: pkg, hook, author: { name: payload } }], nextCursor: null } as any, { q: '', site: '', kind: 'all' });
  for (const page of [html, listing]) {
    expect(page).not.toContain(payload);
    expect(page).toContain('&lt;');
    expect(page).not.toContain('<script>globalThis.marketplaceInjected');
  }
});

test('all panel examples pass the exact publishing wrapper and reject reserved aliases',()=>{
  for(const sample of hookPanelExamples)expect(hookSourceValidator.errors({...empty,after:sample.source})).toEqual([]);
  expect(hookSourceValidator.errors({...empty,after:'const content = {};'})).toHaveLength(1);
  expect(hookSourceValidator.errors({...empty,after:'const panel = {};'})).toHaveLength(1);
});

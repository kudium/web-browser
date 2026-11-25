import { emptyDeveloperConfig } from '../browser/siteDeveloper';
import { sortHooksForDisplay, stampHookEdits, stampDeveloperEdits } from '../browser/hookOrdering';
const hook = { id: 'a', name: 'A', enabled: true, path: '/*', before: '', after: '', css: '' };
it('sorts active hooks first, newest edits next, with stable legacy order and no mutation', () => {
  const items = [{ ...hook, id: 'off', enabled: false, updatedAt: 300 }, { ...hook, id: 'old', updatedAt: 100 }, { ...hook, id: 'new', updatedAt: 200 }, { ...hook, id: 'legacy' }];
  expect(sortHooksForDisplay(items, item => item, item => item.enabled).map(item => item.id)).toEqual(['new', 'old', 'legacy', 'off']);
  expect(items[0].id).toBe('off');
  expect(sortHooksForDisplay([hook, { ...hook, id: 'b' }], item => item, item => item.enabled).map(item => item.id)).toEqual(['a', 'b']);
});
it('timestamps only changed hooks and ignores caller-provided edit times', () => {
  const previous = [{ ...hook, updatedAt: 10 }, { ...hook, id: 'b', updatedAt: 20 }];
  const next = stampHookEdits(previous, [{ ...previous[0], after: 'log("changed")', updatedAt: 99999 }, { ...previous[1], updatedAt: 99999 }, { ...hook, id: 'c', updatedAt: 99999 }], 30);
  expect(next.map(item => item.updatedAt)).toEqual([30, 20, 30]);
  expect(stampHookEdits(next, next, 40).map(item => item.updatedAt)).toEqual([30, 20, 30]);
});

it('tracks default edits independently of named hooks and the website master switch', () => {
  const previous = { ...emptyDeveloperConfig, updatedAt: 10, hooks: [{ ...hook, updatedAt: 20 }] };
  const namedEdit = stampDeveloperEdits(previous, { ...previous, enabled: true, hooks: [{ ...previous.hooks[0], after: 'log("named")' }] }, 30);
  expect(namedEdit.updatedAt).toBe(10); expect(namedEdit.hooks![0].updatedAt).toBe(30);
  const defaultEdit = stampDeveloperEdits(namedEdit, { ...namedEdit, after: 'log("default")' }, 40);
  expect(defaultEdit.updatedAt).toBe(40); expect(defaultEdit.hooks![0].updatedAt).toBe(30);
});

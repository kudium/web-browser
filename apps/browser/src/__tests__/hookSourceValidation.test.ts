import { hookSourceValidator, assertDeveloperSources } from '../browser/hookValidation';
import { emptyDeveloperConfig } from '../browser/siteDeveloper';
const empty = { before: '', after: '', css: '' };
test('validates app scripts and actions as async bodies without executing them', () => {
  expect(hookSourceValidator.errors({ ...empty, after: 'await Promise.resolve(); return;', actions: [{ name: 'Read', source: 'await api.ai.compose(context.selection); return;' }] })).toEqual([]);
  expect(() => hookSourceValidator.assert({ ...empty, after: 'const x = ;' })).toThrow('After load, line 1, column');
  expect(() => hookSourceValidator.assert({ ...empty, css: 'p { color: red;' })).toThrow('CSS, line');
});
test('validates legacy site stages and every named site hook', () => {
  expect(() => assertDeveloperSources({ ...emptyDeveloperConfig, after: 'const x = ;' })).toThrow('After load');
  expect(() => assertDeveloperSources({ ...emptyDeveloperConfig, hooks: [{ ...empty, id: 'bad', name: 'Broken hook', enabled: true, path: '/*', before: 'const x = ;' }] })).toThrow('Broken hook · Before load');
});
test('preserves action identity and reports the original source line', () => {
  const [error] = hookSourceValidator.errors({ ...empty, actions: [{ id: 'bad-action', name: 'Explain', source: 'await Promise.resolve();\nconst x = ;' }] });
  expect(error).toMatchObject({ stage: 'action', actionId: 'bad-action', actionIndex: 0, line: 2, label: 'Action “Explain”' });
});

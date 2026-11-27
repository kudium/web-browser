/** @jest-environment node */
import { diffAISnapshot } from '../browser/aiSnapshotDiff';
import { aiWaitCondition } from '../browser/aiWait';

it('reports only added, removed and changed elements between two reads', () => {
  const previous = [
    { id: 0, role: 'button', label: 'Save', disabled: false, bounds: { x: 1 } },
    { id: 1, role: 'textbox', label: 'Name', value: 'a' },
    { id: 2, role: 'link', label: 'Docs' },
    { id: 3, role: 'checkbox', label: 'Agree', checked: false },
    { id: 4, role: 'checkbox', label: 'Agree', checked: false },
  ];
  const current = [
    { id: 0, role: 'button', label: 'Save', disabled: true, bounds: { x: 9 } },
    { id: 1, role: 'textbox', label: 'Name', value: 'a' },
    { id: 2, role: 'checkbox', label: 'Agree', checked: true },
    { id: 3, role: 'button', label: 'Saved' },
  ];
  expect(diffAISnapshot(previous, current)).toEqual({
    added: [{ id: 3, role: 'button', label: 'Saved' }],
    removed: [
      { role: 'link', label: 'Docs' },
      { role: 'checkbox', label: 'Agree' },
    ],
    changed: [
      { id: 0, role: 'button', label: 'Save', disabled: true, bounds: { x: 9 } },
      { id: 2, role: 'checkbox', label: 'Agree', checked: true },
    ],
    unchanged: 1,
  });
});

it('validates composable wait conditions', () => {
  expect(aiWaitCondition({ url: 'https://site.test/' })).toMatchObject({
    url: 'https://site.test/',
    timeoutMs: 5000,
    state: 'visible',
  });
  expect(
    aiWaitCondition({ selector: 'css=#done', state: 'hidden', text: 'Saved', loadState: 'networkidle' })
  ).toMatchObject({ selector: 'css=#done', state: 'hidden', text: 'Saved', loadState: 'networkidle' });
  expect(aiWaitCondition({ fn: 'document.title.length > 0', timeoutMs: 100 })).toMatchObject({
    fn: 'document.title.length > 0',
    timeoutMs: 100,
  });
  expect(() => aiWaitCondition({})).toThrow('at least one');
  expect(() => aiWaitCondition({ state: 'hidden' })).toThrow('state applies to selector');
  expect(() => aiWaitCondition({ label: 'x'.repeat(181) })).toThrow('180');
  expect(() => aiWaitCondition({ fn: 'x', timeoutMs: 50 })).toThrow('timeoutMs');
  expect(() => aiWaitCondition({ loadState: 'idle' })).toThrow('loadState');
});

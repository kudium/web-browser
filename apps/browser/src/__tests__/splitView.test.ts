import { selectSplitTab, repairSplitView } from '../utils/splitView';
import { IApp } from '../types';

it('focuses existing panes, switches only the focused group and swaps rather than showing one view twice', () => {
  const split = { left: 'a', right: 'b', focused: 'left' as const };
  expect(selectSplitTab(split, 'b')).toEqual({ ...split, focused: 'right' });
  expect(selectSplitTab(split, 'c')).toEqual({ ...split, left: 'c' });
  expect(selectSplitTab(split, 'b', 'left')).toEqual({
    left: 'b',
    right: 'a',
    focused: 'left',
  });
  expect(split.left).toBe('a');
});
it('replaces closed tabs within their account and collapses an empty pane', () => {
  const apps = [
    { id: 'a', sessionId: 'personal', archived: true },
    { id: 'a2', sessionId: 'personal' },
    { id: 'b', sessionId: 'work' },
  ] as IApp[];
  const split = { left: 'a', right: 'b', focused: 'left' as const };
  expect(repairSplitView(split, apps)).toEqual({ ...split, left: 'a2' });
  expect(
    repairSplitView(
      split,
      apps.filter((item) => item.id !== 'a2')
    )
  ).toBeNull();
});

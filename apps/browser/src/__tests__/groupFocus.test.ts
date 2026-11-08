import { rememberGroupTab, rememberedGroupTab } from '../browser/groupFocus';
import type { IApp } from '../types';

const first: IApp = {
  id: 'one',
  sessionId: 'group',
  spaceId: 'default',
  name: 'One',
  url: 'https://one.test',
  icon: '',
};
const second: IApp = {
  ...first,
  id: 'two',
  name: 'Two',
  url: 'https://two.test',
};
beforeEach(() => localStorage.clear());
it('persists the latest tab and restores it from storage', () => {
  rememberGroupTab(first);
  rememberGroupTab(second);
  expect(rememberedGroupTab([first, second], first)).toEqual(second);
  expect(localStorage.getItem('kudium-group-last-active-tabs')).toContain(
    'two'
  );
  rememberGroupTab(first);
  expect(rememberedGroupTab([first, second], second)).toEqual(first);
});
it('isolates spaces and ignores removed or archived tabs', () => {
  rememberGroupTab(second);
  const other = { ...first, id: 'other', spaceId: 'work' };
  rememberGroupTab(other);
  expect(rememberedGroupTab([first, second, other], first)).toEqual(second);
  expect(
    rememberedGroupTab([first, { ...second, archived: true }], first)
  ).toEqual(first);
  expect(rememberedGroupTab([first], first)).toEqual(first);
});
it('recovers from invalid stored data', () => {
  localStorage.setItem('kudium-group-last-active-tabs', 'broken');
  expect(rememberedGroupTab([first], first)).toEqual(first);
  rememberGroupTab(first);
  expect(rememberedGroupTab([first], first)).toEqual(first);
});

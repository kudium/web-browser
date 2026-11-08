import { IApp } from '../types';
import { groupTabs } from './groups';

export type SplitSide = 'left' | 'right';
export interface SplitView {
  left: string;
  right: string;
  focused: SplitSide;
}
export function selectSplitTab(
  split: SplitView,
  id: string,
  side?: SplitSide
): SplitView {
  let target = side || split.focused;
  if (!side && split.left === id) target = 'left';
  if (!side && split.right === id) target = 'right';
  const other = target === 'left' ? 'right' : 'left';
  return {
    ...split,
    [target]: id,
    [other]: split[other] === id ? split[target] : split[other],
    focused: target,
  };
}
export function repairSplitView(
  split: SplitView,
  apps: IApp[]
): SplitView | null {
  const result = { ...split };
  const valid = (['left', 'right'] as const).every((side) => {
    const current = apps.find((app) => app.id === result[side]);
    if (current && !current.archived) return true;
    const other = side === 'left' ? 'right' : 'left';
    const replacement =
      current &&
      groupTabs(apps, current).find((app) => app.id !== result[other]);
    if (!replacement) return false;
    result[side] = replacement.id;
    return true;
  });
  return valid && result.left !== result.right ? result : null;
}

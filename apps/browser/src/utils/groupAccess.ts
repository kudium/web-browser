import { useSyncExternalStore } from 'react';
import type { GroupLockState, GroupLockRequest } from '../browser/groupLocks';
import type { IApp } from '../types';
import { windowWorkspace } from './windowWorkspace';
import { groupKey } from './groups';

let state: GroupLockState & { ready: boolean } = {
  protected: [],
  unlocked: [],
  available: false,
  ready: false,
};
const listeners = new Set<() => void>();
let initialized = false;
const update = (value: GroupLockState) => {
  state = { ...value, ready: true };
  listeners.forEach((listener) => listener());
};
function initialize() {
  if (initialized) return;
  initialized = true;
  const api = window.electron?.groupLocks;
  if (!api) {
    state = { ...state, ready: true };
    return;
  }
  api.onState(update);
  api
    .request({ action: 'status' })
    .then(update)
    .catch((error) => update({ ...state, error: String(error) }));
}
export function useGroupAccess() {
  initialize();
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state
  );
}
export const lockedGroup = (
  item: IApp,
  access: GroupLockState & { ready?: boolean } = state
) =>
  (initialized && access.ready === false) ||
  !!access.error ||
  [
    groupKey(item),
    item.protectionGroupId,
    windowWorkspace.state()?.parentGroups[groupKey(item)],
  ].some(
    (id) => id && access.protected.includes(id) && !access.unlocked.includes(id)
  );
export async function groupAccessAction(
  action: GroupLockRequest['action'],
  item: IApp
) {
  initialize();
  const result = await window.electron.groupLocks.request({
    action,
    groupId: item.protectionGroupId || groupKey(item),
  });
  update(result);
  return result;
}
export function assertGroupChanges(previous: IApp[], next: IApp[]) {
  const comparable = (item: IApp | undefined) =>
    item ? JSON.stringify({ ...item, position: undefined }) : undefined;
  const upcoming = new Map(next.map((item) => [item.id, item]));
  const prior = new Set(previous.map((item) => item.id));
  if (
    previous.some(
      (item) =>
        lockedGroup(item) &&
        comparable(item) !== comparable(upcoming.get(item.id))
    ) ||
    next.some((item) => !prior.has(item.id) && lockedGroup(item))
  )
    throw new Error('Unlock this group before changing it.');
}

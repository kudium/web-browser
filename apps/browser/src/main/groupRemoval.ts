/* Cleanup steps are sequential; each durable checkpoint precedes the next effect. */
/* eslint-disable no-await-in-loop */
import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'path';
import { getBrowserWindows } from './browserWindows';
import type { IApp } from '../types';
import { groupKey, loginProfileKey, personalDataScope } from '../utils/groups';
import { isBrowserLayout } from './browserRequests';
import { isGroupLocked } from './groupLocks';
import { showBrowserDialog } from './dialogs';
import { passwordVault, withPersonalData } from './passwordManager';
import { removeProfileHistory } from './history';
import { removeSiteProfile } from './siteSettings';
import { watchIPCRequest } from './ipcRequestBinding';
import {
  activateGroupRemovalJournal,
  removalSteps,
  RemovalIntent,
} from './groupRemovalJournal';

export const getGroupRemovalJournal = () =>
  activateGroupRemovalJournal(
    path.join(app.getPath('userData'), 'group-removal-journal.json')
  );

export const sameRemovalGroup = (a: IApp, b: IApp) =>
  groupKey(a) === groupKey(b) &&
  (a.spaceId || 'default') === (b.spaceId || 'default');
export function groupRemovalPlan(apps: IApp[], source: IApp) {
  const removed = apps.filter((item) => sameRemovalGroup(item, source));
  const kept = apps.filter((item) => !sameRemovalGroup(item, source));
  return {
    removed,
    kept,
    sharedProfile: kept.some(
      (item) => loginProfileKey(item) === loginProfileKey(source)
    ),
    sharedScope: kept.some(
      (item) => personalDataScope(item) === personalDataScope(source)
    ),
    clearProfiles: [...new Set(removed.map(loginProfileKey))]
      .filter(
        (profile) => !kept.some((item) => loginProfileKey(item) === profile)
      )
      .sort(),
  };
}
const owners = new Map<
  BrowserWindow,
  {
    find: (id: string) => IApp | undefined;
    unloaded: (source: IApp) => boolean;
    profileUnloaded: (profile: string) => boolean;
  }
>();
const pending = new Set<string>();
let registered = false;
export function registerGroupRemoval(
  window: BrowserWindow,
  find: (id: string) => IApp | undefined,
  unloaded: (source: IApp) => boolean,
  profileUnloaded: (profile: string) => boolean
) {
  const journal = getGroupRemovalJournal();
  owners.set(window, { find, unloaded, profileUnloaded });
  if (!registered) {
    registered = true;
    ipcMain.handle(
      'browser-remove-group',
      async (event, id: unknown, allowArchive: unknown) => {
        const owner = BrowserWindow.fromWebContents(event.sender);
        const binding =
          owner &&
          (owners.get(owner) ||
            (getBrowserWindows()?.contains(owner)
              ? [...owners.values()][0]
              : undefined));
        if (
          !owner ||
          !binding ||
          event.sender !== owner.webContents ||
          event.senderFrame !== owner.webContents.mainFrame ||
          typeof id !== 'string'
        )
          throw new Error('Untrusted group removal request.');
        const current = binding.find(id);
        if (!current || isGroupLocked(current))
          throw new Error('This group is unavailable or locked.');
        const source = { ...current };
        const key = JSON.stringify([
          groupKey(source),
          source.spaceId || 'default',
        ]);
        if (pending.has(key)) return { removed: false };
        if (pending.size)
          throw new Error(
            'Another group cleanup is in progress. Try again shortly.'
          );
        const request = watchIPCRequest(
          event,
          () => !owner.isDestroyed() && owners.get(owner) === binding
        );
        const check = () => {
          request.assert();
          const live = binding.find(id);
          if (
            owner.isDestroyed() ||
            isGroupLocked(source) ||
            !live ||
            !sameRemovalGroup(live, source) ||
            loginProfileKey(live) !== loginProfileKey(source) ||
            isGroupLocked(live) ||
            [...owners.values()].some((entry) => !entry.unloaded(source))
          )
            throw new Error('Unload this group before removing it.');
        };
        const read = async () => {
          const apps: unknown = await owner.webContents.executeJavaScript(
            "JSON.parse(localStorage.getItem('user_apps') || '[]')"
          );
          check();
          if (!isBrowserLayout({ apps, visible: [] }))
            throw new Error('Saved group data could not be read safely.');
          const list = (apps as IApp[]).filter(
            (item) => !journal.removed(item.id)
          );
          if (
            !list.some(
              (item) =>
                item.id === id &&
                sameRemovalGroup(item, source) &&
                loginProfileKey(item) === loginProfileKey(source)
            )
          )
            throw new Error('The saved group changed. Try again.');
          return groupRemovalPlan(list, source);
        };
        pending.add(key);
        let committed = false;
        try {
          check();
          const initial = await read();
          const signature = (plan: ReturnType<typeof groupRemovalPlan>) =>
            JSON.stringify([
              plan.removed
                .map((item) => [item.id, loginProfileKey(item)])
                .sort(),
              plan.clearProfiles,
              plan.sharedScope,
            ]);
          const checkProfiles = (profiles: string[]) => {
            if (
              [...owners.values()].some((entry) =>
                profiles.some((profile) => !entry.profileUnloaded(profile))
              )
            )
              throw new Error(
                'Unload every window using these login profiles before removing the group.'
              );
          };
          checkProfiles(initial.clearProfiles);
          const hasPages = initial.removed.some(
            (tab) => tab.url.trim() && tab.url !== 'about:blank'
          );
          const answer =
            hasPages || allowArchive === true
              ? await showBrowserDialog(owner, {
                  title: allowArchive === true ? 'Close group' : 'Remove group',
                  destructive: true,
                  message: `${allowArchive === true ? 'Close' : 'Remove'} “${
                    source.sessionName || source.name
                  }”?`,
                  detail: `${
                    allowArchive === true
                      ? 'Archive keeps this group for later. Delete permanently removes its tabs and local data. Shared data is kept.'
                      : `This removes the group and its ${
                          initial.removed.length
                        } saved tab${
                          initial.removed.length === 1 ? '' : 's'
                        } and local data. Shared and browser-wide data will be kept. This cannot be undone.`
                  }`,
                  buttons:
                    allowArchive === true
                      ? ['Cancel', 'Archive', 'Delete']
                      : ['Cancel', 'Remove Group & Data'],
                  defaultId: 0,
                  cancelId: 0,
                })
              : { response: 1 };
          if (allowArchive === true && answer.response === 1)
            return { removed: false, archive: true };
          if (answer.response !== (allowArchive === true ? 2 : 1))
            return { removed: false };
          check();
          const plan = await read();
          if (signature(plan) !== signature(initial))
            throw new Error(
              'The group changed during confirmation. Try again.'
            );
          const finalPlan = await read();
          if (signature(finalPlan) !== signature(initial))
            throw new Error(
              'The group changed during confirmation. Try again.'
            );
          checkProfiles(finalPlan.clearProfiles);
          check();
          const intent: RemovalIntent = {
            group: groupKey(source),
            space: source.spaceId || 'default',
            ids: finalPlan.removed.map((item) => item.id).sort(),
            profiles: finalPlan.clearProfiles,
            scope: finalPlan.sharedScope
              ? undefined
              : personalDataScope(source),
          };
          let operation = journal.begin(intent);
          committed = true;
          const steps = removalSteps(operation);
          while (operation.next < steps.length) {
            const step = steps[operation.next];
            if (step.kind === 'scope') {
              passwordVault().removeOrdinaryNoteScope(step.target, 'delete');
              if (passwordVault().status().initialized)
                withPersonalData((vault) =>
                  vault.removeScope(step.target, 'delete')
                );
            } else if (step.kind === 'history')
              await removeProfileHistory(step.target);
            else if (step.kind === 'settings') removeSiteProfile(step.target);
            else {
              const profile = session.fromPartition(
                `persist:kudiumbrowser-${step.target}`
              );
              if (step.kind === 'storage') await profile.clearStorageData();
              if (step.kind === 'cache') await profile.clearCache();
              if (step.kind === 'auth') await profile.clearAuthCache();
              if (step.kind === 'connections')
                await profile.closeAllConnections();
            }
            operation = journal.advance(operation);
          }
          // Once the durable intent commits, finish only those approved targets.
          // Completed IDs remain retired across renderer reload/process restart.
          owners.forEach((_entry, target) => {
            if (!target.isDestroyed())
              target.webContents.send('browser-tab-request', {
                action: 'remove',
                ids: operation.ids,
              });
          });
          return { removed: true, ids: operation.ids };
        } catch (reason) {
          if (committed)
            throw new Error(
              `Group cleanup is incomplete. Some data may already have been deleted. Retry removal to finish. ${
                (reason as Error).message
              }`
            );
          throw reason;
        } finally {
          request.dispose();
          pending.delete(key);
        }
      }
    );
  }
  return () => {
    owners.delete(window);
    if (!owners.size) {
      ipcMain.removeHandler('browser-remove-group');
      registered = false;
    }
  };
}

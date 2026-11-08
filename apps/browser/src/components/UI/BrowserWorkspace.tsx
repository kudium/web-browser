import { useEffect, useState } from 'react';
import { Main } from '../View/Main/Main';
import { windowWorkspace } from '../../utils/windowWorkspace';
import { AppManager } from '../../utils/AppManager';
import { SpaceManager } from '../../utils/SpaceManager';
import type { IApp } from '../../types';

/** Load the main-owned window scope before any group or layout hooks run. */
export function BrowserWorkspace() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const api = window.electron.browser;
    const off = api.onWindowState(windowWorkspace.update);
    const commit = api.onWindowCommit(
      (change: { tabs: IApp[]; remove: string[]; token: string }) => {
        try {
          AppManager.commitWindowTabs(change.tabs, change.remove);
          api
            .windowRequest({ action: 'commit-complete', token: change.token })
            .catch((failure) => setError(String(failure)));
        } catch (failure) {
          setError(`Tab changes could not be saved: ${String(failure)}`);
        }
      }
    );
    api
      .windowRequest({ action: 'status' })
      .then((state) => {
        if (live) {
          windowWorkspace.update(state);
          const selected = AppManager.getAll().find(
            (tab) => tab.id === state.selectedId
          );
          if (selected) {
            SpaceManager.select(selected.spaceId || 'default');
            SpaceManager.update(selected.spaceId || 'default', {
              selectedAppId: selected.id,
            });
          }
          setReady(true);
        }
        return undefined;
      })
      .catch((failure) => {
        if (live) setError(String(failure));
      });
    return () => {
      live = false;
      off();
      commit();
    };
  }, []);
  if (!ready)
    return (
      <div className="browser-window-loading">
        {error || 'Opening your workspace…'}
      </div>
    );
  return <Main />;
}

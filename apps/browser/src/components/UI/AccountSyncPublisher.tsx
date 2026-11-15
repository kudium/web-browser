import { useEffect, useMemo } from 'react';
import { browser } from '../../browser/client';
import { IApp, BrowserState } from '../../types';
import { AppManager } from '../../utils/AppManager';
import { windowWorkspace } from '../../utils/windowWorkspace';
import { useSpaces } from '../../utils/SpaceManager';

export function AccountSyncPublisher({
  tabs,
  states,
}: {
  tabs: IApp[];
  states: Record<string, BrowserState>;
}) {
  const { spaces } = useSpaces();
  // Audio/loading/title updates should not republish unchanged workspace URLs.
  const currentUrlsJSON = JSON.stringify(
    Object.fromEntries(
      Object.entries(states).map(([id, state]) => [id, state.url]),
    ),
  );
  const currentUrls = useMemo(
    () => JSON.parse(currentUrlsJSON),
    [currentUrlsJSON],
  );
  useEffect(() => {
    const online = () => {
      browser.accountSync('network-restored').catch(() => {});
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      browser
        .accountSync('snapshot', {
          apps: windowWorkspace.state() ? AppManager.getStored() : tabs,
          spaces,
          currentUrls,
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [tabs, spaces, currentUrls]);
  return null;
}

import { useEffect, useMemo } from 'react';
import { browser } from '../../browser/client';
import { IApp, BrowserState } from '../../types';
import { useSpaces } from '../../utils/SpaceManager';

export function AccountSyncPublisher({
  tabs,
  states,
}: {
  tabs: IApp[];
  states: Record<string, BrowserState>;
}) {
  const { spaces } = useSpaces();
  const currentUrls = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(states).map(([id, state]) => [id, state.url])
      ),
    [states]
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      browser
        .accountSync('snapshot', { apps: tabs, spaces, currentUrls })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [tabs, spaces, currentUrls]);
  return null;
}

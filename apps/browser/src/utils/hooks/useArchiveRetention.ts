import { useEffect } from 'react';
import { browser } from '../../browser/client';
import { AppManager } from '../AppManager';
import { useGroupAccess } from '../groupAccess';
import { windowWorkspace } from '../windowWorkspace';

export function useArchiveRetention() {
  const access = useGroupAccess();
  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    let days = 0;
    const cleanup = () => {
      if (!active) return;
      try {
        AppManager.pruneArchive(days);
      } catch (error) {
        console.error('Automatic Archive cleanup failed:', error);
      }
    };
    const update = (preferences: { systemSpaceRetentionDays: number }) => {
      days = preferences.systemSpaceRetentionDays;
      cleanup();
    };
    const unsubscribe = browser.onPreferences((preferences) => {
      receivedUpdate = true;
      if (active) update(preferences);
    });
    browser
      .preferences('get')
      .then((preferences) => {
        if (active && !receivedUpdate) update(preferences);
      })
      .catch((error) =>
        console.error('Archive retention settings could not load:', error)
      );
    const stopWorkspace = windowWorkspace.subscribe(cleanup);
    const timer = setInterval(cleanup, 60 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
      stopWorkspace();
    };
  }, [access]);
}

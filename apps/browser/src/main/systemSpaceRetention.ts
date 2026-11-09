import { app } from 'electron';
import {
  getBrowserPreferences,
  onBrowserPreferencesChanged,
} from './preferences';
import { pruneBrowsingHistory } from './history';
import { pruneDownloadHistory } from './downloads';

export function registerSystemSpaceRetention() {
  let running = false;
  let again = false;
  let stopped = false;
  const cleanup = async () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const days = getBrowserPreferences().systemSpaceRetentionDays;
        try {
          await pruneBrowsingHistory(days);
        } catch (error) {
          console.error('Automatic history cleanup failed:', error);
        }
        try {
          if (!stopped)
            pruneDownloadHistory(
              getBrowserPreferences().systemSpaceRetentionDays
            );
        } catch (error) {
          console.error('Automatic download record cleanup failed:', error);
        }
      } while (again && !stopped);
    } finally {
      running = false;
    }
  };
  const unsubscribe = onBrowserPreferencesChanged(() => {
    void cleanup();
  });
  const timer = setInterval(() => {
    void cleanup();
  }, 60 * 60 * 1000);
  timer.unref();
  app
    .whenReady()
    .then(() => cleanup())
    .catch((error) =>
      console.error('Automatic record cleanup could not start:', error)
    );
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    unsubscribe();
    app.removeListener('will-quit', stop);
  };
  app.once('will-quit', stop);
  return stop;
}

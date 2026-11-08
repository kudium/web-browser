import { useEffect, useRef, useState } from 'react';
import { browser } from '../browser/client';
import type { AppUpdateAction, AppUpdateState } from '../browser/appUpdates';

export function useAppUpdates() {
  const [state, setState] = useState<AppUpdateState>({
    status: 'unavailable',
    currentVersion: '',
  });
  const revision = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let received = false;
    const unsubscribe = browser.onAppUpdates?.((next) => {
      received = true;
      revision.current += 1;
      if (active) setState(next);
    });
    browser
      .appUpdates?.('get')
      .then((next) => {
        if (active && !received) setState(next);
      })
      .catch(() => {
        if (active) setError('Unable to load update status.');
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  const run = async (action: AppUpdateAction) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const startingRevision = revision.current;
    try {
      const next = await browser.appUpdates(action);
      if (revision.current === startingRevision) setState(next);
    } catch {
      setError('Unable to complete the update. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return { state, busy, error, run };
}

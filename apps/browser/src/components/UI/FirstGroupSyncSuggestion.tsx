import { useEffect, useRef, useState } from 'react';
import { Cloud, X } from 'lucide-react';
import { browser } from '../../browser/client';
import { IApp } from '../../types';

const storageKey = 'kudium-first-group-sync-suggestion';
export function FirstGroupSyncSuggestion({ tabs }: { tabs: IApp[] }) {
  const hasGroup = tabs.some((tab) => Boolean(tab.sessionId));
  const previouslyHadGroup = useRef(hasGroup);
  const [eligible, setEligible] = useState(false);
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    browser
      .preferences('get')
      .then((preferences) => {
        if (alive) setEligible(!preferences.cloudSync.enabled);
        return undefined;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (hasGroup && !previouslyHadGroup.current) {
      // Wait for preferences before consuming the first-group transition.
      if (!eligible) return;
      try {
        if (!localStorage.getItem(storageKey)) {
          localStorage.setItem(storageKey, 'shown');
          setShow(true);
        }
      } catch {
        /* Avoid repeated suggestions when persistence is unavailable. */
      }
    }
    previouslyHadGroup.current = hasGroup;
  }, [hasGroup, eligible]);
  if (!show) return null;
  return (
    <div className="onboarding-suggestion" role="status">
      <Cloud size={18} aria-hidden="true" />
      <div>
        <strong>Sync your groups</strong>
        <p>Keep groups available on your other devices.</p>
        <button
          type="button"
          onClick={() => {
            browser.preferences('open', { section: 'sync' });
            setShow(false);
          }}
        >
          Set up sync
        </button>
      </div>
      <button
        className="suggestion-dismiss"
        type="button"
        aria-label="Dismiss sync suggestion"
        onClick={() => setShow(false)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

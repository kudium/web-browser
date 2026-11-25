import { useEffect, useState } from 'react';
import { Cloud, X } from 'lucide-react';
import { browser } from '../../browser/client';
import { BrowserPreferences } from '../../browser/preferences';

const storageKey = 'kudium-first-group-sync-suggestion';
export function AccountSyncSuggestion() {
  const eligible = useSyncSuggestionEligibility();
  const [dismissed, setDismissed] = useState(() => {
    try {
      // Older versions stored "shown" on first impression, before any choice.
      return localStorage.getItem(storageKey) === 'dismissed';
    } catch {
      return false;
    }
  });
  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, 'dismissed');
    } catch {
      /* The current window can still dismiss when persistence is unavailable. */
    }
    setDismissed(true);
  };
  if (!eligible || dismissed) return null;
  return (
    <div className="onboarding-suggestion account-sync-suggestion" role="status">
      <Cloud size={18} aria-hidden="true" />
      <div>
        <strong>Sync your account</strong>
        <p>Keep your spaces and groups available on your other devices.</p>
        <button
          type="button"
          onClick={() => {
            browser.preferences('open', { section: 'sync' });
            dismiss();
          }}
        >
          Set up sync
        </button>
      </div>
      <button
        className="suggestion-dismiss"
        type="button"
        aria-label="Dismiss sync suggestion"
        onClick={dismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useSyncSuggestionEligibility() {
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const refresh = (preferences?: BrowserPreferences) => {
      const request = ++revision;
      Promise.all([
        preferences ? Promise.resolve(preferences) : browser.preferences('get'),
        browser.accountSync('status'),
      ])
        .then(([current, status]) => {
          if (alive && request === revision && 'connected' in status) {
            setEligible(!current.cloudSync.enabled || !status.connected);
          }
          return undefined;
        })
        .catch(() => {});
    };
    const unsubscribe = browser.onPreferences(refresh);
    window.addEventListener('focus', refreshOnFocus);
    function refreshOnFocus() { refresh(); }
    refresh();
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, []);
  return eligible;
}

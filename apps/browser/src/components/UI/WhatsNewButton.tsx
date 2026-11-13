import { useState } from 'react';

const storageKey = 'kudiumbrowser-whats-new-seen';

export function WhatsNewButton({
  version,
  compact = false,
  onOpen,
}: {
  version: string;
  compact?: boolean;
  onOpen?: (url: string) => boolean;
}) {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });
  if (!version || seen === version) return null;
  const open = () => {
    if (
      !onOpen?.(
        `https://browser.kudium.com/whats-new#release-${encodeURIComponent(
          version
        )}`
      )
    )
      return;
    try {
      localStorage.setItem(storageKey, version);
    } catch {
      /* Keep usable without storage. */
    }
    setSeen(version);
  };
  return (
    <div className="app-update-banner">
      <button
        type="button"
        className="app-update-button"
        title={`What’s New in ${version}`}
        aria-label={`What’s New in ${version}`}
        onClick={open}
      >
        {compact ? 'New' : 'What’s New'}
      </button>
    </div>
  );
}

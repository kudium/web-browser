import { useCallback, useEffect, useState } from 'react';
import type { SetStateAction } from 'react';

type AIPagePreferences = {
  open: boolean;
  historyOpen: boolean;
  historyPinned: boolean;
  pane: 'assistant' | 'tasks' | 'developer' | 'notes' | 'activity' | 'panels';
  preview: boolean;
  showStats: boolean;
  noteFontSize: number;
  noteWrap: boolean;
  noteOrder: string[];
};

/** Layout preferences only; chats and credentials use main-process storage. */
export function useAIPagePreference<K extends keyof AIPagePreferences>(
  key: K,
  fallback: AIPagePreferences[K]
) {
  const storageKey = `kudiumbrowser-ai-page-${key}`;
  const [value, setValue] = useState<AIPagePreferences[K]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (key === 'noteOrder')
        return Array.isArray(saved) &&
          saved.length <= 10000 &&
          saved.every((id) => typeof id === 'string' && id.length <= 100)
          ? saved
          : fallback;
      if (key === 'noteFontSize')
        return Number.isInteger(saved) && saved >= 12 && saved <= 24
          ? saved
          : fallback;
      if (key === 'pane')
        return [
          'assistant',
          'tasks',
          'developer',
          'notes',
          'activity',
          'panels',
        ].includes(saved)
          ? saved
          : fallback;
      return typeof saved === 'boolean' ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Unavailable preference storage must not interrupt the page.
    }
  }, [storageKey, value]);
  useEffect(() => {
    const receive = (event: Event) => {
      const changed =
        event instanceof StorageEvent
          ? event.key
          : (event as CustomEvent).detail;
      if (changed !== storageKey) return;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
        if (key === 'noteOrder') {
          if (
            Array.isArray(saved) &&
            saved.length <= 10000 &&
            saved.every((id) => typeof id === 'string' && id.length <= 100)
          )
            setValue(saved as AIPagePreferences[K]);
        } else if (key === 'noteFontSize') {
          if (Number.isInteger(saved) && saved >= 12 && saved <= 24)
            setValue(saved);
        } else if (key === 'pane') {
          if (
            ['assistant', 'tasks', 'developer', 'notes', 'activity', 'panels'].includes(
              saved
            )
          )
            setValue(saved);
        } else if (typeof saved === 'boolean')
          setValue(saved as AIPagePreferences[K]);
      } catch {
        /* Keep the current preference if storage is unavailable. */
      }
    };
    window.addEventListener('storage', receive);
    window.addEventListener('ai-page-preference-changed', receive);
    return () => {
      window.removeEventListener('storage', receive);
      window.removeEventListener('ai-page-preference-changed', receive);
    };
  }, [key, storageKey]);
  const update = useCallback(
    (next: SetStateAction<AIPagePreferences[K]>) => {
      const updated = typeof next === 'function' ? next(value) : next;
      setValue(updated);
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
        window.dispatchEvent(
          new CustomEvent('ai-page-preference-changed', { detail: storageKey })
        );
      } catch {
        /* The setting still applies locally without storage. */
      }
    },
    [storageKey, value]
  );
  return [value, update] as const;
}

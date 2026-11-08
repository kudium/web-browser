import { useEffect, useState } from 'react';

type AIPagePreferences = {
  open: boolean;
  historyOpen: boolean;
  historyPinned: boolean;
  pane: 'assistant' | 'tasks' | 'developer';
  preview: boolean;
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
      if (key === 'pane')
        return ['assistant', 'tasks', 'developer'].includes(saved)
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
  return [value, setValue] as const;
}

import { useEffect, useState } from 'react';
import { LocalStorage } from './LocalStorage';

/** Local presentation state; never changes a session's grouping or login. */
export function useCollapsedItems(key: string) {
  const [items, setItems] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(LocalStorage.get(key) || '[]');
      return Array.isArray(saved)
        ? [
            ...new Set(
              saved.filter((id) => typeof id === 'string' && id.length < 200)
            ),
          ].slice(-1024)
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    LocalStorage.set(key, JSON.stringify(items.slice(-1024)));
  }, [key, items]);
  return [items, setItems] as const;
}

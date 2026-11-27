import { useEffect, useState } from 'react';
import type { TodoEntry } from '../../browser/todos';
import { localDay } from '../../browser/todos';
export function useTodoEntries(scope?: string, all = false) {
  const [entries, setEntries] = useState<TodoEntry[]>([]);
  const [day, setDay] = useState(localDay);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let timer: number;
    setEntries([]);
    const refresh = async () => {
      const current = ++generation;
      setDay(localDay());
      try {
        const result = await window.electron.passwordManager({
          action: 'todos',
          scope,
          all,
        });
        if (alive && current === generation) {
          setEntries(result as TodoEntry[]);
          setError('');
        }
      } catch (failure) {
        if (alive && current === generation) {
          setEntries([]);
          setError(
            String(failure instanceof Error ? failure.message : failure),
          );
        }
      }
    };
    const midnight = () => {
      const next = new Date();
      next.setHours(24, 0, 0, 0);
      timer = window.setTimeout(
        () => {
          refresh();
          midnight();
        },
        Math.max(1, next.getTime() - Date.now()),
      );
    };
    refresh();
    midnight();
    const stop = window.electron.onTodosChanged?.(refresh);
    const locked = window.electron.onPasswordManagerLock?.(refresh);
    const groups = window.electron.groupLocks?.onState?.(() => {
      setEntries([]);
      refresh();
    });
    window.addEventListener('focus', refresh);
    return () => {
      alive = false;
      generation++;
      clearTimeout(timer);
      stop?.();
      locked?.();
      groups?.();
      window.removeEventListener('focus', refresh);
    };
  }, [scope, all]);
  return { entries, day, error };
}

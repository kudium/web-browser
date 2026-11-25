import { useEffect, useState } from 'react';
const key = 'kudium-panel-dock';
const read = (): 'right' | 'bottom' => {
  try {
    return localStorage.getItem(key) === 'bottom' ? 'bottom' : 'right';
  } catch {
    return 'right';
  }
};
export function usePanelDock() {
  const [position, setPosition] = useState(read);
  useEffect(() => {
    const sync = () => setPosition(read());
    const storage = (event: StorageEvent) => { if (event.key === key) sync(); };
    window.addEventListener('kudium-panel-dock', sync);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('kudium-panel-dock', sync);
      window.removeEventListener('storage', storage);
    };
  }, []);
  return {
    position,
    change: (next: 'right' | 'bottom') => {
      try {
        localStorage.setItem(key, next);
      } catch {}
      setPosition(next);
      window.dispatchEvent(new Event('kudium-panel-dock'));
    },
  };
}

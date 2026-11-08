import { useEffect, useState } from 'react';

export type Appearance = 'system' | 'light' | 'dark';
const key = 'kudiumbrowser-appearance';
const change = 'kudiumbrowser-appearance-change';
export function getAppearance(): Appearance {
  const value = localStorage.getItem(key);
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function setAppearance(value: Appearance) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event(change));
}
export function useAppearance() {
  const [preference, setPreference] = useState(getAppearance);
  const [dark, setDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setPreference(getAppearance());
    const system = () => setDark(media.matches);
    window.addEventListener('storage', update);
    window.addEventListener(change, update);
    media.addEventListener('change', system);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener(change, update);
      media.removeEventListener('change', system);
    };
  }, []);
  const systemAppearance = dark ? 'dark' : 'light';
  return {
    preference,
    appearance: preference === 'system' ? systemAppearance : preference,
  } as const;
}

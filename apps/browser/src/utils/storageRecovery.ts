import { LocalStorage } from './LocalStorage';

const warnings = new Map<string, string>();
export const hasStorageRecovery = () => warnings.size > 0;
export function readSavedList(
  key: string,
  valid: (value: unknown) => boolean
): unknown[] {
  const raw = LocalStorage.get(key);
  if (!raw) return [];
  const preserve = () => {
    warnings.set(key, raw);
    if (LocalStorage.get(`${key}.recovery`) !== raw)
      LocalStorage.set(`${key}.recovery`, raw);
  };
  try {
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) {
      preserve();
      return [];
    }
    const accepted = saved.filter(valid);
    if (accepted.length !== saved.length) preserve();

    return accepted;
  } catch {
    preserve();
    return [];
  }
}

export function writeSavedList(key: string, value: unknown[]) {
  const original = LocalStorage.get(key);
  if (
    warnings.get(key) === original &&
    original &&
    LocalStorage.get(`${key}.recovery`) !== original
  )
    throw new Error(
      'Unable to preserve recovery data. Saved layout was not changed.'
    );
  LocalStorage.set(key, JSON.stringify(value));
}

export function recoveryData() {
  return JSON.stringify(
    Object.fromEntries(
      [...warnings.keys()].map((key) => [
        key,
        LocalStorage.get(`${key}.recovery`) || LocalStorage.get(key),
      ])
    ),
    null,
    2
  );
}

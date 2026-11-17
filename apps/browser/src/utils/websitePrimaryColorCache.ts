const PRIMARY_COLOR_TTL = 2 * 60 * 1000;

/** Small, memory-only cache. Context separates login profiles and appearance. */
export function createWebsitePrimaryColorCache({
  now = Date.now,
  ttlMs = PRIMARY_COLOR_TTL,
  maxEntries = 100,
}: { now?: () => number; ttlMs?: number; maxEntries?: number } = {}) {
  const entries = new Map<string, { color: string; expires: number }>();
  const capacity = Math.max(1, Math.floor(maxEntries) || 100);
  const key = (url: string, context: string) => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
      return JSON.stringify([context, parsed.origin]);
    } catch { return undefined; }
  };
  return {
    get(url: string, context = '') {
      const id = key(url, context);
      if (!id) return undefined;
      const entry = entries.get(id);
      if (!entry) return undefined;
      entries.delete(id);
      if (entry.expires <= now()) return undefined;
      entries.set(id, entry);
      return entry.color;
    },
    set(url: string, color: string, context = '') {
      const id = key(url, context);
      if (!id || !/^#[0-9a-f]{6}$/i.test(color)) return;
      for (const [oldId, entry] of entries) if (entry.expires <= now()) entries.delete(oldId);
      entries.delete(id);
      entries.set(id, { color: color.toLowerCase(), expires: now() + ttlMs });
      while (entries.size > capacity) entries.delete(entries.keys().next().value!);
    },
    delete(url: string, context = '') {
      const id = key(url, context);
      if (id) entries.delete(id);
    },
  };
}

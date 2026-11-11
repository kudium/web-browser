import type { SiteDeveloperPageSummary } from './siteDeveloper';

export interface DeveloperPagesSnapshot {
  pages: SiteDeveloperPageSummary[];
  loading: boolean;
  error: unknown;
}
/** Shared metadata snapshots. Hook source code stays in the editor/backend. */
export function createDeveloperPagesStore(
  load: (sourceId: string) => Promise<SiteDeveloperPageSummary[]>
) {
  const entries = new Map<
    string,
    {
      snapshot: DeveloperPagesSnapshot;
      listeners: Set<() => void>;
      revision: number;
    }
  >();
  const entry = (id: string) => {
    if (!entries.has(id))
      entries.set(id, {
        snapshot: { pages: [], loading: true, error: undefined },
        listeners: new Set(),
        revision: 0,
      });
    return entries.get(id)!;
  };
  const refresh = async (id: string) => {
    const current = entry(id);
    current.revision += 1;
    const { revision } = current;
    try {
      const pages = await load(id);
      if (revision !== current.revision) return;
      current.snapshot = { pages, loading: false, error: undefined };
    } catch (error) {
      if (revision !== current.revision) return;
      current.snapshot = { pages: [], loading: false, error };
    }
    current.listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: (id: string) => entry(id).snapshot,
    subscribe(id: string, listener: () => void) {
      const current = entry(id);
      current.listeners.add(listener);
      return () => {
        current.listeners.delete(listener);
      };
    },
    refresh,
  };
}
export const developerPagesStore = createDeveloperPagesStore((id) =>
  window.electron.siteDeveloper.pages(id)
);

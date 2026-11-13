import type { DeveloperProject } from './developerProject';

interface ProjectSnapshot {
  project: DeveloperProject | null;
  loading: boolean;
  error: unknown;
}
export function createDeveloperProjectStore(
  load: (sourceId: string) => Promise<DeveloperProject | null>,
  watch?: (refresh: () => void) => () => void
) {
  const entries = new Map<
    string,
    {
      snapshot: ProjectSnapshot;
      listeners: Set<() => void>;
      revision: number;
    }
  >();
  let stopWatching: (() => void) | undefined;
  const entry = (id: string) => {
    if (!entries.has(id))
      entries.set(id, {
        snapshot: { project: null, loading: true, error: undefined },
        listeners: new Set(),
        revision: 0,
      });
    return entries.get(id)!;
  };
  const publish = (id: string, snapshot: ProjectSnapshot) => {
    const current = entry(id);
    current.snapshot = snapshot;
    current.listeners.forEach((listener) => listener());
  };
  const refresh = async (id: string) => {
    const current = entry(id);
    current.revision += 1;
    const { revision } = current;
    try {
      const project = await load(id);
      if (current.revision === revision)
        publish(id, { project, loading: false, error: undefined });
    } catch (error) {
      if (current.revision === revision)
        publish(id, { project: null, loading: false, error });
    }
  };
  const refreshActive = () => {
    entries.forEach((current, id) => {
      if (current.listeners.size) refresh(id);
    });
  };
  return {
    getSnapshot: (id: string) => entry(id).snapshot,
    refresh,
    set(id: string, project: DeveloperProject | null) {
      entry(id).revision += 1;
      publish(id, { project, loading: false, error: undefined });
    },
    subscribe(id: string, listener: () => void) {
      const current = entry(id);
      const first = current.listeners.size === 0;
      current.listeners.add(listener);
      if (!stopWatching && watch) stopWatching = watch(refreshActive);
      if (first) refresh(id);
      return () => {
        current.listeners.delete(listener);
        if (!current.listeners.size) {
          current.revision += 1;
          current.snapshot = { project: null, loading: true, error: undefined };
        }
        if (![...entries.values()].some((value) => value.listeners.size)) {
          stopWatching?.();
          stopWatching = undefined;
        }
      };
    },
  };
}
export const developerProjectStore = createDeveloperProjectStore(
  (id) => window.electron.siteDeveloper.project(id, 'get'),
  (refresh) => {
    const stop = window.electron.siteDeveloper.onPagesChanged?.(refresh);
    window.addEventListener('focus', refresh);
    return () => {
      stop?.();
      window.removeEventListener('focus', refresh);
    };
  }
);

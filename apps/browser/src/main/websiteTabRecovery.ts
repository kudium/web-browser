import type { IApp } from '../types';

/** Keep explicit restore generations separate from delayed adoption layouts. */
export class WebsiteTabRecovery {
  private entries = new Map<
    string,
    { seen: Set<string | undefined>; current?: string }
  >();

  retire(id: string, generation?: string) {
    const entry = this.entries.get(id) || {
      seen: new Set<string | undefined>(),
    };
    entry.seen.add(generation);
    entry.current = undefined;
    this.entries.set(id, entry);
  }

  close(id: string, generation?: string) {
    if (this.entries.has(id)) this.retire(id, generation);
  }

  check(apps: IApp[]): { id: string; archive: boolean } | undefined {
    const updates: Array<[string, string]> = [];
    let rejected: { id: string; archive: boolean } | undefined;
    apps.some((app) => {
      const entry = this.entries.get(app.id);
      if (!entry) return false;
      const generation = app.restorationId;
      if (generation && generation === entry.current) return false;
      if (!generation || entry.seen.has(generation)) {
        rejected = { id: app.id, archive: !entry.current };
        return true;
      }
      updates.push([app.id, generation]);
      return false;
    });
    if (rejected) return rejected;
    // A rejected layout cannot partially advance recovery generations.
    updates.forEach(([id, generation]) => {
      const entry = this.entries.get(id)!;
      entry.seen.add(generation);
      entry.current = generation;
    });
    return undefined;
  }

  clear() {
    this.entries.clear();
  }
}

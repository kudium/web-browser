import { useEffect, useState } from 'react';
import type { ProjectFileEntry } from '../../browser/developerProject';

const ignored = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'vendor',
]);

/** Lists names only; file contents remain behind the agent's project tools. */
export function useProjectFileSuggestions(
  sourceId: string | undefined,
  query: string | undefined
) {
  const folder = query?.includes('/')
    ? query.slice(0, query.lastIndexOf('/'))
    : '';
  const enabled = query !== undefined;
  const [result, setResult] = useState<{
    sourceId?: string;
    folder: string;
    entries: ProjectFileEntry[];
    loading: boolean;
  }>({ folder: '', entries: [], loading: false });
  useEffect(() => {
    let live = true;
    if (!enabled || !sourceId || !window.electron?.siteDeveloper?.files)
      return undefined;
    setResult({ sourceId, folder, entries: [], loading: true });
    const timer = setTimeout(async () => {
      const entries: ProjectFileEntry[] = [];
      const queue = [folder];
      try {
        // Bounded search avoids walking dependencies or uploading a project.
        for (
          let count = 0;
          queue.length && count < 24 && entries.length < 800;
          count += 1
        ) {
          const path = queue.shift()!;
          // eslint-disable-next-line no-await-in-loop
          const listing = await window.electron.siteDeveloper.files(sourceId, {
            action: 'list',
            path,
            hidden: false,
          });
          if (!live) return;
          (listing.entries || []).forEach((entry) => {
            if (entry.kind === 'file') entries.push(entry);
            else if (entry.kind === 'folder' && !ignored.has(entry.name)) {
              entries.push(entry);
              if (!folder) queue.push(entry.path);
            }
          });
        }
      } catch {
        // Unlinked or revoked projects simply have no file suggestions.
      }
      if (live) setResult({ sourceId, folder, entries, loading: false });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [enabled, sourceId, folder]);
  const current =
    enabled && result.sourceId === sourceId && result.folder === folder;
  return {
    entries: current
      ? result.entries
          .filter((entry) =>
            entry.path.toLowerCase().includes((query || '').toLowerCase())
          )
          .slice(0, 12)
      : [],
    loading: current && result.loading,
  };
}

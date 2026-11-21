import type { GroupTabChanges } from '../components/UI/GroupTabsSettings';
import { websiteAddress } from './websiteAddress';
import type { TabAppearance } from '../components/UI/TabIcon';

export interface GroupTabRow extends TabAppearance {
  id: string;
  name: string;
  url: string;
  customName?: string;
}
const addressKey = (value: string) => {
  try {
    return websiteAddress(value);
  } catch {
    return value.trim();
  }
};
/**
 * Match unchanged addresses first, so deleting or moving a line keeps its tab
 * identity.
 */
export function editGroupTabList(
  value: string,
  rows: GroupTabRow[],
  originalIds: string[],
  changes: GroupTabChanges
): GroupTabChanges {
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  const used = new Set<string>();
  const matched = lines.map((url) => {
    const row = rows.find(
      (entry) =>
        !used.has(entry.id) && addressKey(entry.url) === addressKey(url)
    );
    if (row) used.add(row.id);
    return row;
  });
  const edits = { ...changes.edits };
  const added: GroupTabChanges['added'] = [];
  const additionsById = new Map(changes.added.map((tab) => [tab.id, tab]));
  const order = lines.map((url, index) => {
    const row = matched[index] || rows.find((entry) => !used.has(entry.id));
    const id = row?.id || crypto.randomUUID();
    used.add(id);
    if (originalIds.includes(id)) edits[id] = { ...edits[id], url };
    else
      added.push({
        ...additionsById.get(id),
        id,
        name: row?.name || '',
        url,
      });
    return id;
  });
  return {
    edits,
    added,
    order,
    removed: originalIds.filter((id) => !order.includes(id)),
  };
}

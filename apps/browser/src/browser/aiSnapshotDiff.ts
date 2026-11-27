/** Elements as read_page reports them (compact or detailed). */
export type AISnapshotElement = Record<string, unknown> & {
  id?: unknown;
  role?: unknown;
  label?: unknown;
};

export interface AISnapshotDiff {
  added: AISnapshotElement[];
  removed: { role: string; label: string }[];
  changed: AISnapshotElement[];
  unchanged: number;
}

const identity = (element: AISnapshotElement) =>
  `${String(element.role ?? '')}\u0000${String(element.label ?? '')}`;

/** State that matters for a diff: everything except ids and geometry. */
const state = (element: AISnapshotElement) => {
  const { id, bounds, x, y, width, height, ...rest } = element;
  return JSON.stringify(rest, Object.keys(rest).sort());
};

/**
 * Compare two element lists of the same document by (role, label). Duplicate
 * labels are matched in order; a changed count shows up as added or removed.
 */
export function diffAISnapshot(
  previous: AISnapshotElement[],
  current: AISnapshotElement[]
): AISnapshotDiff {
  const before = new Map<string, AISnapshotElement[]>();
  previous.forEach((element) => {
    const key = identity(element);
    before.set(key, [...(before.get(key) ?? []), element]);
  });
  const added: AISnapshotElement[] = [];
  const changed: AISnapshotElement[] = [];
  let unchanged = 0;
  current.forEach((element) => {
    const key = identity(element);
    const candidates = before.get(key);
    const match = candidates?.shift();
    if (!match) {
      added.push(element);
      return;
    }
    if (state(match) === state(element)) unchanged += 1;
    else changed.push(element);
  });
  const removed: { role: string; label: string }[] = [];
  before.forEach((leftovers) =>
    leftovers.forEach((element) =>
      removed.push({
        role: String(element.role ?? ''),
        label: String(element.label ?? ''),
      })
    )
  );
  return { added, removed, changed, unchanged };
}

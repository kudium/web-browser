export interface TodoItem {
  id: string;
  title: string;
  markdown?: string;
  details?: string;
  completedAt?: string;
  today?: string;
  todayOrder?: number;
}
export interface TodoData {
  items: TodoItem[];
  sourceKey?: string;
  sourceLabel?: string;
  inbox?: boolean;
}
export interface TodoEntry extends TodoItem {
  noteId: string;
  noteTitle: string;
  scope?: string;
}
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function isTodoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    localDay(new Date(`${value}T12:00:00`)) === value
  );
}
export function validateTodo(value: unknown): TodoData {
  const data = value as TodoData;
  if (
    !data ||
    typeof data !== 'object' ||
    Object.keys(data).some(
      (key) => !['items', 'sourceKey', 'sourceLabel', 'inbox'].includes(key),
    ) ||
    (data.inbox !== undefined && typeof data.inbox !== 'boolean') ||
    (data.sourceLabel !== undefined &&
      (typeof data.sourceLabel !== 'string' ||
        data.sourceLabel.length > 200)) ||
    !Array.isArray(data.items) ||
    data.items.length > 500 ||
    (data.sourceKey !== undefined &&
      (typeof data.sourceKey !== 'string' || data.sourceKey.length > 500))
  )
    throw new Error('Invalid todo list.');
  const ids = new Set<string>();
  return {
    ...(data.sourceKey === undefined ? {} : { sourceKey: data.sourceKey }),
    ...(data.sourceLabel === undefined
      ? {}
      : { sourceLabel: data.sourceLabel }),
    ...(data.inbox === undefined ? {} : { inbox: data.inbox }),
    items: data.items.map((item) => {
      if (
        !item ||
        Object.keys(item).some(
          (key) =>
            !['id', 'title', 'markdown', 'details', 'completedAt', 'today', 'todayOrder'].includes(
              key,
            ),
        ) ||
        typeof item.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
        ids.has(item.id) ||
        typeof item.title !== 'string' ||
        !item.title.trim() ||
        item.title.length > 500 ||
        (item.details !== undefined && (typeof item.details !== 'string' || item.details.length > 30000)) ||
        (item.markdown !== undefined && (typeof item.markdown !== 'string' || item.markdown.length > 30000)) ||
        (item.todayOrder !== undefined &&
          (typeof item.todayOrder !== 'number' ||
            !Number.isFinite(item.todayOrder) ||
            Math.abs(item.todayOrder) > Number.MAX_SAFE_INTEGER)) ||
        (item.today !== undefined && !isTodoDate(item.today)) ||
        (item.completedAt !== undefined &&
          (typeof item.completedAt !== 'string' ||
            !Number.isFinite(Date.parse(item.completedAt))))
      )
        throw new Error('Invalid todo item.');
      ids.add(item.id);
      return { ...item };
    }),
  };
}

export function orderedToday(entries: TodoEntry[]): TodoEntry[] {
  return entries
    .map((task, index) => ({ task, rank: task.todayOrder ?? index * 1024 }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ task }) => task);
}

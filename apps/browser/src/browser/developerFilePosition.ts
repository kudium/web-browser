export interface DeveloperFilePosition {
  folder: string;
  openFile?: string;
  hidden: boolean;
  query: string;
  expanded: string[];
  selected: string[];
  scroll: number;
}
const prefix = 'kudiumbrowser-file-position:';
const validPath = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 4096 && !value.includes('\0');
export function readFilePosition(key: string): DeveloperFilePosition {
  const empty: DeveloperFilePosition = {
    folder: '',
    hidden: false,
    query: '',
    expanded: [],
    selected: [],
    scroll: 0,
  };
  try {
    const value = JSON.parse(localStorage.getItem(prefix + key) || 'null');
    if (!value || typeof value !== 'object') return empty;
    return {
      folder: validPath(value.folder) ? value.folder : '',
      openFile: validPath(value.openFile) ? value.openFile : undefined,
      hidden: value.hidden === true,
      query: typeof value.query === 'string' ? value.query.slice(0, 1000) : '',
      expanded: Array.isArray(value.expanded)
        ? value.expanded.filter(validPath).slice(0, 1000)
        : [],
      selected: Array.isArray(value.selected)
        ? value.selected.filter(validPath).slice(0, 1000)
        : [],
      scroll: Number.isFinite(value.scroll) ? Math.max(0, value.scroll) : 0,
    };
  } catch {
    return empty;
  }
}
export function writeFilePosition(
  key: string,
  position: DeveloperFilePosition
) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(position));
  } catch {
    /* Browsing remains available when storage is full or disabled. */
  }
}

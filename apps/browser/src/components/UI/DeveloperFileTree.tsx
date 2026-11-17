/* Arborist renderers forward their supplied positioning style. */
/* eslint-disable react/require-default-props, jsx-a11y/no-static-element-interactions */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Tree, TreeApi, NodeRendererProps } from 'react-arborist';
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Link as LinkIcon,
} from 'lucide-react';
import type { ProjectFileEntry } from '../../browser/developerProject';
import type { DeveloperFilePosition } from '../../browser/developerFilePosition';
import { projectErrorMessage } from '../../browser/developerProject';

type FileNode = ProjectFileEntry & {
  id: string;
  children?: FileNode[];
  status?: boolean;
  retry?: string;
};
type Branch = {
  entries: ProjectFileEntry[];
  loading?: boolean;
  error?: string;
  truncated?: boolean;
};

const emptyMenu = () => {};
const DragSource = createContext('');
const DragError = createContext<(message: string) => void>(() => {});
const FileMenu =
  createContext<(entries: ProjectFileEntry[]) => void>(emptyMenu);

// Arborist requires a backend even with tree dragging disabled. File rows hand
// native drags to Electron themselves; a window-wide HTML5 backend can survive
// a project switch and collide with the replacement tree's backend.
const fileTreeBackend = () => ({
  profile: () => ({}),
  setup: () => undefined,
  teardown: () => undefined,
  connectDragSource: () => () => undefined,
  connectDragPreview: () => () => undefined,
  connectDropTarget: () => () => undefined,
});

function FileRow({ node, style }: NodeRendererProps<FileNode>) {
  const showMenu = useContext(FileMenu);
  const sourceId = useContext(DragSource);
  const onDragError = useContext(DragError);
  let Icon = File;
  if (node.data.kind === 'folder') Icon = node.isOpen ? FolderOpen : Folder;
  else if (node.data.kind === 'link') Icon = LinkIcon;
  return (
    <button
      type="button"
      draggable={node.data.kind === 'file' && !node.data.status}
      onDragStart={(event) => {
        // Cancel HTML dragging and hand the real file to the operating system.
        event.preventDefault();
        event.stopPropagation();
        window.electron.siteDeveloper
          .files(sourceId, { action: 'drag', path: node.data.path })
          .catch((reason) => onDragError(projectErrorMessage(reason)));
      }}
      style={style}
      tabIndex={-1}
      className={`developer-file-row${node.isSelected ? ' selected' : ''}${
        node.isFocused ? ' tree-focused' : ''
      }${node.data.status ? ' tree-status' : ''}`}
      title={node.data.path || node.data.name}
      disabled={!node.isSelectable}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (node.data.status) return;
        const targets = node.isSelected
          ? node.tree.selectedNodes
              .filter((item) => !item.data.status)
              .map((item) => item.data)
          : [node.data];
        if (!node.isSelected) node.tree.select(node.id, { focus: false });
        showMenu(targets);
      }}
      onClick={(event) => {
        event.stopPropagation();
        node.handleClick(event);
      }}
    >
      {node.isInternal ? (
        <ChevronRight
          size={12}
          className={node.isOpen ? 'tree-chevron open' : 'tree-chevron'}
        />
      ) : (
        <span className="tree-chevron-space" />
      )}
      {!node.data.status && <Icon size={14} />}
      <span>{node.data.name}</span>
      {node.data.kind === 'link' && <small>Link</small>}
    </button>
  );
}

export function DeveloperFileTree({
  sourceId,
  entries,
  hidden,
  query,
  disabled,
  refreshKey,
  onOpen,
  onError,
  onEntryCount,
  position,
  onPositionChange,
  onFileMenu,
}: {
  sourceId: string;
  entries: ProjectFileEntry[];
  hidden: boolean;
  query: string;
  disabled: boolean;
  refreshKey: number;
  onOpen: (entry: ProjectFileEntry) => void;
  onError: (message: string) => void;
  onEntryCount: (count: number) => void;
  position?: DeveloperFilePosition;
  onFileMenu?: (items: ProjectFileEntry[]) => void;
  onPositionChange?: (patch: Partial<DeveloperFilePosition>) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const tree = useRef<TreeApi<FileNode>>(null);
  const [size, setSize] = useState({ width: 240, height: 220 });
  const [branches, setBranches] = useState<Record<string, Branch>>({});
  const branchRef = useRef(branches);
  branchRef.current = branches;
  const generation = useRef(0);
  const restored = useRef(false);
  const restoring = useRef(false);
  const snapshot = useRef(position);
  const latestPosition = useRef(position);
  latestPosition.current = position;
  useEffect(() => {
    generation.current += 1;
    snapshot.current = latestPosition.current;
    restored.current = false;
    branchRef.current = {};
    setBranches({});
    return () => {
      generation.current += 1;
    };
  }, [sourceId, hidden, refreshKey]);
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const measure = () => {
      if (element.clientWidth && element.clientHeight)
        setSize({ width: element.clientWidth, height: element.clientHeight });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    onEntryCount(
      entries.length +
        Object.values(branches).reduce(
          (total, branch) => total + branch.entries.length,
          0
        )
    );
  }, [entries, branches, onEntryCount]);
  const updateBranch = (path: string, branch: Branch) => {
    const next = { ...branchRef.current, [path]: branch };
    branchRef.current = next;
    setBranches(next);
  };
  const loadBranch = async (path: string) => {
    if (disabled || branchRef.current[path]?.loading) return;
    const { current } = generation;
    onError('');
    updateBranch(path, { entries: [], loading: true });
    try {
      const result = await window.electron.siteDeveloper.files(sourceId, {
        action: 'list',
        path,
        hidden,
      });
      if (current !== generation.current) return;
      const count =
        entries.length +
        Object.values(branchRef.current).reduce(
          (total, branch) => total + branch.entries.length,
          0
        );
      if (count + (result.entries?.length || 0) > 10000)
        throw new Error('Close and reopen Files to load more folders.');
      updateBranch(path, {
        entries: result.entries || [],
        truncated: result.truncated,
      });
      if (tree.current?.focusedNode?.id === `status:${path}`)
        tree.current.select(`entry:${path}`);
    } catch (reason) {
      if (current !== generation.current) return;
      const message = projectErrorMessage(reason);
      updateBranch(path, { entries: [], error: message });
      onError(message);
    }
  };
  const loadBranchRef = useRef(loadBranch);
  loadBranchRef.current = loadBranch;
  const data = useMemo(() => {
    const status = (path: string, name: string, retry?: string): FileNode => ({
      id: `status:${path}`,
      path: '',
      name,
      kind: 'other',
      status: true,
      retry,
    });
    const mapEntries = (items: ProjectFileEntry[]): FileNode[] =>
      items.map((entry) => {
        const value: FileNode = { ...entry, id: `entry:${entry.path}` };
        if (entry.kind === 'folder') {
          const branch = branches[entry.path];
          if (!branch) value.children = [];
          else if (branch.loading)
            value.children = [status(entry.path, 'Loading…')];
          else if (branch.error)
            value.children = [
              status(entry.path, 'Could not load. Retry', entry.path),
            ];
          else if (!branch.entries.length)
            value.children = [status(entry.path, 'Empty folder')];
          else {
            value.children = mapEntries(branch.entries);
            if (branch.truncated)
              value.children.push(
                status(entry.path, 'Showing first 2,000 entries')
              );
          }
        }
        return value;
      });
    return mapEntries(entries);
  }, [entries, branches]);
  useEffect(() => {
    if (disabled || !tree.current || !snapshot.current) return undefined;
    const api = tree.current;
    const saved = snapshot.current;
    let loadingBranch = false;
    saved.expanded.forEach((path) => {
      const node = api.get(`entry:${path}`);
      if (!node?.isInternal) return;
      if (!node.isOpen) {
        restoring.current = true;
        node.open();
        restoring.current = false;
      }
      if (!branchRef.current[path]) {
        loadBranchRef.current(path);
        loadingBranch = true;
      } else if (branchRef.current[path].loading) loadingBranch = true;
    });
    if (loadingBranch || restored.current) return undefined;
    restoring.current = true;
    const ids = saved.selected
      .map((path) => `entry:${path}`)
      .filter((id) => !!api.get(id));
    if (ids.length)
      api.setSelection({
        ids,
        anchor: ids[0],
        mostRecent: ids[ids.length - 1],
      });
    restoring.current = false;
    const frame = requestAnimationFrame(() => {
      api.scrollToOffset(saved.scroll);
      restored.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [data, disabled, refreshKey]);
  const hasMatches = (nodes: FileNode[]): boolean =>
    nodes.some(
      (node) =>
        node.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
        (node.children && hasMatches(node.children))
    );
  return (
    <DragError.Provider value={onError}>
      <DragSource.Provider value={sourceId}>
        <FileMenu.Provider value={onFileMenu || emptyMenu}>
          <div
            className="developer-files-tree"
            ref={root}
            onKeyDown={(event) => {
              if (
                event.key === 'ContextMenu' ||
                (event.shiftKey && event.key === 'F10')
              ) {
                event.preventDefault();
                event.stopPropagation();
                onFileMenu?.(
                  tree.current?.selectedNodes
                    .filter((node) => !node.data.status)
                    .map((node) => node.data) || []
                );
              }
            }}
          >
            <Tree<FileNode>
              key={`${sourceId}:${hidden}:${refreshKey}`}
              ref={tree}
              data={data}
              height={size.height}
              width={size.width}
              rowHeight={32}
              indent={16}
              overscanCount={5}
              openByDefault={false}
              selectionFollowsFocus
              disableEdit
              disableDrag
              disableDrop
              dndBackend={fileTreeBackend}
              disableSelect={(dataNode) =>
                disabled || (dataNode.kind === 'other' && !dataNode.retry)
              }
              searchTerm={query}
              searchMatch={(node, term) =>
                node.data.name
                  .toLocaleLowerCase()
                  .includes(term.toLocaleLowerCase())
              }
              aria-label="Project file tree"
              onSelect={(nodes) => {
                if (restored.current && !restoring.current)
                  onPositionChange?.({
                    selected: nodes
                      .filter((node) => !node.data.status)
                      .map((node) => node.data.path),
                  });
              }}
              onScroll={({ scrollOffset }) => {
                if (restored.current)
                  onPositionChange?.({ scroll: scrollOffset });
              }}
              onToggle={(id) => {
                const node = tree.current?.get(id);
                if (node && !restoring.current) {
                  const expanded = new Set(snapshot.current?.expanded || []);
                  if (node.isOpen) expanded.add(node.data.path);
                  else expanded.delete(node.data.path);
                  if (snapshot.current)
                    snapshot.current = {
                      ...snapshot.current,
                      expanded: [...expanded],
                    };
                  onPositionChange?.({ expanded: [...expanded] });
                }
                if (node?.isOpen && !branchRef.current[node.data.path])
                  loadBranch(node.data.path);
              }}
              onActivate={(node) => {
                if (disabled) return;
                if (node.data.retry) loadBranch(node.data.retry);
                else if (node.isInternal) node.toggle();
                else if (!node.data.status && node.data.kind !== 'other')
                  onOpen(node.data);
              }}
            >
              {FileRow}
            </Tree>
            {query && !hasMatches(data) && (
              <p className="developer-tree-empty">No matching files.</p>
            )}
          </div>
        </FileMenu.Provider>
      </DragSource.Provider>
    </DragError.Provider>
  );
}

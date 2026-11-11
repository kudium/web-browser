/* Scrollable read-only previews need keyboard focus for scrolling. */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions, react/require-default-props, no-restricted-syntax, no-await-in-loop */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dialog, IconButton, TextField } from '@radix-ui/themes';
import {
  ChevronRight,
  RotateCw,
  Ellipsis,
  ArrowLeft,
  Code2,
  Search,
} from 'lucide-react';
import { PanelDialogContent, PanelDialogHeader } from './PanelDialog';
import {
  showDeveloperContextMenu,
  menuSeparator,
  DeveloperMenuItem,
} from './developerContextMenu';
import type {
  ProjectFileEntry,
  ProjectFilesResult,
} from '../../browser/developerProject';
import { DeveloperFileTree } from './DeveloperFileTree';
import { DeveloperFormatPreview } from './DeveloperFormatPreview';
import { DeveloperFileEditor } from './DeveloperFileEditor';
import {
  readFilePosition,
  writeFilePosition,
  DeveloperFilePosition,
} from '../../browser/developerFilePosition';
import { projectErrorMessage } from '../../browser/developerProject';

const drafts = new Map<
  string,
  { file: NonNullable<ProjectFilesResult['file']>; text: string }
>();

export function DeveloperFiles({
  sourceId,
  projectName,
  projectPath,
  onOpenTerminal = () => {},
}: {
  sourceId: string;
  projectName: string;
  projectPath?: string;
  onOpenTerminal?: () => void;
}) {
  const positionKey = `${sourceId}:${projectPath || projectName}`;
  const [initialPosition] = useState(() => readFilePosition(positionKey));
  const position = useRef(initialPosition);
  const remember = useCallback(
    (patch: Partial<DeveloperFilePosition>) => {
      position.current = { ...position.current, ...patch };
      writeFilePosition(positionKey, position.current);
    },
    [positionKey]
  );
  const root = useRef<HTMLElement>(null);
  const hadPreview = useRef(false);
  const [listing, setListing] = useState<ProjectFilesResult>({
    path: position.current.folder,
    entries: [],
  });
  const [preview, setPreview] = useState<ProjectFilesResult['file']>();
  const [text, setText] = useState('');
  const [operation, setOperation] = useState<{
    action: 'create-file' | 'create-folder' | 'rename' | 'duplicate';
    path: string;
    title: string;
  }>();
  const [itemName, setItemName] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const dirty = preview?.text !== undefined && text !== preview.text;
  const draftKey = (path: string) =>
    `${sourceId}:${projectPath || projectName}:${path}`;
  const [hidden, setHidden] = useState(position.current.hidden);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = (action: () => void) => {
    if (busy || loading) return;
    if (dirty) setPending(() => action);
    else action();
  };
  const [error, setError] = useState('');
  const [query, setQuery] = useState(position.current.query);
  const [entryCount, setEntryCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const revision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current += 1;
    };
  }, []);
  useEffect(() => {
    if (preview) {
      const target =
        root.current?.querySelector<HTMLElement>('.cm-content') ||
        root.current?.querySelector<HTMLElement>('.developer-file-preview') ||
        root.current?.querySelector<HTMLElement>(
          '[aria-label="Back to folder"]'
        );
      target?.focus();
    } else if (hadPreview.current) {
      root.current?.querySelector<HTMLElement>('[role="tree"]')?.focus();
    }
    hadPreview.current = !!preview;
  }, [preview]);
  const load = async (path: string, action: 'list' | 'preview' = 'list') => {
    revision.current += 1;
    const { current } = revision;
    setLoading(true);
    setError('');
    setSaved(false);
    try {
      const result = await window.electron.siteDeveloper.files(sourceId, {
        action,
        path,
        hidden,
      });
      if (!mounted.current || current !== revision.current) return false;
      if (result.file) {
        const draft = drafts.get(draftKey(result.file.path));
        setPreview(draft?.file || result.file);
        setText(draft?.text ?? result.file.text ?? '');
        remember({ openFile: result.file.path });
      } else {
        setListing(result);
        remember({ folder: result.path, openFile: undefined });
        setPreview(undefined);
        setRefreshKey((value) => value + 1);
      }
      return true;
    } catch (reason) {
      if (mounted.current && current === revision.current)
        setError(projectErrorMessage(reason));
      return false;
    } finally {
      if (mounted.current && current === revision.current) setLoading(false);
    }
  };
  const loadRef = useRef(load);
  loadRef.current = load;
  const pathRef = useRef(listing.path);
  pathRef.current = listing.path;
  const firstLoad = useRef(true);
  useEffect(() => {
    const initial = firstLoad.current;
    firstLoad.current = false;
    const openFile = initial ? position.current.openFile : undefined;
    remember({ hidden });
    const restore = async () => {
      const ok = await loadRef.current(pathRef.current);
      if (!mounted.current) return;
      if (!ok && pathRef.current) await loadRef.current('');
      if (openFile && mounted.current)
        await loadRef.current(openFile, 'preview');
    };
    restore();
  }, [hidden, remember]);
  const external = async (
    action: 'editor' | 'reveal' | 'terminal' | 'terminal-tab',
    path: string
  ) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const { current } = revision;
    try {
      await window.electron.siteDeveloper.files(sourceId, { action, path });
      if (
        action === 'terminal-tab' &&
        mounted.current &&
        current === revision.current
      )
        onOpenTerminal();
    } catch (reason) {
      if (mounted.current && current === revision.current)
        setError(projectErrorMessage(reason));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const parts = listing.path.split(/[\\/]+/).filter(Boolean);
  const crumbs = [
    { name: projectName, path: '' },
    ...parts.map((name, index) => ({
      name,
      path: parts.slice(0, index + 1).join('/'),
    })),
  ];
  const open = (entry: ProjectFileEntry) => {
    guard(() => load(entry.path, 'preview'));
  };
  const save = async () => {
    if (!preview?.version || !dirty || busy || loading) return false;
    const savedText = preview.text?.includes('\r\n')
      ? text.replace(/\r?\n/g, '\r\n')
      : text;
    if (new TextEncoder().encode(savedText).length > 256 * 1024) {
      setError(
        'This file exceeds the 256 KB editing limit. Your edits are kept; copy them to an external editor.'
      );
      return false;
    }
    setBusy(true);
    setError('');
    const { current } = revision;
    try {
      const result = await window.electron.siteDeveloper.files(sourceId, {
        action: 'save',
        path: preview.path,
        text: savedText,
        version: preview.version,
      });
      if (!mounted.current || current !== revision.current) return false;
      if (!result.file) throw new Error('The file could not be saved.');
      drafts.delete(draftKey(preview.path));
      setPreview(result.file);
      setText(result.file.text || '');
      setSaved(true);
      return true;
    } catch (reason) {
      if (mounted.current && current === revision.current)
        setError(projectErrorMessage(reason));
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const receive = () => {
      if (root.current?.contains(document.activeElement)) saveRef.current();
    };
    window.addEventListener('developer-save-file', receive);
    return () => window.removeEventListener('developer-save-file', receive);
  }, []);
  const discard = () => {
    if (preview) drafts.delete(draftKey(preview.path));
    setText(preview?.text || '');
    setSaved(false);
  };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const absolutePath = (path: string) =>
    projectPath ? `${projectPath.replace(/[\\/]+$/, '')}/${path}` : path;
  const copy = (value: string) => navigator.clipboard.writeText(value);
  const refresh = () =>
    guard(() => {
      if (preview) drafts.delete(draftKey(preview.path));
      load(preview?.path || listing.path, preview ? 'preview' : 'list');
    });
  const nameItem = (
    action: 'create-file' | 'create-folder' | 'rename' | 'duplicate',
    path: string,
    title: string,
    initial = ''
  ) =>
    guard(() => {
      setItemName(initial);
      setOperation({ action, path, title });
    });
  const mutate = async () => {
    if (!operation || busy) return;
    setBusy(true);
    setError('');
    const { current } = revision;
    try {
      const result = await window.electron.siteDeveloper.files(sourceId, {
        action: operation.action,
        path: operation.path,
        name: itemName,
      });
      if (!mounted.current || current !== revision.current) return;
      const oldPreview = preview?.path;
      let nextPreview = oldPreview;
      if (
        operation.action === 'create-file' ||
        operation.action === 'duplicate' ||
        (operation.action === 'rename' && oldPreview === operation.path)
      )
        nextPreview = result.path;
      if (operation.action === 'rename') {
        const remap = (path: string) =>
          path === operation.path ||
          path.startsWith(`${operation.path}/`) ||
          path.startsWith(`${operation.path}\\`)
            ? result.path + path.slice(operation.path.length)
            : path;
        if (nextPreview) nextPreview = remap(nextPreview);
        remember({
          expanded: position.current.expanded.map(remap),
          selected: position.current.selected.map(remap),
        });
      }
      setOperation(undefined);
      await load(listing.path);
      if (nextPreview && mounted.current) await load(nextPreview, 'preview');
    } catch (reason) {
      if (mounted.current) setError(projectErrorMessage(reason));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const trash = (entries: ProjectFileEntry[]) =>
    guard(() => {
      const perform = async () => {
        setBusy(true);
        setError('');
        const targets = entries.filter(
          (entry) =>
            !entries.some(
              (other) =>
                other !== entry &&
                other.kind === 'folder' &&
                (entry.path.startsWith(`${other.path}/`) ||
                  entry.path.startsWith(`${other.path}\\`))
            )
        );
        const { current } = revision;
        try {
          for (const entry of targets) {
            if (!mounted.current || revision.current !== current) return;
            await window.electron.siteDeveloper.files(sourceId, {
              action: 'trash',
              path: entry.path,
            });
          }
          if (mounted.current) await load(listing.path);
        } catch (reason) {
          if (mounted.current) setError(projectErrorMessage(reason));
        } finally {
          if (mounted.current) setBusy(false);
        }
      };
      perform();
    });
  const previewActions: DeveloperMenuItem[] = [
    {
      label: 'Save file',
      disabled: !dirty || busy || !preview?.version,
      run: async () => {
        await save();
      },
    },
    { label: 'Discard changes', disabled: !dirty || busy, run: discard },
    { label: 'Reload from disk…', disabled: loading || busy, run: refresh },
    menuSeparator,
    {
      label: 'Copy relative path',
      run: () => copy(preview?.path || listing.path),
    },
    {
      label: 'Copy absolute path',
      disabled: !projectPath,
      run: () => copy(absolutePath(preview?.path || listing.path)),
    },
    {
      label: 'Open in external editor',
      disabled: !preview,
      run: () => external('editor', preview!.path),
    },
    {
      label: 'Reveal in file manager',
      run: () => external('reveal', preview?.path || listing.path),
    },
  ];
  const fileMenu = async (entries: ProjectFileEntry[]) => {
    if (busy || loading) return;
    const entry = entries[0];
    const single = entries.length === 1;
    let folder = listing.path;
    if (single)
      folder =
        entry.kind === 'folder'
          ? entry.path
          : entry.path.split(/[\\/]/).slice(0, -1).join('/');
    const regular =
      entries.length > 0 &&
      entries.every((item) => item.kind === 'file' || item.kind === 'folder');
    const items: DeveloperMenuItem[] = [
      {
        label:
          entries.length > 1
            ? `${entries.length} selected items`
            : entry?.name || projectName,
        disabled: true,
      },
    ];
    if (single && entry.kind === 'file')
      items.push({
        label: 'Open in tab',
        run: () => {
          window.dispatchEvent(
            new CustomEvent('kudiumbrowser-open-project-file', {
              detail: { sourceId, path: entry.path },
            })
          );
        },
      });
    if (!entry || (single && entry.kind === 'folder')) {
      try {
        const result = await window.electron.siteDeveloper.scripts(sourceId, {
          action: 'list',
        });
        if (!mounted.current) return;
        items.push({
          label: 'Run as',
          disabled: !result.scripts.length,
          submenu: result.scripts.map((script) => ({
            label: script.name,
            run: async () => {
              await window.electron.siteDeveloper.scripts(sourceId, {
                action: 'run',
                id: script.id,
                cwd: folder,
              });
              if (mounted.current) onOpenTerminal();
            },
          })),
        });
      } catch (reason) {
        setError(projectErrorMessage(reason));
      }
    }
    if (entry?.path === preview?.path && preview?.text !== undefined)
      items.push(...previewActions.slice(0, 4));
    if (entry)
      items.push(
        {
          label:
            single && entry.kind === 'folder'
              ? 'Browse folder'
              : 'Open in sidebar',
          disabled: !single,
          run: () =>
            guard(() =>
              load(entry.path, entry.kind === 'folder' ? 'list' : 'preview')
            ),
        },
        {
          label: 'Open in external editor',
          disabled: !single || entry.kind !== 'file',
          run: () => external('editor', entry.path),
        },
        menuSeparator,
        {
          label: 'Copy relative path',
          run: () => copy(entries.map((item) => item.path).join('\n')),
        },
        {
          label: 'Copy absolute path',
          disabled: !projectPath,
          run: () =>
            copy(entries.map((item) => absolutePath(item.path)).join('\n')),
        },
        {
          label: 'Reveal in file manager',
          disabled: !single,
          run: () => external('reveal', entry.path),
        },
        {
          label: 'Open in new terminal tab',
          disabled: !single || entry.kind !== 'folder',
          run: () => external('terminal-tab', entry.path),
        },
        {
          label: 'Open system terminal here',
          disabled: !single,
          run: () => external('terminal', entry.path),
        },
        menuSeparator,
        {
          label: 'Rename…',
          disabled: !single || !regular,
          run: () => nameItem('rename', entry.path, 'Rename', entry.name),
        },
        {
          label: 'Duplicate file…',
          disabled: !single || entry.kind !== 'file',
          run: () =>
            nameItem(
              'duplicate',
              entry.path,
              'Duplicate file',
              entry.name.replace(/(\.[^.]+)?$/, ' copy$1')
            ),
        },
        {
          label: 'Move to Trash',
          disabled: !regular,
          run: () => trash(entries),
        },
        menuSeparator
      );
    if (!entry)
      items.push(
        {
          label: 'Open in new terminal tab',
          run: () => external('terminal-tab', folder),
        },
        {
          label: 'Reveal current folder',
          run: () => external('reveal', folder),
        },
        {
          label: 'Open system terminal here',
          run: () => external('terminal', folder),
        },
        menuSeparator
      );
    items.push(
      {
        label: 'New file…',
        run: () => nameItem('create-file', folder, 'New file'),
      },
      {
        label: 'New folder…',
        run: () => nameItem('create-folder', folder, 'New folder'),
      },
      {
        label: 'Refresh files',
        run: () =>
          guard(() => {
            const path = preview?.path;
            const reload = async () => {
              await load(listing.path);
              if (path && mounted.current) await load(path, 'preview');
            };
            reload();
          }),
      },
      {
        label: hidden ? 'Hide hidden files' : 'Show hidden files',
        run: () => guard(() => setHidden(!hidden)),
      }
    );
    const { current } = revision;
    showDeveloperContextMenu(
      items,
      () => mounted.current && revision.current === current,
      setError
    );
  };
  const operationLabel = busy ? 'Working…' : operation?.title || 'Create';
  let fileStatus = preview ? `${preview.size.toLocaleString()} bytes` : '';
  if (saved) fileStatus = 'Saved';
  if (dirty) fileStatus = 'Unsaved changes';
  const currentPath = preview?.path || listing.path;
  let emptyMessage = 'No visible files in this folder.';
  if (hidden) emptyMessage = 'This folder is empty.';
  return (
    <section
      className="developer-files"
      ref={root}
      aria-label="Project files"
      aria-busy={loading || busy}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('input,textarea')) return;
        event.preventDefault();
        event.stopPropagation();
        fileMenu([]);
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          event.preventDefault();
          event.stopPropagation();
          fileMenu([]);
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 's'
        ) {
          event.preventDefault();
          save();
        }
      }}
    >
      <div className="developer-files-toolbar">
        {preview ? (
          <button
            type="button"
            className="developer-files-back"
            aria-label="Back to folder"
            onClick={() =>
              guard(() => {
                setPreview(undefined);
                remember({ openFile: undefined });
                setError('');
              })
            }
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <strong>{preview.name}</strong>
          </button>
        ) : (
          <nav
            className="developer-files-breadcrumbs"
            aria-label="Browse project folders"
          >
            {crumbs.map((crumb, index) => (
              <span key={crumb.path}>
                {index > 0 && <ChevronRight size={10} aria-hidden="true" />}
                <button
                  type="button"
                  disabled={loading}
                  title={crumb.name}
                  onClick={() => guard(() => load(crumb.path))}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        )}
        <IconButton
          size="1"
          color="gray"
          variant="ghost"
          aria-label="Refresh files"
          disabled={loading}
          onClick={() =>
            guard(() => {
              if (preview) drafts.delete(draftKey(preview.path));
              load(preview?.path || listing.path, preview ? 'preview' : 'list');
            })
          }
        >
          <RotateCw size={13} />
        </IconButton>
        <IconButton
          size="1"
          color="gray"
          variant="ghost"
          aria-label="File options"
          title="File options"
          disabled={busy || loading}
          onClick={() =>
            fileMenu(
              preview
                ? [{ name: preview.name, path: preview.path, kind: 'file' }]
                : []
            )
          }
        >
          <Ellipsis size={14} />
        </IconButton>
      </div>
      {error && (
        <p role="alert" className="developer-files-feedback">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="developer-files-feedback">
          Loading files…
        </p>
      )}
      {pending && (
        <div className="developer-unsaved" role="alert">
          <span>Save changes to {preview?.name}?</span>
          <Button
            size="1"
            disabled={busy}
            onClick={async () => {
              if (await save()) {
                const next = pending;
                setPending(null);
                next();
              }
            }}
          >
            Save
          </Button>
          <Button
            size="1"
            color="gray"
            variant="soft"
            disabled={busy}
            onClick={() => {
              discard();
              const next = pending;
              setPending(null);
              next();
            }}
          >
            Discard
          </Button>
          <Button
            size="1"
            color="gray"
            variant="ghost"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            Cancel
          </Button>
        </div>
      )}
      <div className="developer-files-content" data-preview={!!preview}>
        {preview ? (
          <div
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const { current } = revision;
              showDeveloperContextMenu(
                [
                  { label: 'File preview', disabled: true },
                  ...previewActions.filter(
                    (item) =>
                      item.label !== 'Save file' &&
                      item.label !== 'Discard changes'
                  ),
                ],
                () => mounted.current && revision.current === current,
                setError
              );
            }}
            className="developer-file-editor-pane"
            aria-label={`Preview of ${preview.name}`}
          >
            <div className="developer-file-preview-actions">
              <span title={preview.path}>
                {preview.name} · {fileStatus}
              </span>
              {preview.version && (
                <>
                  <Button
                    size="1"
                    variant="ghost"
                    color="gray"
                    disabled={!dirty || busy}
                    onClick={discard}
                  >
                    Discard
                  </Button>
                  <Button
                    size="1"
                    disabled={!dirty || busy || loading}
                    onClick={() => save()}
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </Button>
                </>
              )}
              <Button
                size="1"
                color="gray"
                variant="ghost"
                disabled={busy}
                onClick={() => external('editor', preview.path)}
              >
                <Code2 size={12} />
                Open in editor
              </Button>
            </div>
            {preview.imageURL ? (
              <div className="developer-image-preview" key={preview.imageURL}>
                <img
                  src={preview.imageURL}
                  alt={preview.name}
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                    setError(
                      'This image format could not be displayed. Open it in your editor.'
                    );
                  }}
                />
              </div>
            ) : null}
            {!preview.imageURL &&
              (preview.text !== undefined || preview.media) && (
                <DeveloperFormatPreview
                  key={preview.path}
                  file={preview}
                  text={text}
                >
                  {preview.text !== undefined && (
                    <DeveloperFileEditor
                      key={preview.path}
                      name={preview.name}
                      value={text}
                      disabled={busy || loading || !preview.version}
                      actions={previewActions}
                      onError={setError}
                      onChange={(value) => {
                        setText(value);
                        setSaved(false);
                        if (value !== preview.text)
                          drafts.set(draftKey(preview.path), {
                            file: preview,
                            text: value,
                          });
                        else drafts.delete(draftKey(preview.path));
                      }}
                    />
                  )}
                </DeveloperFormatPreview>
              )}
            {!preview.imageURL &&
              !preview.media &&
              preview.text === undefined && (
                <p className="developer-files-feedback">{preview.notice}</p>
              )}
          </div>
        ) : null}
        <div
          className="developer-files-browser"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            fileMenu([]);
          }}
        >
          {(entryCount > 8 || query) && (
            <TextField.Root
              size="1"
              aria-label="Filter files"
              placeholder="Filter files…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                remember({ query: event.target.value });
              }}
            >
              <TextField.Slot>
                <Search size={12} />
              </TextField.Slot>
            </TextField.Root>
          )}
          <div className="developer-files-list" aria-label="Files and folders">
            <DeveloperFileTree
              sourceId={sourceId}
              entries={listing.entries || []}
              hidden={hidden}
              query={query}
              disabled={loading || busy}
              refreshKey={refreshKey}
              onOpen={open}
              onError={setError}
              onEntryCount={setEntryCount}
              position={position.current}
              onPositionChange={remember}
              onFileMenu={fileMenu}
            />
            {!loading && !error && !listing.entries?.length && (
              <p className="developer-files-feedback">{emptyMessage}</p>
            )}
          </div>
          {query && (
            <p className="developer-files-feedback">Filters loaded folders.</p>
          )}
          {listing.truncated && (
            <p className="developer-files-feedback">
              Showing the first 2,000 entries. Open a folder to browse further.
            </p>
          )}
        </div>
      </div>
      <Dialog.Root
        open={!!operation}
        onOpenChange={(shown) => {
          if (!shown && !busy) setOperation(undefined);
        }}
      >
        <PanelDialogContent size="1" style={{ maxWidth: 360 }}>
          <PanelDialogHeader title={operation?.title} />
          <Dialog.Description size="1">
            {operation?.path || projectName}
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutate();
            }}
          >
            <TextField.Root
              autoFocus
              aria-label="Item name"
              placeholder="Name"
              value={itemName}
              disabled={busy}
              onChange={(event) => setItemName(event.target.value)}
            />
            {error && (
              <p role="alert" className="developer-files-feedback">
                {error}
              </p>
            )}
            <div className="developer-file-dialog-actions">
              <Button
                type="button"
                color="gray"
                variant="soft"
                disabled={busy}
                onClick={() => setOperation(undefined)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  !itemName.trim() ||
                  itemName !== itemName.trim() ||
                  itemName.length > 255 ||
                  ['.', '..'].includes(itemName) ||
                  /[\\/]/.test(itemName)
                }
              >
                {operationLabel}
              </Button>
            </div>
          </form>
        </PanelDialogContent>
      </Dialog.Root>
    </section>
  );
}

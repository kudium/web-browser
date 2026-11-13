/* eslint-disable react/require-default-props */
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button, DropdownMenu, IconButton } from '@radix-ui/themes';
import {
  Folder,
  FolderPlus,
  Files,
  PanelTop,
  Terminal,
  Code2,
  GitBranch,
  ArrowUpRight,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import { developerProjectStore } from '../../browser/developerProjectStore';
import { PanelDropdownContent } from './PanelDialog';
import type {
  ProjectAction,
  ProjectEditors,
} from '../../browser/developerProject';
import { DeveloperFiles } from './DeveloperFiles';
import { DeveloperScripts } from './DeveloperScripts';
import { projectErrorMessage } from '../../browser/developerProject';

export function DeveloperProjectSection({
  sourceId,
  active,
  onOpenTerminal = () => {},
  onProjectChange = () => {},
  view,
  onViewChange,
  settingsOnly = false,
  onOpenDeveloper = () => {},
}: {
  sourceId: string;
  active: boolean;
  onOpenTerminal?: () => void;
  onProjectChange?: () => void;
  view?: 'pages' | 'files';
  onViewChange?: (next: 'pages' | 'files') => void;
  settingsOnly?: boolean;
  onOpenDeveloper?: () => void;
}) {
  const pagesButton = useRef<HTMLButtonElement>(null);
  const filesButton = useRef<HTMLButtonElement>(null);
  const [localFilesOpen, setLocalFilesOpen] = useState(false);
  const filesOpen = view === undefined ? localFilesOpen : view === 'files';
  const setFilesOpen = (open: boolean) => {
    if (onViewChange) onViewChange(open ? 'files' : 'pages');
    else setLocalFilesOpen(open);
  };
  const subscribe = useCallback(
    (listener: () => void) =>
      active ? developerProjectStore.subscribe(sourceId, listener) : () => {},
    [sourceId, active]
  );
  const snapshot = useSyncExternalStore(subscribe, () =>
    developerProjectStore.getSnapshot(sourceId)
  );
  const { project, loading } = snapshot;
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState('');
  const error =
    actionError || (snapshot.error ? projectErrorMessage(snapshot.error) : '');
  const [editors, setEditors] = useState<ProjectEditors>({ editors: [] });
  const [editorLoading, setEditorLoading] = useState(false);
  const revision = useRef(0);
  const acting = useRef(false);
  useEffect(() => {
    revision.current += 1;
    setLocalFilesOpen(false);
    setError('');
    setBusy(false);
    acting.current = false;
    return () => {
      revision.current += 1;
    };
  }, [sourceId, active]);
  useEffect(() => {
    if (!loading && !project && view === 'files') onViewChange?.('pages');
  }, [loading, project, view, onViewChange]);
  const navigateViews = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      !onViewChange ||
      !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    )
      return;
    event.preventDefault();
    const nextFiles =
      event.key === 'End' || (event.key !== 'Home' && !filesOpen);
    if (nextFiles && (busy || !project?.available)) return;
    setFilesOpen(nextFiles);
    (nextFiles ? filesButton : pagesButton).current?.focus();
  };
  const refreshEditors = async (choose?: true) => {
    setEditorLoading(true);
    try {
      setEditors(await window.electron.siteDeveloper.editors(choose));
    } catch {
      setError('Could not load editors. Try choosing an application again.');
    } finally {
      setEditorLoading(false);
    }
  };
  const perform = async (
    action: ProjectAction,
    editorId?: string,
    folderPath?: string
  ) => {
    if (acting.current) return;
    const request = revision.current;
    acting.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await window.electron.siteDeveloper.project(
        sourceId,
        action,
        editorId,
        ...(folderPath === undefined ? [] : [folderPath])
      );
      if (request === revision.current) {
        developerProjectStore.set(sourceId, value);
        if (action === 'link' || action === 'unlink') {
          setFilesOpen(false);
          onProjectChange();
        }
        if (action === 'editor') await refreshEditors();
      }
    } catch (reason) {
      if (request === revision.current) setError(projectErrorMessage(reason));
    } finally {
      if (request === revision.current) {
        acting.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <section
      className={`developer-project${
        settingsOnly ? ' group-project-folder' : ''
      }${filesOpen ? ' developer-project-files-open' : ''}`}
      aria-label="Linked project"
      aria-busy={busy || loading}
    >
      {settingsOnly && (
        <div className="group-project-folder-header">
          <strong>Project folder</strong>
          <Button
            type="button"
            size="1"
            variant="ghost"
            color="gray"
            onClick={onOpenDeveloper}
          >
            <Code2 size={15} aria-hidden="true" />
            Open Developer
            <ArrowUpRight size={13} aria-hidden="true" />
          </Button>
        </div>
      )}
      {loading && (
        <p className="developer-sidebar-feedback">Loading project…</p>
      )}
      {!loading && project && (
        <>
          <div className="developer-project-heading">
            <Folder size={18} aria-hidden="true" />
            <div className="developer-project-copy">
              <strong>{project.name}</strong>
              <nav
                className="developer-project-breadcrumbs"
                aria-label="Project directory"
                title={project.path}
              >
                {(
                  project.breadcrumbs || [
                    { name: project.path, path: project.path },
                  ]
                ).map((crumb, index) => (
                  <span className="developer-project-crumb" key={crumb.path}>
                    {index > 0 && (
                      <span
                        className="developer-project-crumb-divider"
                        aria-hidden="true"
                      >
                        ›
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busy || !project.available}
                      title={`Open ${crumb.path}`}
                      onClick={() => perform('folder', undefined, crumb.path)}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </nav>
            </div>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  variant="ghost"
                  color="gray"
                  size="1"
                  disabled={busy}
                  aria-label="Project options"
                  title="Project options"
                >
                  <MoreHorizontal size={16} />
                </IconButton>
              </DropdownMenu.Trigger>
              <PanelDropdownContent size="1">
                <DropdownMenu.Item
                  disabled={busy || !project.available}
                  onSelect={() => perform('folder')}
                >
                  Show folder
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  disabled={busy}
                  onSelect={() => perform('link')}
                >
                  Change folder…
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  disabled={busy}
                  onSelect={() => perform('unlink')}
                >
                  Unlink project
                </DropdownMenu.Item>
              </PanelDropdownContent>
            </DropdownMenu.Root>
          </div>
          {!project.available && (
            <p className="developer-project-notice">
              Folder unavailable. Choose another in Project options.
            </p>
          )}
          {!settingsOnly && (
            <div className="developer-project-actions">
              <div
                className={onViewChange ? 'developer-project-views' : undefined}
                role={onViewChange ? 'group' : undefined}
                aria-label={onViewChange ? 'Developer view' : undefined}
              >
                {onViewChange && (
                  <Button
                    type="button"
                    size="1"
                    variant="ghost"
                    ref={pagesButton}
                    color="gray"
                    aria-pressed={!filesOpen}
                    aria-label="Pages"
                    title="Pages"
                    onKeyDown={navigateViews}
                    onClick={() => setFilesOpen(false)}
                  >
                    <PanelTop size={16} />
                    <span className="developer-project-view-label">Pages</span>
                  </Button>
                )}
                <Button
                  type="button"
                  size="1"
                  variant="ghost"
                  color="gray"
                  disabled={busy || !project.available}
                  ref={filesButton}
                  aria-expanded={filesOpen}
                  onKeyDown={navigateViews}
                  aria-pressed={view === undefined ? undefined : filesOpen}
                  aria-controls="developer-project-files"
                  aria-label="Files"
                  title="Files"
                  onClick={() => setFilesOpen(onViewChange ? true : !filesOpen)}
                >
                  <Files size={16} />
                  <span className="developer-project-view-label">Files</span>
                </Button>
              </div>
              <div className="developer-project-launchers">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    <Button
                      type="button"
                      size="1"
                      variant="ghost"
                      color="gray"
                      disabled={busy || !project.available}
                      aria-label="Terminal"
                      title="Terminal"
                    >
                      <Terminal size={14} />
                      <span className="developer-project-action-label">
                        Terminal
                      </span>
                      <ChevronDown size={12} />
                    </Button>
                  </DropdownMenu.Trigger>
                  <PanelDropdownContent size="1">
                    <DropdownMenu.Item onSelect={onOpenTerminal}>
                      Open here
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => perform('terminal')}>
                      Open system terminal
                    </DropdownMenu.Item>
                  </PanelDropdownContent>
                </DropdownMenu.Root>
                <DropdownMenu.Root
                  onOpenChange={(open) => {
                    if (open) refreshEditors();
                  }}
                >
                  <DropdownMenu.Trigger>
                    <Button
                      type="button"
                      size="1"
                      variant="ghost"
                      color="gray"
                      disabled={busy || !project.available}
                      title="Choose an editor"
                      aria-label="Editor"
                    >
                      <Code2 size={14} />
                      <span className="developer-project-action-label">
                        Editor
                      </span>
                      <ChevronDown size={12} />
                    </Button>
                  </DropdownMenu.Trigger>
                  <PanelDropdownContent size="1">
                    <DropdownMenu.Label>Open in</DropdownMenu.Label>
                    {editorLoading && (
                      <DropdownMenu.Item disabled>
                        Finding editors…
                      </DropdownMenu.Item>
                    )}
                    {!editorLoading &&
                      editors.editors.map((editor) => (
                        <DropdownMenu.CheckboxItem
                          key={editor.id}
                          checked={editor.id === editors.preferred}
                          onSelect={() => perform('editor', editor.id)}
                        >
                          {editor.icon ? (
                            <img
                              className="developer-editor-icon"
                              src={editor.icon}
                              alt=""
                              aria-hidden="true"
                            />
                          ) : (
                            <Code2 size={16} aria-hidden="true" />
                          )}
                          {editor.name}
                        </DropdownMenu.CheckboxItem>
                      ))}
                    {!editorLoading && !editors.editors.length && (
                      <DropdownMenu.Item disabled>
                        No editors found
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      disabled={editorLoading}
                      onSelect={() => refreshEditors(true)}
                    >
                      <FolderPlus size={16} aria-hidden="true" />
                      Choose application…
                    </DropdownMenu.Item>
                  </PanelDropdownContent>
                </DropdownMenu.Root>
                <DeveloperScripts
                  sourceId={sourceId}
                  disabled={busy || !project.available}
                  onRun={onOpenTerminal}
                />
                {project.repository && (
                  <Button
                    type="button"
                    size="1"
                    variant="ghost"
                    color="gray"
                    disabled={busy || !project.available}
                    onClick={() => perform('repository')}
                    title={project.repository}
                    aria-label="Repository"
                  >
                    <GitBranch size={14} aria-hidden="true" />
                    <span className="developer-project-action-label">
                      Repository
                    </span>
                  </Button>
                )}
              </div>
            </div>
          )}
          {!settingsOnly && filesOpen && (
            <div id="developer-project-files">
              <DeveloperFiles
                key={`${sourceId}:${project.path}`}
                sourceId={sourceId}
                projectName={project.name}
                projectPath={project.path}
                onOpenTerminal={onOpenTerminal}
              />
            </div>
          )}
        </>
      )}
      {!loading && !project && (
        <div className="developer-project-empty">
          <div>
            {!settingsOnly && <strong>Project folder</strong>}
            <p>
              Connect a local project folder to work with AI and browser tools.
            </p>
          </div>
          <Button
            type="button"
            size="1"
            color="gray"
            variant="soft"
            disabled={busy}
            onClick={() => perform('link')}
          >
            <FolderPlus size={14} />
            Link folder
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="developer-project-notice">
          {error}
        </p>
      )}
    </section>
  );
}

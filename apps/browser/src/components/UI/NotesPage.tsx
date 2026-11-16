import {
  RenderErrorBoundary,
  renderFailureMessage,
} from './RenderErrorBoundary';
import { AssistantPageHeader } from './AssistantPageHeader';
/* Native controls have visible or accessible labels. */
/* eslint-disable react/require-default-props, jsx-a11y/label-has-associated-control */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from 'react';
import {
  Button,
  IconButton,
  TextField,
  TextArea,
  Switch,
  Popover,
  Dialog,
} from '@radix-ui/themes';
import {
  ListFilter,
  Trash2,
  Minus,
  Plus,
  Bold,
  Italic,
  Code,
  Heading,
  List,
  MoreHorizontal,
  CaseSensitive,
  LockKeyhole,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useAIPagePreference } from '../../utils/useAIPagePreference';
import { browser } from '../../browser/client';
import type { IApp } from '../../types';
import type { VaultItem, VaultSummary } from '../../browser/passwordManager';
import { personalDataScope } from '../../utils/groups';
import { HistorySidebarFrame, HistoryToolbar } from './HistorySidebarFrame';
import { PanelPopoverContent, PanelDialogContent } from './PanelDialog';
import { GroupPicker } from './GroupPicker';
import { HistorySearchInput } from './HistorySearchInput';
import { NotesHistoryList } from './NotesHistoryList';
import { useAssistantPanelDocument } from './AssistantPanelContext';
import type { NoteEditorHandle, NoteFormat } from './MarkdownNoteEditor';

const MarkdownNoteEditor = lazy(() =>
  import('./MarkdownNoteEditor').then((module) => ({
    default: module.MarkdownNoteEditor,
  }))
);

export function NotesPage({
  tabs = [],
  initialScope,
}: {
  tabs?: IApp[];
  initialScope?: string;
}) {
  const panelDocument = useAssistantPanelDocument();
  const [notes, setNotes] = useState<VaultSummary[]>([]);
  const [draft, setDraft] = useState<VaultItem>();
  const currentDraft = useRef<VaultItem | undefined>(undefined);
  currentDraft.current = draft;
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState(initialScope || 'all');
  useEffect(() => {
    setScope(initialScope || 'all');
  }, [initialScope]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPinned, setHistoryPinned] = useState(false);
  const [fontSize, setFontSize] = useAIPagePreference('noteFontSize', 16);
  const [wrap, setWrap] = useAIPagePreference('noteWrap', true);
  const [formatOpen, setFormatOpen] = useState(false);
  const [markdownMode, setMarkdownMode] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const pageElement = useRef<HTMLElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const revealEditor = () => {
    // Match the CSS breakpoint where the list covers the editor.
    const width = pageElement.current?.getBoundingClientRect().width || 0;
    if (!historyPinned || (width > 0 && width < 540)) setHistoryOpen(false);
  };
  const historyToggle = useRef<HTMLButtonElement>(null);
  const [textSelected, setTextSelected] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    scope?: string;
    title: string;
  }>();
  const [noteOrder, setNoteOrder] = useAIPagePreference('noteOrder', []);
  const editVersion = useRef(0);
  const privacyEpoch = useRef(0);
  const editor = useRef<NoteEditorHandle | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const sourceInput = useRef<HTMLTextAreaElement>(null);
  const pendingBodyFocus = useRef(false);
  const setEditorHandle = useCallback((handle: NoteEditorHandle | null) => {
    editor.current = handle;
    if (handle && pendingBodyFocus.current) {
      pendingBodyFocus.current = false;
      handle.focusStart();
    }
  }, []);
  const focusTitle = useCallback(() => {
    titleInput.current?.focus();
    const end = titleInput.current?.value.length || 0;
    titleInput.current?.setSelectionRange(end, end);
  }, []);
  const focusBody = () => {
    if (markdownMode) {
      sourceInput.current?.focus();
      sourceInput.current?.setSelectionRange(0, 0);
    } else if (editor.current) editor.current.focusStart();
    else pendingBodyFocus.current = true;
  };
  useEffect(() => {
    pendingBodyFocus.current = false;
    if (currentDraft.current && !currentDraft.current.title)
      titleInput.current?.focus();
  }, [draft?.id]);
  const groups = useMemo(
    () =>
      Array.from(
        new Map(
          tabs
            .filter((tab) => !tab.archived)
            .map((tab) => [personalDataScope(tab), tab])
        ).entries()
      ),
    [tabs]
  );
  const refresh = useCallback(async () => {
    const epoch = privacyEpoch.current;
    const result = await window.electron.passwordManager({ action: 'notes' });
    if (epoch !== privacyEpoch.current) return;
    const summaries = result as VaultSummary[];
    setNotes(summaries);
  }, [scope]);
  useEffect(() => {
    refresh().catch((failure) =>
      setError(
        (/ENOSPC|no space left on device|disk (?:is )?full/i.test(
          String(failure.message)
        )
          ? renderFailureMessage(new Error(String(failure.message)))
          : String(failure.message)
        ).replace(
          /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/,
          ''
        )
      )
    );
    const stop = window.electron.onPasswordManagerLock?.(() => {
      if (currentDraft.current?.sensitive) {
        privacyEpoch.current += 1;
        editVersion.current += 1;
        setDirty(false);
        setDraft(undefined);
      }
      setError('');
      refresh().catch((failure) =>
        setError(
          (/ENOSPC|no space left on device|disk (?:is )?full/i.test(
            String(failure.message)
          )
            ? renderFailureMessage(new Error(String(failure.message)))
            : String(failure.message)
          ).replace(
            /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/,
            ''
          )
        )
      );
    });
    return () => {
      stop?.();
    };
  }, [refresh]);
  const save = useCallback(async () => {
    if (!draft || !dirty) return;
    const version = editVersion.current;
    const epoch = privacyEpoch.current;
    await window.electron.passwordManager({
      action: 'save',
      scope: draft.scope,
      item: { ...draft, title: draft.title.trim() || 'Untitled note' },
    });
    if (epoch !== privacyEpoch.current) return;
    if (version === editVersion.current) setDirty(false);
    await refresh();
  }, [draft, dirty, refresh]);
  const run = useCallback(
    async (work: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
        await work();
      } catch (failure) {
        setError(
          failure instanceof Error
            ? (/ENOSPC|no space left on device|disk (?:is )?full/i.test(
                failure.message
              )
                ? renderFailureMessage(failure)
                : failure.message
              ).replace(
                /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/,
                ''
              )
            : 'Notes are unavailable.'
        );
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );
  useEffect(() => {
    if (!dirty || busy || error) return undefined;
    const timer = setTimeout(() => {
      run(save);
    }, 800);
    return () => clearTimeout(timer);
  }, [dirty, busy, error, draft, run, save]);
  useEffect(() => {
    if (!historyOpen || historyPinned) return undefined;
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !history.current?.contains(target) &&
        !target.closest('.notes-group-filter-popover') &&
        !target.closest('[aria-controls="notes-history-panel"]')
      )
        setHistoryOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (panelDocument.querySelector('.notes-group-filter-popover')) return;
      if (event.key === 'Escape') setHistoryOpen(false);
    };
    panelDocument.addEventListener('pointerdown', outside, true);
    panelDocument.addEventListener('keydown', escape);
    return () => {
      panelDocument.removeEventListener('pointerdown', outside, true);
      panelDocument.removeEventListener('keydown', escape);
    };
  }, [historyOpen, historyPinned, panelDocument]);
  const create = () =>
    run(async () => {
      await save();
      const item: VaultItem = {
        id: crypto.randomUUID(),
        title: '',
        kind: 'note',
        scope: scope !== 'all' && scope !== 'browser' ? scope : undefined,
        origin: '',
        username: '',
        password: '',
        fields: [],
        notes: '',
        sensitive: false,
        allowAI: false,
      };
      await window.electron.passwordManager({
        action: 'save',
        item: { ...item, title: 'Untitled note' },
        scope: item.scope,
      });
      setDraft(item);
      setDirty(false);
      await refresh();
      revealEditor();
    });
  const select = (note: VaultSummary) =>
    run(async () => {
      const epoch = privacyEpoch.current;
      await save();
      const item = await window.electron.passwordManager({
        action: 'edit',
        id: note.id,
        scope: note.scope,
      });
      if (epoch !== privacyEpoch.current) return;
      const opened = item as VaultItem;
      setDraft(opened);
      setDirty(false);
      revealEditor();
      if (opened.asRead === false) {
        opened.asRead = true;
        await window.electron.passwordManager({
          action: 'save',
          item: opened,
          scope: opened.scope,
        });
        await refresh();
      }
    });
  useEffect(() => {
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 3000);
    const open = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      window.electron
        .passwordManager({ action: 'notes' })
        .then((result) => {
          const note = (result as VaultSummary[]).find(
            (entry) => entry.id === id
          );
          if (note) select(note);
        })
        .catch(() => setError('Note unavailable.'));
    };
    window.addEventListener('kudiumbrowser-open-note', open);
    return () => {
      clearInterval(timer);
      window.removeEventListener('kudiumbrowser-open-note', open);
    };
  });
  const update = (patch: Partial<VaultItem>) => {
    editVersion.current += 1;
    setError('');
    setDraft((value) => value && { ...value, ...patch });
    setDirty(true);
  };
  const orderedNotes = [...notes].sort((a, b) => {
    const aIndex = noteOrder.indexOf(a.id);
    const bIndex = noteOrder.indexOf(b.id);
    return (
      (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) -
      (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex)
    );
  });
  const reorder = (id: string, beforeId: string | null) => {
    const ids = orderedNotes
      .map((note) => note.id)
      .filter((value) => value !== id);
    const index = beforeId ? ids.indexOf(beforeId) : ids.length;
    if (index < 0 || !orderedNotes.some((note) => note.id === id)) return;
    ids.splice(index, 0, id);
    setNoteOrder(ids);
  };
  const renameNote = async (note: VaultSummary, title: string) => {
    let renamed = false;
    await run(async () => {
      const epoch = privacyEpoch.current;
      await save();
      const item =
        currentDraft.current?.id === note.id
          ? currentDraft.current
          : ((await window.electron.passwordManager({
              action: 'edit',
              id: note.id,
              scope: note.scope,
            })) as VaultItem);
      if (epoch !== privacyEpoch.current) return;
      await window.electron.passwordManager({
        action: 'save',
        scope: note.scope,
        item: { ...item, title },
      });
      if (epoch !== privacyEpoch.current) return;
      setDraft((current) =>
        current?.id === note.id ? { ...current, title } : current
      );
      await refresh();
      renamed = true;
    });
    return renamed;
  };
  const groupFilter = (
    <GroupPicker
      label="Filter notes by group"
      triggerClassName={`notes-filter-button ${
        scope !== 'all' ? 'notes-filter-active' : ''
      }`}
      triggerContent={<ListFilter size={16} />}
      contentClassName="notes-group-filter-popover"
      disabled={busy}
      value={scope}
      onChange={setScope}
      options={[
        { id: 'all', name: 'All notes' },
        ...(notes.some((note) => !note.scope)
          ? [{ id: 'browser', name: 'Personal notes' }]
          : []),
        ...groups
          .filter(([id]) => notes.some((note) => note.scope === id))
          .map(([id, tab]) => ({
            id,
            name: tab.sessionName || tab.name,
            group: tab,
          })),
      ]}
    />
  );
  const visible = orderedNotes
    .filter(
      (note) =>
        (scope === 'all' ||
          (scope === 'browser' ? !note.scope : note.scope === scope)) &&
        note.title.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 100);
  return (
    <section
      ref={pageElement}
      className={`notes-page ${historyOpen ? 'ai-history-open' : ''} ${
        historyPinned ? 'ai-history-pinned' : ''
      } ${draft ? 'notes-has-draft' : 'notes-library-only'}`}
      aria-label="Notes"
    >
      {historyOpen && (
        <div
          ref={history}
          id="notes-history-panel"
          className="ai-chat-history-panel notes-history-panel"
        >
          <HistorySidebarFrame
            title="Notes"
            label="Note history"
            pinned={historyPinned}
            busy={busy}
            onPin={() => setHistoryPinned(!historyPinned)}
            onClose={() => {
              setHistoryOpen(false);
              requestAnimationFrame(() => historyToggle.current?.focus());
            }}
            onNew={create}
          >
            <div className="notes-search-controls">
              <HistorySearchInput
                label="Search note titles"
                placeholder="Search notes"
                value={query}
                onChange={setQuery}
              />
              {groupFilter}
            </div>
            <NotesHistoryList
              notes={visible}
              groupNames={Object.fromEntries(
                groups.map(([id, tab]) => [id, tab.sessionName || tab.name])
              )}
              selectedId={draft?.id}
              busy={busy}
              searching={!!query}
              onSelect={select}
              onRename={renameNote}
              onDelete={setDeleteTarget}
              onReorder={reorder}
            />
            {notes.length > visible.length && (
              <small>{visible.length} matching notes</small>
            )}
          </HistorySidebarFrame>
        </div>
      )}
      {error && (
        <div className="notes-error" role="alert">
          {error}
        </div>
      )}
      <AssistantPageHeader className="notes-toolbar">
        {draft ? (
          <HistoryToolbar
            toggleRef={historyToggle}
            open={historyOpen}
            label="Note history"
            panelId="notes-history-panel"
            busy={busy}
            onOpen={() => setHistoryOpen(true)}
            onNew={create}
            newLabel="New note"
          />
        ) : (
          <h2>Notes</h2>
        )}
        <div className="notes-toolbar-spacer" />
        {!draft && (
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label="New note"
            disabled={busy}
            onClick={create}
          >
            <Plus size={16} />
          </IconButton>
        )}
        {draft && (
          <>
            {dirty && !textSelected && (
              <span className="notes-save-status" aria-live="polite">
                {busy ? 'Saving…' : 'Edited'}
              </span>
            )}
            {textSelected && !markdownMode && (
              <div
                className="notes-inline-format"
                aria-label="Format selected text"
              >
                {[
                  [Bold, 'Bold selected text', 'bold'],
                  [Italic, 'Italic selected text', 'italic'],
                  [Code, 'Inline code', 'inlineCode'],
                ].map(([Icon, label, command]) => {
                  const Glyph = Icon as typeof Bold;
                  return (
                    <IconButton
                      key={String(command)}
                      size="1"
                      variant="ghost"
                      aria-label={String(label)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        editor.current?.format(command as NoteFormat)
                      }
                    >
                      <Glyph size={14} />
                    </IconButton>
                  );
                })}
              </div>
            )}
            {(!textSelected || markdownMode) && (
              <Popover.Root open={formatOpen} onOpenChange={setFormatOpen}>
                <Popover.Trigger>
                  <IconButton
                    size="1"
                    variant="ghost"
                    aria-label="Format note"
                    title="Format note"
                  >
                    <CaseSensitive size={17} />
                  </IconButton>
                </Popover.Trigger>
                <PanelPopoverContent className="notes-format-popup" size="1">
                  <div
                    className="notes-format"
                    aria-label="Markdown formatting"
                  >
                    {!markdownMode &&
                      [
                        [Bold, 'Bold', 'bold'],
                        [Italic, 'Italic', 'italic'],
                        [Heading, 'Heading', 'heading'],
                        [List, 'List', 'list'],
                        [Code, 'Code snippet', 'code'],
                      ].map(([Icon, label, command]) => {
                        const Glyph = Icon as typeof Bold;
                        return (
                          <IconButton
                            size="1"
                            variant="ghost"
                            key={String(label)}
                            aria-label={String(label)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              editor.current?.format(command as NoteFormat);
                              setFormatOpen(false);
                            }}
                          >
                            <Glyph size={14} />
                          </IconButton>
                        );
                      })}
                  </div>
                  <div className="notes-font-size">
                    <span>Text size</span>
                    <IconButton
                      size="1"
                      variant="ghost"
                      aria-label="Decrease note text size"
                      disabled={fontSize <= 12}
                      onClick={() =>
                        setFontSize((size) => Math.max(12, size - 1))
                      }
                    >
                      <Minus size={14} />
                    </IconButton>
                    <Button
                      size="1"
                      variant="ghost"
                      aria-label="Reset note text size"
                      title="Reset to 16px"
                      onClick={() => setFontSize(16)}
                    >
                      {fontSize}px
                    </Button>
                    <IconButton
                      size="1"
                      variant="ghost"
                      aria-label="Increase note text size"
                      disabled={fontSize >= 24}
                      onClick={() =>
                        setFontSize((size) => Math.min(24, size + 1))
                      }
                    >
                      <Plus size={14} />
                    </IconButton>
                  </div>
                </PanelPopoverContent>
              </Popover.Root>
            )}
            <Popover.Root open={optionsOpen} onOpenChange={setOptionsOpen}>
              <Popover.Trigger>
                <IconButton
                  size="1"
                  variant="ghost"
                  aria-label="Note options"
                  title="Note options"
                >
                  <MoreHorizontal size={16} />
                </IconButton>
              </Popover.Trigger>
              <PanelPopoverContent className="notes-options-popup" size="1">
                <Button
                  size="1"
                  variant="ghost"
                  onClick={() => {
                    setMarkdownMode((value) => !value);
                    setTextSelected(false);
                    setFormatOpen(false);
                    setOptionsOpen(false);
                  }}
                >
                  <Code size={14} />
                  {markdownMode ? 'Use visual editor' : 'Edit as Markdown'}
                </Button>
                <div
                  className="notes-location"
                  role="group"
                  aria-label="Note location"
                >
                  <span className="notes-location-label">Note location</span>
                  <GroupPicker
                    label="Choose note location"
                    disabled={busy}
                    value={draft.scope || 'browser'}
                    options={[
                      {
                        id: 'browser',
                        name: 'Personal notes',
                        detail: 'Available across all browser groups',
                      },
                      ...groups.map(([id, tab]) => ({
                        id,
                        name: tab.sessionName || tab.name,
                        group: tab,
                        detail: 'Notes for this browser group',
                      })),
                    ]}
                    onChange={(value) =>
                      run(async () => {
                        await save();
                        const destination =
                          value === 'browser' ? undefined : value;
                        await window.electron.passwordManager({
                          action: 'moveNote',
                          id: draft.id,
                          destination,
                        });
                        setDraft(
                          (current) =>
                            current && { ...current, scope: destination }
                        );
                        await refresh();
                      })
                    }
                  />
                  <span className="notes-location-help">
                    {draft.scope
                      ? 'This note belongs to the selected browser group.'
                      : 'Available across all browser groups. Choose a group to keep this note with that group.'}
                  </span>
                </div>
                <label className="notes-option-row">
                  <span>Allow AI access</span>
                  <Switch
                    size="1"
                    checked={draft.allowAI}
                    disabled={busy}
                    onCheckedChange={(allowAI) => update({ allowAI })}
                  />
                </label>
                <Button
                  size="1"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await save();
                      const sensitive = !draft.sensitive;
                      await window.electron.passwordManager({
                        action: 'save',
                        scope: draft.scope,
                        item: {
                          ...draft,
                          title: draft.title.trim() || 'Untitled note',
                          sensitive,
                        },
                      });
                      setDraft(
                        (current) => current && { ...current, sensitive }
                      );
                      setOptionsOpen(false);
                      await refresh();
                    })
                  }
                >
                  <LockKeyhole size={14} />
                  {draft.sensitive ? 'Remove note lock' : 'Lock note'}
                </Button>
                {draft.sensitive && (
                  <Button
                    size="1"
                    variant="ghost"
                    onClick={() =>
                      run(async () => {
                        await save();
                        await window.electron.passwordManager({
                          action: 'lock',
                        });
                        setDraft(undefined);
                        setOptionsOpen(false);
                      })
                    }
                  >
                    Lock now
                  </Button>
                )}
                <Button
                  size="1"
                  variant="ghost"
                  color="red"
                  disabled={busy}
                  onClick={() => {
                    setOptionsOpen(false);
                    setDeleteTarget(draft);
                  }}
                >
                  <Trash2 size={14} />
                  Delete note
                </Button>
              </PanelPopoverContent>
            </Popover.Root>
          </>
        )}
      </AssistantPageHeader>
      <div
        className="notes-editor"
        hidden={!draft && historyOpen && !historyPinned}
        style={{ '--note-font-size': `${fontSize}px` } as CSSProperties}
      >
        {draft ? (
          <>
            <TextField.Root
              ref={titleInput}
              className="notes-title"
              aria-label="Note title"
              placeholder="Title"
              maxLength={120}
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              onKeyDown={(event) => {
                if (
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.altKey ||
                  event.shiftKey
                )
                  return;
                if (
                  event.key === 'Enter' ||
                  (event.key === 'ArrowDown' &&
                    event.currentTarget.selectionStart ===
                      event.currentTarget.value.length &&
                    event.currentTarget.selectionEnd ===
                      event.currentTarget.value.length)
                ) {
                  event.preventDefault();
                  focusBody();
                }
              }}
            />
            {markdownMode ? (
              <TextArea
                key={draft.id}
                ref={sourceInput}
                className="notes-markdown-source"
                wrap={wrap ? 'soft' : 'off'}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  browser
                    .nativeMenu([
                      {
                        id: 'wrap',
                        label: 'Wrap text',
                        type: 'checkbox',
                        checked: wrap,
                      },
                      { type: 'separator' },
                      { label: 'Cut', role: 'cut' },
                      { label: 'Copy', role: 'copy' },
                      { label: 'Paste', role: 'paste' },
                      { label: 'Select All', role: 'selectAll' },
                    ])
                    .then((action) => {
                      if (action === 'wrap') setWrap(!wrap);
                    })
                    .catch(() => {});
                }}
                aria-label="Note Markdown source"
                placeholder="Write Markdown…"
                value={draft.notes || ''}
                onChange={(event) => update({ notes: event.target.value })}
                onKeyDown={(event) => {
                  if (
                    event.key === 'ArrowUp' &&
                    !event.nativeEvent.isComposing &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.altKey &&
                    !event.shiftKey &&
                    event.currentTarget.selectionStart === 0 &&
                    event.currentTarget.selectionEnd === 0
                  ) {
                    event.preventDefault();
                    focusTitle();
                  }
                }}
                spellCheck={false}
              />
            ) : (
              <RenderErrorBoundary
                key={draft.id}
                label="Note editor"
                recovery={
                  <button type="button" onClick={() => setMarkdownMode(true)}>
                    Use plain text
                  </button>
                }
              >
                <Suspense
                  fallback={
                    <div aria-label="Loading note editor" role="status" />
                  }
                >
                  <MarkdownNoteEditor
                    key={draft.id}
                    ref={setEditorHandle}
                    onFocusTitle={focusTitle}
                    onSelectionChange={setTextSelected}
                    markdown={draft.notes || ''}
                    onChange={(markdown) => update({ notes: markdown })}
                  />
                </Suspense>
              </RenderErrorBoundary>
            )}
          </>
        ) : historyOpen && historyPinned ? (
          <p className="notes-sidebar-empty">Select a note to start reading.</p>
        ) : (
          !historyOpen &&
          (notes.some(
            (note) =>
              scope === 'all' ||
              (scope === 'browser' ? !note.scope : note.scope === scope)
          ) ? (
            <div className="notes-landing-list">
              <div className="notes-search-controls">
                <HistorySearchInput
                  label="Search note titles"
                  placeholder="Search notes"
                  value={query}
                  onChange={setQuery}
                />
                {groupFilter}
              </div>
              <NotesHistoryList
                notes={visible}
                groupNames={Object.fromEntries(
                  groups.map(([id, tab]) => [id, tab.sessionName || tab.name])
                )}
                selectedId={undefined}
                busy={busy}
                searching={!!query}
                onSelect={select}
                onRename={renameNote}
                onDelete={setDeleteTarget}
                onReorder={reorder}
              />
            </div>
          ) : (
            <>
              <div className="notes-empty">
                <span className="notes-empty-title">
                  Your notes, all in one place
                </span>
                <span>Capture an idea or start writing.</span>
                <Button
                  size="1"
                  variant="ghost"
                  disabled={busy}
                  onClick={create}
                >
                  Create note
                </Button>
              </div>
            </>
          ))
        )}
      </div>
      <Dialog.Root
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteTarget(undefined);
        }}
      >
        <PanelDialogContent
          className="notes-delete-dialog"
          size="1"
          maxWidth="360px"
        >
          <Dialog.Title size="3">Delete note?</Dialog.Title>
          <Dialog.Description size="2">
            This permanently removes “{deleteTarget?.title || 'Untitled note'}”
            from Personal Data.
          </Dialog.Description>
          <div className="notes-dialog-actions">
            <Dialog.Close>
              <Button variant="soft">Cancel</Button>
            </Dialog.Close>
            <Button
              color="red"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (!deleteTarget) return;
                  await window.electron.passwordManager({
                    action: 'delete',
                    id: deleteTarget.id,
                    scope: deleteTarget.scope,
                  });
                  if (currentDraft.current?.id === deleteTarget.id) {
                    editVersion.current += 1;
                    setDraft(undefined);
                    setDirty(false);
                  }
                  setDeleteTarget(undefined);
                  await refresh();
                })
              }
            >
              Delete note
            </Button>
          </div>
        </PanelDialogContent>
      </Dialog.Root>
    </section>
  );
}

import { lastNoteView, rememberNoteView } from './lastNoteView';
import { TodoList, TodayTodos } from './TodoList';
import { takeTodoNavigation } from './noteNavigation';
import {
  RenderErrorBoundary,
  renderFailureMessage,
} from './RenderErrorBoundary';
import { AssistantPageHeader } from './AssistantPageHeader';
import { ChromeIconButton } from './ChromeIconButton';
import { EditorViewSwitch } from './EditorViewSwitch';
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
  TextArea,
  Switch,
  Popover,
} from '@radix-ui/themes';
import {
  Trash2,
  Minus,
  Plus,
  Bold,
  Italic,
  Code,
  Heading,
  List,
  MoreHorizontal,
  LockKeyhole,
  FileText,
  StickyNotePlus,
  ListPlus,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useAIPagePreference } from '../../utils/useAIPagePreference';
import { browser } from '../../browser/client';
import type { IApp } from '../../types';
import type { VaultItem, VaultSummary } from '../../browser/passwordManager';
import { personalDataScope } from '../../utils/groups';
import { HistorySidebarFrame, HistoryToolbar } from './HistorySidebarFrame';
import { PanelPopoverContent } from './PanelDialog';
import { GroupPicker } from './GroupPicker';
import { HistorySearchInput } from './HistorySearchInput';
import { NotesHistoryList } from './NotesHistoryList';
import { useAssistantPanelVisible, useAssistantPanelDocument } from './AssistantPanelContext';
import type { NoteEditorHandle, NoteFormat } from './MarkdownNoteEditor';

const MarkdownNoteEditor = lazy(() =>
  import('./MarkdownNoteEditor').then((module) => ({
    default: module.MarkdownNoteEditor,
  })),
);

export function NotesPage({
  tabs = [],
  initialScope,
  scopeRequest,
  initialView = 'last',
}: {
  tabs?: IApp[];
  initialScope?: string;
  scopeRequest?: { scope: string; token: number };
  initialView?: 'last' | 'library';
}) {
  const panelDocument = useAssistantPanelDocument();
  const panelVisible = useAssistantPanelVisible();
  const [showToday, setShowToday] = useState(initialView === 'last');
  const [loaded, setLoaded] = useState(false);
  const restoredView = useRef(initialView === 'library');
  const directNavigation = useRef(false);
  const [focusTask, setFocusTask] = useState<string>();
  const [notes, setNotes] = useState<VaultSummary[]>([]);
  const [draft, setDraft] = useState<VaultItem>();
  const [externalNoteRevision,setExternalNoteRevision]=useState(0);
  const currentDraft = useRef<VaultItem | undefined>(undefined);
  currentDraft.current = draft;
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState(
    scopeRequest?.scope || initialScope || 'all',
  );
  useEffect(() => {
    setScope(scopeRequest?.scope || initialScope || 'all');
  }, [initialScope, scopeRequest]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPinned, setHistoryPinned] = useState(false);
  const [fontSize, setFontSize] = useAIPagePreference('noteFontSize', 14);
  const [wrap, setWrap] = useAIPagePreference('noteWrap', true);
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
  const [noteOrder, setNoteOrder] = useAIPagePreference('noteOrder', []);
  const [notePins, setNotePins] = useAIPagePreference('notePins', []);
  const [todayPinned, setTodayPinned] = useAIPagePreference(
    'todayPinned',
    true,
  );
  const toggleNotePin = (id: string) =>
    setNotePins((pins) =>
      pins.includes(id) ? pins.filter((value) => value !== id) : [...pins, id],
    );
  const editVersion = useRef(0);
  const privacyEpoch = useRef(0);
  const editor = useRef<NoteEditorHandle | null>(null);
  const titleInput = useRef<HTMLTextAreaElement>(null);
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
    if (
      currentDraft.current &&
      !currentDraft.current.todo &&
      !currentDraft.current.title
    )
      titleInput.current?.focus();
  }, [draft?.id]);
  const groups = useMemo(
    () =>
      Array.from(
        new Map(
          tabs
            .filter((tab) => !tab.archived)
            .map((tab) => [personalDataScope(tab), tab]),
        ).entries(),
      ),
    [tabs],
  );
  const refresh = useCallback(async () => {
    const epoch = privacyEpoch.current;
    const result = await window.electron.passwordManager({ action: 'notes' });
    if (epoch !== privacyEpoch.current) return;
    const summaries = result as VaultSummary[];
    setNotes(summaries);
    setLoaded(true);
  }, [scope]);
  useEffect(() => {
    refresh().catch((failure) =>
      setError(
        (/ENOSPC|no space left on device|disk (?:is )?full/i.test(
          String(failure.message),
        )
          ? renderFailureMessage(new Error(String(failure.message)))
          : String(failure.message)
        ).replace(
          /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/,
          '',
        ),
      ),
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
            String(failure.message),
          )
            ? renderFailureMessage(new Error(String(failure.message)))
            : String(failure.message)
          ).replace(
            /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/,
            '',
          ),
        ),
      );
    });
    return () => {
      stop?.();
    };
  }, [refresh]);
  useEffect(() => {
    const target = panelVisible && !dirty && !busy && draft && notes.some(note=>note.id===draft.id) && !draft.sensitive
      ? {id:draft.id,scope:draft.scope,kind:draft.todo ? 'todo' as const : 'note' as const} : undefined;
    window.electron.setActiveNote?.(target);
    return () => window.electron.setActiveNote?.(undefined);
  },[panelVisible,dirty,busy,draft?.id,draft?.scope,!!draft?.todo,draft?.sensitive,notes]);
  useEffect(() => {
    if(!panelVisible) return;
    let alive=true;
    let generation=0;
    const stop=window.electron.onPasswordManagerChanged?.(async () => {
      const revision=++generation;
      await refresh().catch(()=>{});
      const note=currentDraft.current;
      if (!alive || revision!==generation || !note || dirty || busy) return;
      const version=editVersion.current;
      try {
        const updated=await window.electron.passwordManager({action:'edit',id:note.id,scope:note.scope}) as VaultItem;
        if(alive && revision===generation && currentDraft.current?.id===note.id && currentDraft.current?.scope===note.scope && version===editVersion.current) {
          if(updated.notes !== currentDraft.current?.notes) setExternalNoteRevision(value=>value+1);
          setDraft(updated);
        }
      } catch { /* A deleted or locked target must not overwrite the editor. */ }
    });
    return()=>{alive=false;stop?.();};
  },[refresh,dirty,busy,panelVisible]);
  const save = useCallback(async () => {
    if (!draft || !dirty) return;
    if (!draft.title.trim() && !draft.notes?.trim() && !draft.todo?.items.length) { setDirty(false); return; }
    const version = editVersion.current;
    const epoch = privacyEpoch.current;
    const latest = draft.todo && notes.some(note => note.id === draft.id)
      ? ((await window.electron.passwordManager({
          action: 'edit',
          id: draft.id,
          scope: draft.scope,
        })) as VaultItem)
      : undefined;
    await window.electron.passwordManager({
      action: 'save',
      scope: draft.scope,
      item: {
        ...draft,
        ...(latest?.todo ? { todo: latest.todo } : {}),
        title: draft.title.trim() || 'Untitled note',
      },
    });
    if (epoch !== privacyEpoch.current) return;
    if (version === editVersion.current) setDirty(false);
    await refresh();
  }, [draft, dirty, refresh, notes]);
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
                failure.message,
              )
                ? renderFailureMessage(failure)
                : failure.message
              ).replace(
                /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/,
                '',
              )
            : 'Notes are unavailable.',
        );
      } finally {
        setBusy(false);
      }
    },
    [busy],
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
  const createTyped = (todo: boolean) =>
    run(async () => {
      restoredView.current = true;
      setShowToday(false);
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
        ...(todo ? { todo: { items: [] } } : {}),
        sensitive: false,
        allowAI: false,
      };
      setDraft(item);
      setDirty(false);
      await refresh();
      revealEditor();
    });
  const deleteNote = (note: {id:string;scope?:string;title:string}) => run(async () => {
    if (notes.some(item => item.id === note.id)) {
      if (currentDraft.current?.id === note.id) await save();
      await window.electron.passwordManager({action:'noteDelete',id:note.id,scope:note.scope});
    }
    if (currentDraft.current?.id === note.id) {
      editVersion.current += 1;
      setDraft(undefined);
      setDirty(false);
    }
    await refresh();
  });
  const create = () => createTyped(false);
  const createTodo = () => createTyped(true);
  const noteCreateActions = <>
    <ChromeIconButton icon={StickyNotePlus} label="New note" disabled={busy} onClick={create} />
    <ChromeIconButton icon={ListPlus} label="New to-do" disabled={busy} onClick={createTodo} />
  </>;
  const openToday = () =>
    run(async () => {
      restoredView.current = true;
      await save();
      rememberNoteView(scope, 'today');
      setShowToday(true);
      setDraft(undefined);
      setFocusTask(undefined);
      revealEditor();
    });
  const select = (note: VaultSummary) =>
    run(async () => {
      restoredView.current = true;
      const epoch = privacyEpoch.current;
      await save();
      const item = await window.electron.passwordManager({
        action: 'edit',
        id: note.id,
        scope: note.scope,
      });
      if (epoch !== privacyEpoch.current) return;
      const opened = item as VaultItem;
      rememberNoteView(scope, opened.id);
      setShowToday(false);
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
    const open = (event: Event) => {
      directNavigation.current = true;
      const navigation = takeTodoNavigation();
      if (navigation) setFocusTask(navigation.taskId);
      const id = navigation?.id || (event as CustomEvent<string>).detail;
      window.electron
        .passwordManager({ action: 'notes' })
        .then((result) => {
          const note = (result as VaultSummary[]).find(
            (entry) => entry.id === id,
          );
          if (note) select(note);
        })
        .catch(() => setError('Note unavailable.'));
    };
    window.addEventListener('kudiumbrowser-open-note', open);
    const pending = takeTodoNavigation();
    if (pending) {
      setFocusTask(pending.taskId);
      open(new CustomEvent('kudiumbrowser-open-note', { detail: pending.id }));
    }
    return () => {
      window.removeEventListener('kudiumbrowser-open-note', open);
    };
  });
  useEffect(() => {
    if (!loaded || restoredView.current) return;
    restoredView.current = true;
    if (directNavigation.current || currentDraft.current) return;
    const id = lastNoteView(scope);
    const note = notes.find(note => note.id === id && !note.sensitive &&
      (scope === 'all' || (scope === 'browser' ? !note.scope : !note.scope || note.scope === scope)));
    if (note) void select(note);
  }, [loaded, notes, scope]);
  useEffect(() => {
    if (draft?.id && !draft.sensitive) rememberNoteView(scope, draft.id);
  }, [draft?.id, draft?.sensitive, scope]);
  const update = (patch: Partial<VaultItem>) => {
    editVersion.current += 1;
    setError('');
    setDraft((value) => value && { ...value, ...patch });
    setDirty(true);
  };
  const orderedNotes = [...notes].sort((a, b) => {
    const pinned =
      Number(notePins.includes(b.id)) - Number(notePins.includes(a.id));
    if (pinned) return pinned;
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
        currentDraft.current?.id === note.id && !currentDraft.current.todo
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
        current?.id === note.id ? { ...current, title } : current,
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
      contentClassName="notes-group-filter-popover"
      disabled={busy}
      value={scope}
      onChange={setScope}
      options={[
        { id: 'all', name: 'All notes' },
        { id: 'browser', name: 'Personal notes' },
        ...groups.map(([id, tab]) => ({
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
        note.title.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 100);
  return (
    <section
      ref={pageElement}
      className={`notes-page ${historyOpen ? 'ai-history-open' : ''} ${
        historyPinned ? 'ai-history-pinned' : ''
      } ${draft || showToday ? 'notes-has-draft' : 'notes-library-only'}`}
      aria-label="Notes"
    >
      <AssistantPageHeader className="notes-toolbar" edgeToEdge>
        {historyOpen ? (
          <span className="notes-rail-header-space" aria-hidden="true" />
        ) : draft || showToday ? (
          <HistoryToolbar
            toggleRef={historyToggle}
            open={historyOpen}
            label="Note history"
            panelId="notes-history-panel"
            busy={busy}
            onOpen={() => setHistoryOpen(true)}
            onNew={create}
            newLabel="New note"
            newActions={<></>}
          />
        ) : (
          <h2>Notes</h2>
        )}
        {!historyOpen && groupFilter}
        <div className="notes-toolbar-spacer" />
        {!historyOpen && noteCreateActions}
        {draft && (
          <>
            {!draft.todo && (
              <EditorViewSwitch
                label="Change note view"
                value={markdownMode ? 'markdown' : 'visual'}
                onChange={(view) => {
                  setMarkdownMode(view === 'markdown');
                  setTextSelected(false);
                }}
              />
            )}
            <Popover.Root open={optionsOpen} onOpenChange={setOptionsOpen}>
              <Popover.Trigger>
                <ChromeIconButton icon={MoreHorizontal} label="Note options" />
              </Popover.Trigger>
              <PanelPopoverContent className="notes-options-popup" size="1">
                <div className="notes-display-options">
                  {!draft.todo && !markdownMode && (
                    <div
                      className="notes-format"
                      aria-label={
                        textSelected
                          ? 'Format selected text'
                          : 'Note formatting'
                      }
                    >
                      {[
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
                              setOptionsOpen(false);
                            }}
                          >
                            <Glyph size={14} />
                          </IconButton>
                        );
                      })}
                    </div>
                  )}
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
                  {markdownMode && (
                    <label className="notes-option-row">
                      <span>Wrap text</span>
                      <Switch
                        size="1"
                        checked={wrap}
                        onCheckedChange={setWrap}
                      />
                    </label>
                  )}
                </div>
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
                            current && { ...current, scope: destination },
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
                        (current) => current && { ...current, sensitive },
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
                    deleteNote(draft);
                  }}
                >
                  <Trash2 size={14} />
                  Delete note
                </Button>
                <span className="notes-save-status" aria-live="polite">
                  {busy ? 'Saving…' : dirty ? 'Edited' : 'All changes saved'}
                </span>
              </PanelPopoverContent>
            </Popover.Root>
          </>
        )}
      </AssistantPageHeader>
      {historyOpen && (
        <div
          ref={history}
          id="notes-history-panel"
          className="ai-chat-history-panel notes-history-panel"
        >
          <HistorySidebarFrame
            title="Notes"
            titleContent={groupFilter}
            label="Note history"
            pinned={historyPinned}
            busy={busy}
            onPin={() => setHistoryPinned(!historyPinned)}
            onClose={() => {
              setHistoryOpen(false);
              requestAnimationFrame(() => historyToggle.current?.focus());
            }}
            onNew={create}
            newActions={noteCreateActions}
          >
            <div className="notes-search-controls">
              <HistorySearchInput
                label="Search note titles"
                placeholder="Search notes"
                value={query}
                onChange={setQuery}
              />
            </div>
            <NotesHistoryList
              notes={visible}
              groupNames={Object.fromEntries(
                groups.map(([id, tab]) => [id, tab.sessionName || tab.name]),
              )}
              pinnedIds={notePins}
              onPin={toggleNotePin}
              todayPinned={todayPinned}
              onTodayPin={() => setTodayPinned(!todayPinned)}
              onToday={openToday}
              todaySelected={showToday}
              selectedId={draft?.id}
              busy={busy}
              searching={!!query}
              onSelect={select}
              onRename={renameNote}
              onDelete={deleteNote}
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
      <div
        className={`notes-editor ${showToday || draft?.todo ? 'notes-editor-todos' : ''}`}
        hidden={!draft && !showToday && historyOpen && !historyPinned}
        style={{ '--note-font-size': `${fontSize}px` } as CSSProperties}
      >
        {showToday ? (
          <TodayTodos
            scope={scope !== 'all' && scope !== 'browser' ? scope : undefined}
            all={scope === 'all'}
          />
        ) : draft ? (
          <>
            <textarea
              ref={titleInput}
              className="notes-title"
              aria-label="Note title"
              placeholder="Title"
              maxLength={120}
              rows={1}
              value={draft.title}
              onChange={(event) =>
                update({ title: event.target.value.replace(/\r?\n/g, ' ') })
              }
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
            {draft.todo ? (
              <TodoList
                noteId={draft.id}
                data={draft.todo}
                initialNote={notes.some(note => note.id === draft.id) ? undefined : draft}
                scope={draft.scope}
                focusTask={focusTask}
                onChanged={async () => {
                  const id = draft.id;
                  const item = (await window.electron.passwordManager({
                    action: 'edit',
                    id,
                    scope: draft.scope,
                  })) as VaultItem;
                  setDraft((current) =>
                    current?.id === id
                      ? { ...current, todo: item.todo }
                      : current,
                  );
                  await refresh();
                }}
              />
            ) : markdownMode ? (
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
                    <FileText size={15} aria-hidden="true" />
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
                    externalRevision={externalNoteRevision}
                    onChange={(markdown) => update({ notes: markdown })}
                  />
                </Suspense>
              </RenderErrorBoundary>
            )}
          </>
        ) : historyOpen && historyPinned ? (
          <p className="notes-sidebar-empty">Select a note to start reading.</p>
        ) : (
          !historyOpen && (
            <div className="notes-landing-list">
              <div className="notes-search-controls">
                <HistorySearchInput
                  label="Search note titles"
                  placeholder="Search notes"
                  value={query}
                  onChange={setQuery}
                />
              </div>
              <NotesHistoryList
                notes={visible}
                groupNames={Object.fromEntries(
                  groups.map(([id, tab]) => [id, tab.sessionName || tab.name]),
                )}
                pinnedIds={notePins}
                onPin={toggleNotePin}
                todayPinned={todayPinned}
                onTodayPin={() => setTodayPinned(!todayPinned)}
                onToday={openToday}
                todaySelected={showToday}
                selectedId={undefined}
                busy={busy}
                searching={!!query}
                onSelect={select}
                onRename={renameNote}
                onDelete={deleteNote}
                onReorder={reorder}
              />
            </div>
          )
        )}
      </div>

    </section>
  );
}

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
  Switch,
  Popover,
  Dialog,
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
  CaseSensitive,
  LockKeyhole,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useAIPagePreference } from '../../utils/useAIPagePreference';
import type { IApp } from '../../types';
import type { VaultItem, VaultSummary } from '../../browser/passwordManager';
import { personalDataScope } from '../../utils/groups';
import { HistorySidebarFrame, HistoryToolbar } from './HistorySidebarFrame';
import { PanelPopoverContent, PanelDialogContent } from './PanelDialog';
import { GroupPicker } from './GroupPicker';
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
  const [notes, setNotes] = useState<VaultSummary[]>([]);
  const [draft, setDraft] = useState<VaultItem>();
  const currentDraft = useRef<VaultItem>();
  currentDraft.current = draft;
  const [query, setQuery] = useState('');
  const [scope] = useState(initialScope || 'all');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPinned, setHistoryPinned] = useState(false);
  const [fontSize, setFontSize] = useAIPagePreference('noteFontSize', 16);
  const [formatOpen, setFormatOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const history = useRef<HTMLDivElement>(null);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const [textSelected, setTextSelected] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const editVersion = useRef(0);
  const privacyEpoch = useRef(0);
  const editor = useRef<NoteEditorHandle>(null);
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
    if (epoch === privacyEpoch.current) setNotes(result as VaultSummary[]);
  }, []);
  useEffect(() => {
    refresh().catch((failure) =>
      setError(
        String(failure.message).replace(
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
          String(failure.message).replace(
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
            ? failure.message.replace(
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
        !target.closest('[aria-controls="notes-history-panel"]')
      )
        setHistoryOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistoryOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [historyOpen, historyPinned]);
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
      if (!historyPinned) setHistoryOpen(false);
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
      setDraft(item as VaultItem);
      setDirty(false);
      if (!historyPinned) setHistoryOpen(false);
    });
  const update = (patch: Partial<VaultItem>) => {
    editVersion.current += 1;
    setError('');
    setDraft((value) => value && { ...value, ...patch });
    setDirty(true);
  };
  const visible = notes
    .filter(
      (note) =>
        (scope === 'all' ||
          (scope === 'browser' ? !note.scope : note.scope === scope)) &&
        note.title.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 100);
  return (
    <section
      className={`notes-page ${historyOpen ? 'ai-history-open' : ''} ${
        historyPinned ? 'ai-history-pinned' : ''
      }`}
      aria-label="Notes"
    >
      <div className="notes-toolbar">
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
        <div className="notes-toolbar-spacer" />
        {draft && (
          <>
            {dirty && !textSelected && (
              <span className="notes-save-status" aria-live="polite">
                {busy ? 'Saving…' : 'Edited'}
              </span>
            )}
            {textSelected && (
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
            {!textSelected && (
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
                <GroupPicker
                  label="Assign note to group"
                  disabled={busy}
                  value={draft.scope || 'browser'}
                  options={[
                    { id: 'browser', name: 'Personal note' },
                    ...groups.map(([id, tab]) => ({
                      id,
                      name: tab.sessionName || tab.name,
                      group: tab,
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
                    setDeleting(true);
                  }}
                >
                  <Trash2 size={14} />
                  Delete note
                </Button>
              </PanelPopoverContent>
            </Popover.Root>
          </>
        )}
      </div>
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
            <TextField.Root
              size="1"
              aria-label="Search note titles"
              placeholder="Search notes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="ai-chat-history-list">
              {visible.map((note) => (
                <div className="ai-chat-history-row" key={note.id}>
                  <button
                    type="button"
                    aria-pressed={draft?.id === note.id}
                    disabled={busy}
                    onClick={() => select(note)}
                  >
                    <span>{note.title || 'Untitled note'}</span>
                    {note.sensitive && (
                      <LockKeyhole size={12} aria-label="Locked note" />
                    )}
                  </button>
                </div>
              ))}
            </div>
            {notes.length > visible.length && (
              <small>Search to find more notes.</small>
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
        className="notes-editor"
        style={{ '--note-font-size': `${fontSize}px` } as CSSProperties}
      >
        {draft ? (
          <>
            <TextField.Root
              className="notes-title"
              aria-label="Note title"
              placeholder="Title"
              maxLength={120}
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
            />
            <Suspense
              fallback={<div aria-label="Loading note editor" role="status" />}
            >
              <MarkdownNoteEditor
                key={draft.id}
                ref={editor}
                onSelectionChange={setTextSelected}
                markdown={draft.notes || ''}
                onChange={(markdown) => update({ notes: markdown })}
              />
            </Suspense>
          </>
        ) : (
          <div className="notes-empty">
            <span>Select a note or create a new one.</span>
            <Button size="1" variant="ghost" disabled={busy} onClick={create}>
              Create note
            </Button>
          </div>
        )}
      </div>
      <Dialog.Root open={deleting} onOpenChange={setDeleting}>
        <PanelDialogContent
          className="notes-delete-dialog"
          size="1"
          maxWidth="360px"
        >
          <Dialog.Title size="3">Delete note?</Dialog.Title>
          <Dialog.Description size="2">
            This permanently removes this note from Personal Data.
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
                  if (!draft) return;
                  await window.electron.passwordManager({
                    action: 'delete',
                    id: draft.id,
                    scope: draft.scope,
                  });
                  setDraft(undefined);
                  setDirty(false);
                  setDeleting(false);
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

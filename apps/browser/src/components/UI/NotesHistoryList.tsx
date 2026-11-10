import { useEffect, useRef, useState } from 'react';
import { TextField } from '@radix-ui/themes';
import { Check, X, Pencil, Trash2, LockKeyhole } from 'lucide-react';
import type { VaultSummary } from '../../browser/passwordManager';
import { NativeContextMenu as ContextMenu } from './NativeContextMenu';

export function NotesHistoryList({
  notes,
  groupNames,
  selectedId,
  busy,
  searching,
  onSelect,
  onRename,
  onDelete,
  onReorder,
}: {
  notes: VaultSummary[];
  groupNames: Record<string, string>;
  selectedId: string | undefined;
  busy: boolean;
  searching: boolean;
  onSelect: (note: VaultSummary) => void;
  onRename: (note: VaultSummary, title: string) => Promise<boolean>;
  onDelete: (note: VaultSummary) => void;
  onReorder: (id: string, beforeId: string | null) => void;
}) {
  const selectionTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(selectionTimer.current), []);
  useEffect(() => {
    if (busy) clearTimeout(selectionTimer.current);
  }, [busy]);
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState('');
  const [dragging, setDragging] = useState<string>();
  const rename = (note: VaultSummary) => {
    clearTimeout(selectionTimer.current);
    setName(note.title);
    setEditing(note.id);
  };
  const move = (index: number, direction: number) => {
    if (
      busy ||
      searching ||
      index + direction < 0 ||
      index + direction >= notes.length
    )
      return;
    onReorder(
      notes[index].id,
      direction < 0 ? notes[index - 1].id : notes[index + 2]?.id || null
    );
  };
  return (
    <div className="ai-chat-history-list">
      {!notes.length && (
        <p className="notes-list-empty">
          {searching ? 'No matching notes' : 'No notes yet'}
        </p>
      )}
      {notes.map((note, index) => (
        <ContextMenu.Root key={note.id}>
          <ContextMenu.Trigger>
            <div
              className={`ai-chat-history-row notes-history-row${
                dragging === note.id ? ' ai-chat-dragging' : ''
              }`}
              draggable={!busy && !searching && editing !== note.id}
              onDragStart={(event) => {
                clearTimeout(selectionTimer.current);
                setDragging(note.id);
                event.dataTransfer.setData(
                  'application/x-kudiumbrowser-note',
                  note.id
                );
                event.dataTransfer.effectAllowed = 'move';
                event.stopPropagation();
              }}
              onDragEnd={() => setDragging(undefined)}
              onDragOver={(event) => {
                if (dragging && !busy && !searching) {
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(event) => {
                if (!dragging || busy || searching || dragging === note.id)
                  return;
                event.preventDefault();
                event.stopPropagation();
                const bounds = event.currentTarget.getBoundingClientRect();
                const remaining = notes.filter((item) => item.id !== dragging);
                const target = remaining.findIndex(
                  (item) => item.id === note.id
                );
                onReorder(
                  dragging,
                  event.clientY > bounds.top + bounds.height / 2
                    ? remaining[target + 1]?.id || null
                    : note.id
                );
                setDragging(undefined);
              }}
            >
              {editing === note.id ? (
                <form
                  className="ai-chat-rename"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (name.trim() && (await onRename(note, name.trim())))
                      setEditing(undefined);
                  }}
                >
                  <TextField.Root
                    autoFocus
                    aria-label="Note name"
                    value={name}
                    maxLength={120}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.stopPropagation();
                        setEditing(undefined);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    aria-label="Save note name"
                    disabled={busy || !name.trim()}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel rename"
                    disabled={busy}
                    onClick={() => setEditing(undefined)}
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    title={note.title || 'Untitled note'}
                    aria-label={note.title || 'Untitled note'}
                    aria-pressed={selectedId === note.id}
                    disabled={busy}
                    onClick={(event) => {
                      clearTimeout(selectionTimer.current);
                      if (event.detail === 0) onSelect(note);
                      else if (event.detail === 1)
                        selectionTimer.current = setTimeout(
                          () => onSelect(note),
                          350
                        );
                    }}
                    onDoubleClick={() => rename(note)}
                    onKeyDown={(event) => {
                      if (event.key === 'F2') {
                        event.preventDefault();
                        rename(note);
                      }
                      if (
                        event.altKey &&
                        ['ArrowUp', 'ArrowDown'].includes(event.key)
                      ) {
                        event.preventDefault();
                        move(index, event.key === 'ArrowUp' ? -1 : 1);
                      }
                    }}
                  >
                    <span className="notes-row-copy">
                      <span className="notes-row-title">
                        {note.title || 'Untitled note'}
                      </span>
                      <span className="notes-row-preview">
                        {note.scope
                          ? groupNames[note.scope] || 'Unavailable group'
                          : note.sensitive
                            ? 'Locked note'
                            : note.preview?.trim() || 'Personal note'}
                      </span>
                    </span>
                    {note.asRead === false && (
                      <span
                        className="notes-unread-dot"
                        aria-label="Unread note"
                      />
                    )}
                    {note.sensitive && (
                      <LockKeyhole size={12} aria-label="Locked note" />
                    )}
                  </button>
                  <div className="ai-chat-row-actions">
                    <button
                      type="button"
                      aria-label={`Rename ${note.title}`}
                      title="Rename note"
                      disabled={busy}
                      onClick={() => rename(note)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${note.title}`}
                      title="Delete note"
                      disabled={busy}
                      onClick={() => {
                        clearTimeout(selectionTimer.current);
                        onDelete(note);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Content>
            <ContextMenu.Item disabled={busy} onSelect={() => onSelect(note)}>
              Open note
            </ContextMenu.Item>
            <ContextMenu.Item disabled={busy} onSelect={() => rename(note)}>
              Rename note
            </ContextMenu.Item>
            <ContextMenu.Item
              disabled={busy || searching || index === 0}
              onSelect={() => move(index, -1)}
            >
              Move up
            </ContextMenu.Item>
            <ContextMenu.Item
              disabled={busy || searching || index === notes.length - 1}
              onSelect={() => move(index, 1)}
            >
              Move down
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item
              disabled={busy}
              onSelect={() => {
                clearTimeout(selectionTimer.current);
                onDelete(note);
              }}
            >
              Delete note
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Root>
      ))}
    </div>
  );
}

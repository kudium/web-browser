import { useState } from 'react';
import { TextField } from '@radix-ui/themes';
import {
  Check,
  X,
  Pencil,
  Trash2,
  LockKeyhole,
  ListTodo,
  Sun,
  Pin,
} from 'lucide-react';
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
  onToday,
  todaySelected = false,
  pinnedIds = [],
  onPin,
  todayPinned = true,
  onTodayPin,
}: {
  pinnedIds?: string[];
  onPin?: (id: string) => void;
  todayPinned?: boolean;
  onTodayPin?: () => void;
  onToday?: () => void;
  todaySelected?: boolean;
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
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState('');
  const [dragging, setDragging] = useState<string>();
  const rename = (note: VaultSummary) => {
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
      direction < 0 ? notes[index - 1].id : notes[index + 2]?.id || null,
    );
  };
  const todayRow = onToday ? (
    <ContextMenu.Root
      menu={() => (
        <ContextMenu.Content>
          <ContextMenu.Item
            disabled={busy || !onTodayPin}
            onSelect={onTodayPin}
          >
            {todayPinned ? 'Unpin note' : 'Pin note'}
          </ContextMenu.Item>
        </ContextMenu.Content>
      )}
    >
      <ContextMenu.Trigger>
        {' '}
        <div className="notes-history-row notes-today-row">
          <button
            type="button"
            aria-label="Today todo"
            aria-pressed={todaySelected}
            disabled={busy}
            onClick={onToday}
          >
            <Sun size={16} aria-hidden="true" />
            <span className="notes-row-copy">
              <span className="notes-row-title">Today</span>
            </span>
            {todayPinned && (
              <Pin size={12} className="notes-today-pin" aria-label="Pinned" />
            )}
          </button>
        </div>
      </ContextMenu.Trigger>
    </ContextMenu.Root>
  ) : null;
  return (
    <div className="ai-chat-history-list">
      {todayPinned && todayRow}
      {!notes.length && (
        <p className="notes-list-empty">
          {searching ? 'No matching notes' : 'No notes yet'}
        </p>
      )}
      {notes.map((note, index) => (
        <ContextMenu.Root
          key={note.id}
          menu={() => (
            <ContextMenu.Content>
              <ContextMenu.Item disabled={busy} onSelect={() => onSelect(note)}>
                Open note
              </ContextMenu.Item>
              {onPin && (
                <ContextMenu.Item
                  disabled={busy}
                  onSelect={() => onPin(note.id)}
                >
                  {pinnedIds.includes(note.id) ? 'Unpin note' : 'Pin note'}
                </ContextMenu.Item>
              )}
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
                  onDelete(note);
                }}
              >
                Delete note
              </ContextMenu.Item>
            </ContextMenu.Content>
          )}
        >
          <ContextMenu.Trigger>
            <div
              className={`ai-chat-history-row notes-history-row${
                dragging === note.id ? ' ai-chat-dragging' : ''
              }`}
              draggable={!busy && !searching && editing !== note.id}
              onDragStart={(event) => {
                setDragging(note.id);
                event.dataTransfer.setData(
                  'application/x-kudiumbrowser-note',
                  note.id,
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
                  (item) => item.id === note.id,
                );
                onReorder(
                  dragging,
                  event.clientY > bounds.top + bounds.height / 2
                    ? remaining[target + 1]?.id || null
                    : note.id,
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
                    onClick={() => onSelect(note)}
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
                            : note.preview?.trim() || ''}
                      </span>
                    </span>
                    <span className="notes-row-badges">
                      {pinnedIds.includes(note.id) && (
                        <Pin size={12} aria-label="Pinned" />
                      )}
                      {note.asRead === false && (
                        <span
                          className="notes-unread-dot"
                          aria-label="Unread note"
                        />
                      )}
                      {note.noteType === 'todo' && (
                        <ListTodo size={12} aria-label="Todo list" />
                      )}
                      {note.sensitive && (
                        <LockKeyhole size={12} aria-label="Locked note" />
                      )}
                    </span>
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
        </ContextMenu.Root>
      ))}
      {!todayPinned && todayRow}
    </div>
  );
}

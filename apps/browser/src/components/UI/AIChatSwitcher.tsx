import { useEffect, useRef, useState } from 'react';
import { TextField } from '@radix-ui/themes';
import { Search, Trash2, Pencil, Check, X } from 'lucide-react';
import { StorageRecoveryAction } from './StorageRecoveryAction';
import { HistorySidebarFrame } from './HistorySidebarFrame';
import type {
  AIConversationsState,
  AIConversationRequest,
} from '../../browser/aiConversations';

export function AIChatSwitcher({
  state,
  busy,
  changing,
  onChange,
  pinned,
  onPin,
  onClose,
}: {
  state: AIConversationsState;
  busy: boolean;
  changing: boolean;
  onChange: (request: AIConversationRequest) => Promise<void>;
  pinned: boolean;
  onPin: () => void;
  onClose: () => void;
}) {
  const history = useRef<HTMLElement>(null);
  const dismissalGeneration = useRef(0);
  const dismissalTimer = useRef<ReturnType<typeof setTimeout>>();
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(
    () => () => {
      dismissalGeneration.current += 1;
      clearTimeout(dismissalTimer.current);
    },
    []
  );
  useEffect(() => {
    if (pinned) return undefined;
    const dismissOutside = (event: PointerEvent) => {
      const { target } = event;
      if (
        !(target instanceof Element) ||
        history.current?.contains(target) ||
        target.closest('[aria-controls="ai-chat-history-panel"]')
      )
        return;
      dismissalGeneration.current += 1;
      clearTimeout(dismissalTimer.current);
      onClose();
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    return () =>
      document.removeEventListener('pointerdown', dismissOutside, true);
  }, [pinned, onClose]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !editing) {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [onClose, editing]);
  useEffect(() => {
    if (pinned || editing) {
      dismissalGeneration.current += 1;
      clearTimeout(dismissalTimer.current);
    }
  }, [pinned, editing]);
  const choose = async (
    request: AIConversationRequest,
    allowRename = false
  ) => {
    dismissalGeneration.current += 1;
    const generation = dismissalGeneration.current;
    await onChange(request);
    if (generation !== dismissalGeneration.current) return;
    if (!pinned && request.action === 'select') {
      clearTimeout(dismissalTimer.current);
      if (allowRename) dismissalTimer.current = setTimeout(onClose, 500);
      else onClose();
    } else if (!pinned && request.action === 'create') onClose();
  };
  return (
    <HistorySidebarFrame
      sidebarRef={history}
      title="Chats"
      label="Chat history"
      pinned={pinned}
      busy={busy || changing}
      onPin={onPin}
      onClose={onClose}
      onNew={() => choose({ action: 'create' })}
    >
      <TextField.Root
        aria-label="Search chats"
        placeholder="Search chats"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      >
        <TextField.Slot>
          <Search size={14} />
        </TextField.Slot>
      </TextField.Root>
      <div className="ai-chat-history-list">
        {state.conversations
          .filter((chat) =>
            chat.title.toLowerCase().includes(query.toLowerCase())
          )
          .map((chat) => (
            <div
              className={`ai-chat-history-row${
                dragging === chat.id ? ' ai-chat-dragging' : ''
              }`}
              key={chat.id}
              draggable={!busy && !changing && editing !== chat.id && !query}
              onDragStart={(event) => {
                clearTimeout(dismissalTimer.current);
                setDragging(chat.id);
                event.dataTransfer.setData(
                  'application/x-kudiumbrowser-ai-chat',
                  chat.id
                );
                event.dataTransfer.effectAllowed = 'move';
                event.stopPropagation();
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => {
                if (dragging) {
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(event) => {
                if (!dragging) return;
                event.preventDefault();
                event.stopPropagation();
                const bounds = event.currentTarget.getBoundingClientRect();
                const remaining = state.conversations.filter(
                  (item) => item.id !== dragging
                );
                const index = remaining.findIndex(
                  (item) => item.id === chat.id
                );
                if (index >= 0)
                  onChange({
                    action: 'reorder',
                    id: dragging,
                    beforeId:
                      event.clientY > bounds.top + bounds.height / 2
                        ? remaining[index + 1]?.id ?? null
                        : chat.id,
                  });
                setDragging(null);
              }}
            >
              {editing === chat.id ? (
                <form
                  className="ai-chat-rename"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!name.trim()) return;
                    await onChange({
                      action: 'rename',
                      id: chat.id,
                      title: name.trim(),
                    });
                    setEditing(null);
                  }}
                >
                  <TextField.Root
                    autoFocus
                    aria-label="Chat name"
                    value={name}
                    maxLength={70}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.stopPropagation();
                        setEditing(null);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    aria-label="Save chat name"
                    disabled={!name.trim() || changing}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel rename"
                    onClick={() => setEditing(null)}
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    aria-pressed={chat.id === state.selectedId}
                    disabled={busy}
                    title={chat.title}
                    onClick={(event) => {
                      clearTimeout(dismissalTimer.current);
                      if (changing || event.detail > 1) return;
                      choose(
                        { action: 'select', id: chat.id },
                        event.detail !== 0
                      );
                    }}
                    onDoubleClick={() => {
                      dismissalGeneration.current += 1;
                      clearTimeout(dismissalTimer.current);
                      setName(chat.title);
                      setEditing(chat.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'F2') {
                        event.preventDefault();
                        setName(chat.title);
                        setEditing(chat.id);
                      }
                      if (
                        event.altKey &&
                        (event.key === 'ArrowUp' ||
                          event.key === 'ArrowDown') &&
                        !busy &&
                        !changing &&
                        !query
                      ) {
                        event.preventDefault();
                        const index = state.conversations.findIndex(
                          (item) => item.id === chat.id
                        );
                        if (event.key === 'ArrowUp' && index > 0)
                          onChange({
                            action: 'reorder',
                            id: chat.id,
                            beforeId: state.conversations[index - 1].id,
                          });
                        if (
                          event.key === 'ArrowDown' &&
                          index < state.conversations.length - 1
                        )
                          onChange({
                            action: 'reorder',
                            id: chat.id,
                            beforeId:
                              state.conversations[index + 2]?.id ?? null,
                          });
                      }
                    }}
                  >
                    <span>{chat.title}</span>
                    {chat.paused && <small>Paused</small>}
                  </button>
                  <div className="ai-chat-row-actions">
                    <button
                      type="button"
                      aria-label={`Rename ${chat.title}`}
                      title="Rename chat"
                      disabled={changing}
                      onClick={() => {
                        setName(chat.title);
                        setEditing(chat.id);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${chat.title}`}
                      title="Delete chat"
                      disabled={busy || changing}
                      onClick={() => choose({ action: 'delete', id: chat.id })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        {!state.conversations.some((chat) =>
          chat.title.toLowerCase().includes(query.toLowerCase())
        ) && <p>No matching chats.</p>}
      </div>
      {busy && (
        <p className="ai-chat-history-note">
          Finish or stop the current task to switch chats.
        </p>
      )}
      {state.storageNotice && (
        <p className="ai-chat-history-note">
          {state.storageNotice}
          <StorageRecoveryAction message={state.storageNotice} />
        </p>
      )}
    </HistorySidebarFrame>
  );
}

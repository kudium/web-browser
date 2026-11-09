/* Functional defaults handle optional props. */
/* eslint-disable react/require-default-props */
import type { ReactNode, RefObject } from 'react';
import { Pin, Plus, PanelLeftClose, PanelLeft } from 'lucide-react';

export function HistorySidebarFrame({
  title,
  label,
  pinned,
  busy,
  onPin,
  onClose,
  onNew,
  children,
  sidebarRef,
}: {
  title: string;
  label: string;
  pinned: boolean;
  busy: boolean;
  onPin: () => void;
  onClose: () => void;
  onNew: () => void;
  children: ReactNode;
  sidebarRef?: RefObject<HTMLElement>;
}) {
  return (
    <aside ref={sidebarRef} className="ai-chat-history" aria-label={label}>
      <div className="ai-chat-history-heading">
        <strong>{title}</strong>
        <button
          type="button"
          aria-label={`${pinned ? 'Unpin' : 'Pin'} ${label.toLowerCase()}`}
          title={`${pinned ? 'Unpin' : 'Pin'} ${label.toLowerCase()}`}
          aria-pressed={pinned}
          onClick={onPin}
        >
          <Pin size={15} />
        </button>
        <button
          type="button"
          aria-label={`Close ${label.toLowerCase()}`}
          title={`Close ${label.toLowerCase()}`}
          onClick={onClose}
        >
          <PanelLeftClose size={15} />
        </button>
        <button
          type="button"
          aria-label={title === 'Chats' ? 'Start new chat' : 'New note'}
          disabled={busy}
          onClick={onNew}
        >
          <Plus size={16} />
        </button>
      </div>
      {children}
    </aside>
  );
}

export function HistoryToolbar({
  open,
  label,
  panelId,
  busy,
  onOpen,
  onNew,
  newLabel,
  toggleRef,
}: {
  open: boolean;
  label: string;
  panelId: string;
  busy: boolean;
  onOpen: () => void;
  onNew: () => void;
  newLabel: string;
  toggleRef?: RefObject<HTMLButtonElement>;
}) {
  if (open) return null;
  return (
    <div className="history-toolbar">
      <button
        type="button"
        ref={toggleRef}
        aria-label={label}
        title={label}
        aria-expanded={false}
        aria-controls={panelId}
        onClick={onOpen}
      >
        <PanelLeft size={15} />
      </button>
      <button
        type="button"
        aria-label={newLabel}
        title={newLabel}
        disabled={busy}
        onClick={onNew}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

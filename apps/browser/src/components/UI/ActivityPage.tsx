import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { AssistantPageHeader } from './AssistantPageHeader';
import { ChromeIconButton } from './ChromeIconButton';
import type { BrowserActivity } from '../../browser/activity';

function activityTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function ActivityPage({ active }: { active: boolean }) {
  const [entries, setEntries] = useState<BrowserActivity[]>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const target = useRef<string>();
  const refresh = useCallback(async () => {
    if (!window.electron.activity) return;
    try {
      setEntries((await window.electron.activity({ action: 'list' })) || []);
    } catch {
      setError('Activity is unavailable.');
    }
  }, []);
  const read = useCallback(
    async (id: string) => {
      try {
        await window.electron.activity({ action: 'read', id });
        setSelected(id);
        setError('');
        await refresh();
      } catch {
        setError('Activity could not be opened.');
      }
    },
    [refresh]
  );
  useEffect(() => {
    refresh();
    const stop = window.electron.onActivityChanged?.(refresh);
    const open = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id !== 'string') return;
      target.current = id;
      read(id);
    };
    window.addEventListener('kudiumbrowser-open-activity', open);
    return () => {
      stop?.();
      window.removeEventListener('kudiumbrowser-open-activity', open);
    };
  }, [refresh, read]);
  useEffect(() => {
    if (!active) return;
    refresh();
    if (target.current) {
      document
        .getElementById(`activity-${target.current}`)
        ?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [active, entries.length, refresh]);
  return (
    <section className="activity-page" aria-label="Activity workspace">
      <AssistantPageHeader className="activity-heading">
        <h2>Activity</h2>
        <button
          type="button"
          className="activity-read-all"
          disabled={!entries.some((entry) => !entry.asRead)}
          onClick={async () => {
            try {
              await window.electron.activity({ action: 'readAll' });
              await refresh();
            } catch {
              setError('Activity could not be marked read.');
            }
          }}
        >
          Mark all read
        </button>
      </AssistantPageHeader>
      {error && <p role="alert">{error}</p>}
      {!entries.length && !error && <p>No activity yet</p>}
      <div className="activity-list">
        {entries.map((entry) => (
          <article
            id={`activity-${entry.id}`}
            key={entry.id}
            className={`activity-item${
              selected === entry.id ? ' activity-selected' : ''
            }`}
          >
            <button
              type="button"
              className="activity-summary"
              aria-label={entry.title}
              onClick={() => {
                if (entry.noteId) {
                  read(entry.id);
                  window.dispatchEvent(
                    new CustomEvent('kudiumbrowser-open-note', {
                      detail: entry.noteId,
                    })
                  );
                } else if (entry.url) {
                  read(entry.id);
                  window.open(entry.url, '_blank', 'noopener,noreferrer');
                } else if (selected === entry.id) setSelected(undefined);
                else read(entry.id);
              }}
              aria-expanded={
                entry.noteId || entry.url ? undefined : selected === entry.id
              }
            >
              <span className="activity-title">{entry.title}</span>
              {!entry.asRead && (
                <span
                  className="notes-unread-dot"
                  aria-label="Unread activity"
                />
              )}
              <time
                dateTime={new Date(entry.createdAt).toISOString()}
                title={new Date(entry.createdAt).toLocaleString()}
              >
                {activityTime(entry.createdAt)}
              </time>
            </button>
            <p className="activity-message">{entry.message}</p>
            <div className="activity-actions">
              <small className="activity-source">
                {entry.source === 'hook' ? 'Page hook' : 'Assistant'}
              </small>

              {(entry.noteId || entry.url) && (
                <span className="activity-destination">
                  {entry.noteId ? 'Note' : 'Page'}
                </span>
              )}
              <ChromeIconButton
                icon={Copy}
                label="Copy link"
                className="activity-copy"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `#kudiumbrowser-activity-${entry.id}`
                    );
                  } catch {
                    setError('Link could not be copied.');
                  }
                }}
              />
              <ChromeIconButton
                icon={Trash2}
                label="Delete activity"
                className="activity-delete"
                onClick={async () => {
                  try {
                    await window.electron.activity({
                      action: 'delete',
                      id: entry.id,
                    });
                    if (selected === entry.id) setSelected(undefined);
                    setError('');
                    await refresh();
                  } catch {
                    setError('Activity could not be deleted.');
                  }
                }}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

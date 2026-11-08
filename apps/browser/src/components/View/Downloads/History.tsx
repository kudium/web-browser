import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, Tooltip } from '@radix-ui/themes';
import { Globe, X } from 'lucide-react';
import { SearchControl } from '../../UI/FormControls';
import { LibraryHeader } from './LibraryHeader';
import { browser } from '../../../browser/client';
import { HistoryRecord, HistoryAction } from '../../../browser/history';
import { downloadDateGroup } from '../../../browser/downloads';

export function History({ navigate }: { navigate: (url: string) => void }) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);
  const [error, setError] = useState('');
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    const stop = browser.onHistory((next) => {
      if (alive) setRecords(next);
    });
    browser
      .history('get')
      .then((next) => {
        if (alive) setRecords(next);
        return null;
      })
      .catch(() => {
        if (alive) setError('History could not be loaded.');
      });
    const keys = browser.onShortcut((action) => {
      if (action === 'find') search.current?.focus();
    });
    return () => {
      alive = false;
      stop();
      keys();
    };
  }, []);
  const act = async (action: HistoryAction, id?: string) => {
    setBusy(true);
    setError('');
    try {
      setRecords(await browser.history(action, id));
      setClear(false);
    } catch {
      setError('History could not be updated.');
    } finally {
      setBusy(false);
    }
  };
  const filtered = records.filter((record) =>
    `${record.title} ${record.url}`.toLowerCase().includes(query.toLowerCase())
  );
  const shown = filtered.slice(0, limit);
  return (
    <section className="history-sidebar-panel" aria-label="Browsing history">
      <LibraryHeader
        count={records.length}
        noun="page"
        disabled={busy || !records.length}
        onClear={() => setClear(true)}
      />
      {clear && (
        <div
          className="download-inline-confirm"
          role="group"
          aria-label="Clear browsing history confirmation"
        >
          <p>Clear all browsing history? Cookies and logins stay.</p>
          <Button
            size="1"
            color="red"
            disabled={busy}
            onClick={() => act('clear')}
          >
            Clear
          </Button>
          <Button size="1" variant="soft" onClick={() => setClear(false)}>
            Cancel
          </Button>
        </div>
      )}
      <SearchControl
        inputRef={search}
        label="Search browsing history"
        value={query}
        onChange={(value) => {
          setQuery(value);
          setLimit(100);
        }}
      />
      {error && <p role="alert">{error}</p>}
      <div className="history-sidebar-list">
        {!shown.length && (
          <div className="library-panel-empty">
            <Globe size={24} aria-hidden="true" />
            <p>{query ? 'No matching pages' : 'No visited pages yet'}</p>
          </div>
        )}
        {shown.map((record, index) => {
          const group = downloadDateGroup(record.visitedAt);
          return (
            <div key={record.id}>
              {(!index ||
                downloadDateGroup(shown[index - 1].visitedAt) !== group) && (
                <h2>{group}</h2>
              )}
              <div className="history-sidebar-row">
                <Globe size={16} aria-hidden="true" />
                <button
                  type="button"
                  title={record.url}
                  onClick={() => navigate(record.url)}
                >
                  <strong>{record.title}</strong>
                  <span>
                    {new URL(record.url).host}
                    {new URL(record.url).pathname === '/'
                      ? ''
                      : new URL(record.url).pathname}{' '}
                    ·{' '}
                    {new Date(record.visitedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </button>
                <Tooltip content="Remove from history">
                  <IconButton
                    size="1"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Remove ${record.title} from history`}
                    onClick={() => act('remove', record.id)}
                  >
                    <X size={14} />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          );
        })}
        {filtered.length > limit && (
          <Button
            size="1"
            variant="soft"
            onClick={() => setLimit((value) => value + 100)}
          >
            Show more
          </Button>
        )}
      </div>
    </section>
  );
}

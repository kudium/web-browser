import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, IconButton, Tooltip } from '@radix-ui/themes';
import {
  ArrowDownToLine,
  ArrowLeft,
  File,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Pause,
  Play,
  RotateCw,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { SearchControl, SelectControl } from '../../UI/FormControls';
import { LibraryHeader } from './LibraryHeader';
import { browser } from '../../../browser/client';
import {
  DownloadAction,
  DownloadRecord,
  DownloadRecoveryInfo,
  downloadBytes,
  downloadDateGroup,
  downloadKind,
} from '../../../browser/downloads';

export function Downloads({ embedded = false }: { embedded?: boolean }) {
  const [recovery, setRecovery] = useState<DownloadRecoveryInfo>({
    status: 'none',
    canReveal: false,
  });
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [limit, setLimit] = useState(100);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const mounted = useRef(false);
  const requested = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    mounted.current = true;
    const stop = browser.onDownloads((next) => {
      if (alive) setRecords(next);
    });
    browser
      .downloads('get')
      .then((next) => {
        if (alive) {
          setRecords(next);
          setReady(true);
        }
        return null;
      })
      .catch(() => {
        if (alive) {
          setError('Download history could not be loaded.');
          setReady(true);
        }
      });
    browser
      .downloadRecovery()
      .then((info) => {
        if (alive) setRecovery(info);
        return null;
      })
      .catch(() => {});
    const stopKeys = browser.onShortcut((action) => {
      if (action === 'find') search.current?.focus();
    });
    return () => {
      alive = false;
      mounted.current = false;
      stop();
      stopKeys();
    };
  }, []);
  const filtered = useMemo(
    () =>
      records.filter(
        (record) =>
          record.name.toLowerCase().includes(query.toLowerCase()) &&
          (filter === 'All' ||
            (filter === 'Active' && record.active) ||
            (filter === 'Completed' && record.state === 'completed') ||
            downloadKind(record) === filter),
      ),
    [records, query, filter],
  );
  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const groups = useMemo(() => {
    const result = new Map<string, DownloadRecord[]>();
    shown.forEach((record) => {
      const label = downloadDateGroup(record.startedAt);
      result.set(label, [...(result.get(label) || []), record]);
    });
    return [...result.entries()];
  }, [shown]);
  useEffect(() => {
    shown
      .filter(
        (record) =>
          record.state === 'completed' && !requested.current.has(record.id),
      )
      .forEach((record) => {
        requested.current.add(record.id);
        browser
          .downloadThumbnail(record.id)
          .then((icon) => {
            if (mounted.current && icon)
              setIcons((previous) => ({ ...previous, [record.id]: icon }));
            return null;
          })
          .catch(() => {});
      });
  }, [shown]);
  const act = async (action: DownloadAction, id?: string) => {
    setBusy(true);
    setError('');
    try {
      setRecords(await browser.downloads(action, id));
      if (action === 'clear') {
        setClearOpen(false);
        setRecovery({ status: 'none', canReveal: false });
      }
    } catch (reason) {
      setError(
        (reason as Error).message ||
          'The download action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className={
        embedded
          ? 'download-library download-sidebar-panel'
          : 'download-library'
      }
      aria-label="Downloads panel"
    >
      {!embedded && (
        <aside className="download-library-sidebar">
          <span className="download-library-brand">Library</span>
          <button
            type="button"
            className="download-library-navigation"
            aria-current="page"
          >
            <ArrowDownToLine size={26} />
            <span>Downloads</span>
          </button>
          <button
            type="button"
            className="download-library-back"
            onClick={() => {
              window.electron.ipcRenderer.sendMessage('ipc-create-window', [
                { view: 'main' },
              ]);
              window.electron.ipcRenderer.sendMessage('ipc-close-window', []);
            }}
          >
            <ArrowLeft size={18} />
            Back to browser
          </button>
        </aside>
      )}
      <main className="download-library-main">
        {embedded ? (
          <LibraryHeader
            count={records.length}
            noun="download"
            disabled={busy || !records.some((record) => !record.active)}
            onClear={() => setClearOpen(true)}
          />
        ) : (
          <header className="download-library-heading">
            <div>
              <h1>Downloads</h1>
              <p>
                {records.length}{' '}
                {records.length === 1 ? 'download' : 'downloads'}
              </p>
            </div>
            <Button
              variant="soft"
              disabled={busy || !records.some((record) => !record.active)}
              onClick={() => setClearOpen(true)}
            >
              <Trash2 size={15} />
              Clear history
            </Button>
          </header>
        )}
        {embedded && clearOpen && (
          <div
            className="download-inline-confirm"
            role="group"
            aria-label="Clear download history confirmation"
          >
            <p>Clear history? Files stay on your device.</p>
            <Button
              size="1"
              color="red"
              disabled={busy}
              onClick={() => act('clear')}
            >
              Clear
            </Button>
            <Button
              size="1"
              variant="soft"
              disabled={busy}
              onClick={() => setClearOpen(false)}
            >
              Cancel
            </Button>
          </div>
        )}
        <div className="download-library-toolbar">
          <SearchControl
            inputRef={search}
            label="Search downloads"
            value={query}
            onChange={(value) => {
              setQuery(value);
              setLimit(100);
            }}
          />
          <SelectControl
            label="Filter downloads"
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setLimit(100);
            }}
            options={[
              'All',
              'Active',
              'Completed',
              'Images',
              'Video',
              'Audio',
              'Documents',
              'Archives',
              'Other',
            ].map((value) => ({
              value,
              label: value === 'All' ? 'All types' : value,
            }))}
          />
        </div>
        {recovery.status !== 'none' && (
          <div className="download-recovery-notice" role="status">
            <p>
              {recovery.status === 'blocked'
                ? 'Download history needs attention.'
                : 'Some download history was recovered.'}
            </p>
            <details>
              <summary>More information</summary>
              <p>
                {recovery.status === 'blocked'
                  ? 'The original history could not be safely recovered. Changes to saved history are paused to protect it. Downloads can still continue.'
                  : 'Valid entries were restored. A copy of the original history was saved for recovery. Your downloaded files are unchanged.'}
              </p>
              {recovery.canReveal && (
                <Button
                  size="1"
                  variant="soft"
                  disabled={busy}
                  onClick={() => act('reveal-recovery')}
                >
                  <FolderOpen size={14} /> Show in Finder
                </Button>
              )}
            </details>
          </div>
        )}
        {error && (
          <div className="download-library-error" role="alert">
            {error}
          </div>
        )}
        <div className="download-library-list" aria-busy={!ready}>
          {!shown.length && (
            <div
              className={
                embedded ? 'library-panel-empty' : 'download-library-empty'
              }
            >
              <ArrowDownToLine size={embedded ? 24 : 36} aria-hidden="true" />
              <p>
                {!ready && !error
                  ? 'Loading downloads…'
                  : 'No downloads to show'}
              </p>
            </div>
          )}
          {groups.map(([group, downloads]) => (
            <section key={group} aria-label={group}>
              <h2>{group}</h2>
              <ul>
                {downloads.map((record) => {
                  const kind = downloadKind(record);
                  const Icon =
                    (
                      {
                        Images: ImageIcon,
                        Video,
                        Audio: Music,
                        Documents: FileText,
                      } as Record<string, typeof File>
                    )[kind] || File;
                  const progress =
                    record.totalBytes > 0
                      ? Math.min(
                          100,
                          (record.receivedBytes / record.totalBytes) * 100,
                        )
                      : undefined;
                  let status = 'Interrupted';
                  if (record.state === 'cancelled') status = 'Cancelled';
                  if (record.state === 'completed')
                    status = `${kind} · ${downloadBytes(record.receivedBytes)}`;
                  if (record.state === 'progressing') {
                    status = record.paused
                      ? 'Paused'
                      : downloadBytes(record.receivedBytes);
                    if (!record.paused && record.totalBytes > 0)
                      status += ` of ${downloadBytes(record.totalBytes)}`;
                  }
                  if (record.awaitingSaveLocation)
                    status = 'Choose save location';
                  return (
                    <li key={record.id} className="download-library-row">
                      <div className="download-library-preview">
                        {icons[record.id] ? (
                          <img src={icons[record.id]} alt="" />
                        ) : (
                          <Icon size={28} />
                        )}
                      </div>
                      <div className="download-library-copy">
                        <button
                          type="button"
                          className="download-library-open"
                          title={record.name}
                          disabled={record.state !== 'completed' || busy}
                          onClick={() => act('open-file', record.id)}
                        >
                          {record.name}
                        </button>
                        <p>{status}</p>
                        {record.state === 'progressing' && (
                          <progress
                            aria-label={`Download progress for ${record.name}`}
                            max={100}
                            value={progress}
                          />
                        )}
                      </div>
                      <div className="download-library-actions">
                        {record.active ? (
                          <>
                            <Tooltip
                              content={
                                record.paused || record.state === 'interrupted'
                                  ? 'Resume'
                                  : 'Pause'
                              }
                            >
                              <IconButton
                                variant="ghost"
                                aria-label={`${
                                  record.paused ||
                                  record.state === 'interrupted'
                                    ? 'Resume'
                                    : 'Pause'
                                } ${record.name}`}
                                disabled={
                                  busy ||
                                  (record.state === 'interrupted' &&
                                    !record.resumable)
                                }
                                onClick={() =>
                                  act(
                                    record.paused ||
                                      record.state === 'interrupted'
                                      ? 'resume'
                                      : 'pause',
                                    record.id,
                                  )
                                }
                              >
                                {record.paused ? (
                                  <Play size={16} />
                                ) : (
                                  <Pause size={16} />
                                )}
                              </IconButton>
                            </Tooltip>
                            <Tooltip content="Cancel download">
                              <IconButton
                                variant="ghost"
                                aria-label={`Cancel ${record.name}`}
                                disabled={busy}
                                onClick={() => act('cancel', record.id)}
                              >
                                <X size={16} />
                              </IconButton>
                            </Tooltip>
                          </>
                        ) : (
                          <>
                            {record.resumable && (
                              <Tooltip content="Resume the remaining bytes from the saved partial file.">
                                <IconButton
                                  variant="ghost"
                                  aria-label={`Resume ${record.name}`}
                                  disabled={busy}
                                  onClick={() => act('resume', record.id)}
                                >
                                  <Play size={16} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {record.retryable && (
                              <Tooltip content="Download again from the beginning. The previous file is kept.">
                                <IconButton
                                  variant="ghost"
                                  aria-label={`Download again ${record.name}`}
                                  disabled={busy}
                                  onClick={() => act('retry', record.id)}
                                >
                                  <RotateCw size={16} />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip content="Show in folder">
                              <IconButton
                                variant="ghost"
                                aria-label={`Show ${record.name} in folder`}
                                disabled={record.state !== 'completed' || busy}
                                onClick={() => act('reveal', record.id)}
                              >
                                <FolderOpen size={16} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip content="Remove from history">
                              <IconButton
                                variant="ghost"
                                aria-label={`Remove ${record.name} from history`}
                                disabled={busy}
                                onClick={() => act('remove', record.id)}
                              >
                                <X size={16} />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {filtered.length > limit && (
            <Button
              variant="soft"
              onClick={() => setLimit((previous) => previous + 100)}
            >
              Show more downloads
            </Button>
          )}
        </div>
      </main>
      {!embedded && (
        <Dialog.Root open={clearOpen} onOpenChange={setClearOpen}>
          <Dialog.Content maxWidth="380px">
            <Dialog.Title>Clear download history?</Dialog.Title>
            <Dialog.Description size="2">
              Downloaded files stay on your device. Active downloads remain in
              the list.
            </Dialog.Description>
            <div className="download-clear-actions">
              <Dialog.Close>
                <Button variant="soft" disabled={busy}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button color="red" disabled={busy} onClick={() => act('clear')}>
                Clear history
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </div>
  );
}

Downloads.defaultProps = { embedded: false };

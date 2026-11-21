import { Popover, Select, Switch, Text } from '@radix-ui/themes';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Copy,
  Trash2,
  Power,
  Sparkles,
  ChevronDown,
  Settings2,
  Code2,
  Play,
} from 'lucide-react';
import {
  activitySounds,
  validActivitySound,
  ActivitySoundName,
} from '../../browser/activitySound';
import { AssistantPageHeader } from './AssistantPageHeader';
import { PreferenceHint } from './PreferenceHint';
import { ChromeIconButton } from './ChromeIconButton';
import { browser } from '../../browser/client';
import { AppIcon } from './AppIcon/AppIcon';
import { AppManager } from '../../utils/AppManager';
import { loginProfileKey } from '../../utils/groups';
import { savedSiteIcon } from '../../utils/siteIcon';
import type {
  BrowserActivity,
  HookActivityTrigger,
} from '../../browser/activity';

function hookSource(trigger: HookActivityTrigger) {
  return AppManager.getAll().find(
    (tab) =>
      !tab.archived &&
      loginProfileKey(tab) === trigger.profile &&
      (trigger.sourceId
        ? tab.id === trigger.sourceId
        : tab.url.startsWith(`${trigger.origin}/`))
  );
}
function activitySiteIcon(entry: BrowserActivity) {
  const source = entry.trigger ? hookSource(entry.trigger) : undefined;
  if (source?.icon) return source.icon;
  return savedSiteIcon(
    AppManager.getAll(),
    entry.trigger?.origin || entry.url || '',
    entry.trigger?.profile
  );
}

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

export function ActivityPage({
  active,
  onAskAI,
}: {
  active: boolean;
  // eslint-disable-next-line react/require-default-props
  onAskAI?: () => void;
}) {
  const [entries, setEntries] = useState<BrowserActivity[]>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const soundId = useId();
  const [soundName, setSoundName] = useState<ActivitySoundName>('chime');
  const notificationsId = useId();
  const [notifications, setNotifications] = useState(false);
  const [sound, setSound] = useState(true);
  const [soundReady, setSoundReady] = useState(false);
  const [savingSound, setSavingSound] = useState(false);
  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const preferences = await browser.preferences('get');
        if (!disposed) {
          setSound(preferences.activitySound);
          setSoundName(preferences.activitySoundName || 'chime');
          setNotifications(preferences.activityNotifications);
          setSoundReady(true);
        }
      } catch {
        /* Activity remains usable if preferences are unavailable. */
      }
    };
    load();
    return () => {
      disposed = true;
    };
  }, []);
  const [disabledTriggers, setDisabledTriggers] = useState<string[]>([]);
  const target = useRef<string | undefined>(undefined);
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
        <div className="activity-heading-actions">
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
          <button
            type="button"
            className="activity-read-all"
            disabled={!entries.length || clearing}
            onClick={async () => {
              setClearing(true);
              try {
                await window.electron.activity({ action: 'clearAll' });
                setSelected(undefined);
                target.current = undefined;
                setDisabledTriggers([]);
                setError('');
                await refresh();
              } catch {
                setError('Activity could not be cleared.');
              } finally {
                setClearing(false);
              }
            }}
          >
            Clear all
          </button>
        </div>
        <Popover.Root>
          <Popover.Trigger>
            <ChromeIconButton icon={Settings2} label="Activity settings" />
          </Popover.Trigger>
          <Popover.Content width="250px" className="activity-settings-popover">
            <h3>Activity settings</h3>
            <div className="activity-sound-setting">
              <Text as="label" htmlFor={soundId}>
                Notification sound
              </Text>
              <div className="activity-setting-controls">
                <PreferenceHint label="Notification sound">
                  <p>Play the selected sound for new unread activity.</p>
                </PreferenceHint>
                <Switch
                  id={soundId}
                  size="1"
                  checked={sound}
                  disabled={!soundReady || savingSound}
                  onCheckedChange={async (checked) => {
                    setSavingSound(true);
                    try {
                      const preferences = await browser.preferences('update', {
                        activitySound: checked,
                      });
                      setSound(preferences.activitySound);
                      setNotifications(preferences.activityNotifications);
                      setError('');
                    } catch {
                      setError('Sound preference could not be saved.');
                    } finally {
                      setSavingSound(false);
                    }
                  }}
                />
              </div>
            </div>
            <div className="activity-sound-picker">
              <Select.Root
                value={
                  window.electron.platform === 'darwin' || soundName === 'chime'
                    ? soundName
                    : 'system'
                }
                disabled={!soundReady || savingSound}
                onValueChange={async (value) => {
                  if (!validActivitySound(value)) return;
                  setSavingSound(true);
                  try {
                    const preferences = await browser.preferences('update', {
                      activitySoundName: value,
                    });
                    setSoundName(preferences.activitySoundName);
                    setError('');
                  } catch {
                    setError('Sound selection could not be saved.');
                  } finally {
                    setSavingSound(false);
                  }
                }}
              >
                <Select.Trigger aria-label="Activity sound" variant="surface" />
                <Select.Content>
                  {Object.entries(activitySounds)
                    .filter(
                      ([value]) =>
                        window.electron.platform === 'darwin' ||
                        value === 'system' ||
                        value === 'chime'
                    )
                    .map(([value, label]) => (
                      <Select.Item key={value} value={value}>
                        {label}
                      </Select.Item>
                    ))}
                </Select.Content>
              </Select.Root>
              <ChromeIconButton
                icon={Play}
                label="Preview sound"
                className="activity-sound-preview"
                disabled={!soundReady || savingSound}
                onClick={async () => {
                  try {
                    await window.electron.activity({ action: 'testSound' });
                  } catch {
                    setError('Sound could not be played.');
                  }
                }}
              />
            </div>
            <div className="activity-sound-setting activity-banner-setting">
              <Text as="label" htmlFor={notificationsId}>
                System notifications
              </Text>
              <div className="activity-setting-controls">
                <PreferenceHint label="System notifications">
                  <p>
                    Show banners for new unread activity. Allow Kudium
                    notifications in your system settings.
                  </p>
                </PreferenceHint>
                <Switch
                  id={notificationsId}
                  size="1"
                  checked={notifications}
                  disabled={!soundReady || savingSound}
                  onCheckedChange={async (checked) => {
                    setSavingSound(true);
                    try {
                      const preferences = await browser.preferences('update', {
                        activityNotifications: checked,
                      });
                      setNotifications(preferences.activityNotifications);
                      setError('');
                    } catch {
                      setError('Notification preference could not be saved.');
                    } finally {
                      setSavingSound(false);
                    }
                  }}
                />
              </div>
            </div>
          </Popover.Content>
        </Popover.Root>
      </AssistantPageHeader>
      <div className="activity-page-body">
      {error && <p role="alert">{error}</p>}
      {!entries.length && !error && (
        <div className="activity-empty">
          <h3>No activity yet</h3>
          <p>Get updates from your pages with a hook.</p>
          <div className="activity-empty-actions">
            {onAskAI && (
              <button type="button" onClick={onAskAI}>
                <Sparkles size={14} />
                Ask AI to set up
              </button>
            )}
            <button
              type="button"
              aria-expanded={showExample}
              aria-controls="activity-hook-example"
              onClick={() => setShowExample((shown) => !shown)}
            >
              {showExample ? 'Hide example' : 'View how'}
              <ChevronDown
                size={12}
                className={
                  showExample
                    ? 'activity-example-chevron open'
                    : 'activity-example-chevron'
                }
              />
            </button>
            <a
              href="https://browser.kudium.com/docs/notes-and-activity"
              target="_blank"
              rel="noopener noreferrer"
            >
              Hook guide ↗
            </a>
          </div>
          {showExample && (
            <div id="activity-hook-example" className="activity-empty-example">
              <p>
                Add this to a page hook and enable it. Hooks run while their
                page is loaded. The URL links the alert back to this page.
              </p>
              <pre aria-label="Hook activity example">
                <code className="language-javascript">
                  <span className="hljs-keyword">await</span>
                  {' context.activity.'}
                  <span className="hljs-title">create</span>
                  {'({\n  '}
                  <span className="hljs-attr">title</span>
                  {': '}
                  <span className="hljs-string">
                    &quot;Something changed&quot;
                  </span>
                  {',\n  '}
                  <span className="hljs-attr">message</span>
                  {': '}
                  <span className="hljs-string">
                    &quot;Here’s what’s new.&quot;
                  </span>
                  {',\n  '}
                  <span className="hljs-attr">url</span>
                  {': location.href\n});'}
                </code>
              </pre>
            </div>
          )}
        </div>
      )}
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
              {entry.source === 'hook' && (
                <span
                  className="activity-site-icon"
                  title={entry.trigger?.origin}
                  aria-hidden="true"
                >
                  <AppIcon icon={activitySiteIcon(entry)} title="" />
                </span>
              )}
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
              {entry.source === 'hook' && entry.trigger ? (
                <button
                  type="button"
                  className="activity-source activity-source-link"
                  title={`${entry.trigger.hookName} · ${entry.trigger.origin}`}
                  aria-label={`Open hook: ${entry.trigger.hookName}`}
                  onClick={() => {
                    const trigger = entry.trigger!;
                    const source = hookSource(trigger);
                    if (!source) {
                      setError(
                        'The source tab is closed. Reopen its page to manage this hook.'
                      );
                      return;
                    }
                    browser.command({
                      id: source.id,
                      action: 'open-site-developer',
                      url: trigger.origin,
                      hookId: trigger.hookId,
                    });
                  }}
                >
                  <Code2 size={12} aria-hidden="true" />
                  Page hook
                </button>
              ) : (
                <small className="activity-source">
                  {entry.source === 'hook' ? 'Page hook' : 'Assistant'}
                </small>
              )}
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
              {entry.trigger && (
                <ChromeIconButton
                  icon={Power}
                  label={
                    disabledTriggers.includes(entry.id)
                      ? 'Hook disabled'
                      : 'Disable hook'
                  }
                  className="activity-disable"
                  disabled={disabledTriggers.includes(entry.id)}
                  onClick={async () => {
                    try {
                      await window.electron.activity({
                        action: 'disableHook',
                        id: entry.id,
                      });
                      setDisabledTriggers((previous) => [
                        ...previous,
                        entry.id,
                      ]);
                      setError('');
                    } catch {
                      setError('The triggering hook could not be disabled.');
                    }
                  }}
                />
              )}
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
      </div>
    </section>
  );
}

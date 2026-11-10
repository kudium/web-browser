/* Function components use parameter defaults for optional props. */
/* eslint-disable react/require-default-props */
/* Native controls are associated through htmlFor and unique IDs. */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  IconButton,
  Popover,
  Switch,
  Tabs,
  TextField,
} from '@radix-ui/themes';
import { RotateCw, Plus, Settings2 } from 'lucide-react';
import { HookPageTarget } from './HookPageTarget';
import { SiteDeveloperWorkspace } from './SiteDeveloperWorkspace';
import { CodeEditor } from './CodeEditor';
import { PreferenceHint } from './PreferenceHint';
import {
  emptyDeveloperConfig,
  validDeveloperConfig,
  SiteDeveloperState,
} from '../../browser/siteDeveloper';
import type { BrowserCommand } from '../../browser/contracts';

const labels = {
  waiting: 'Waiting for reload',
  running: 'Running hooks',
  success: 'Hooks completed',
  error: 'Hook needs attention',
};
export function SiteDeveloperPanel({
  developer,
  disabled,
  send,
  origin = '',
}: {
  developer: SiteDeveloperState | undefined;
  disabled: boolean;
  origin?: string;
  send: (
    action: BrowserCommand['action'],
    patch?: Partial<BrowserCommand>
  ) => void;
}) {
  const saved = developer?.config || emptyDeveloperConfig;
  const serialized = JSON.stringify(saved);
  const [draft, setDraft] = useState(saved);
  const [hookId, setHookId] = useState('');
  const selectedHook = draft.hooks?.find((hook) => hook.id === hookId);
  const code = selectedHook || draft;
  const updateCode = (patch: Partial<typeof code>) =>
    setDraft((previous) =>
      selectedHook
        ? {
            ...previous,
            hooks: previous.hooks?.map((hook) =>
              hook.id === hookId ? { ...hook, ...patch } : hook
            ),
          }
        : { ...previous, ...patch }
    );
  const [editor, setEditor] = useState<'before' | 'after' | 'css'>('after');
  const hasDeveloper = !!developer;
  useEffect(() => {
    if (hasDeveloper) setDraft(JSON.parse(serialized));
  }, [serialized, hasDeveloper]);
  const importInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const dirty = JSON.stringify(draft) !== serialized;
  const examples = {
    before: "log('Starting', url);",
    after:
      "log('Loaded', url);\nlog('Page title', document.title);\n// document.querySelector('h1')?.style.setProperty('color', 'royalblue');",
    css: '/* Applied to every page on this site */\nbody { outline: 2px solid royalblue; }',
  };
  const stageLabels = {
    before: 'Before load',
    after: 'After load',
    css: 'CSS',
  };
  const stageHints = {
    before: 'Before website scripts run. The document is still being created.',
    after: 'After the document and its resources finish loading.',
    css: 'Injected at document start. Browser CSS rules still apply.',
  };
  return (
    <>
      <div className="site-settings-scroll site-developer-scroll">
        <div className="site-developer-toolbar">
          <span id="site-developer-enable-label">Manage this site</span>
          <Switch
            id="site-developer-enabled"
            aria-labelledby="site-developer-enable-label"
            checked={draft.enabled}
            disabled={disabled}
            onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
          />
          <PreferenceHint label="Hook API & examples">
            <div className="site-hook-help-content">
              <p>
                For saved webhook alerts, ask the Assistant to configure a
                notification permission. Use{' '}
                <code>
                  context.notify(&quot;approved-key&quot;, &quot;Alert
                  text&quot;)
                </code>
                ; credentials stay in Personal Data. Permissions can be allowed
                or revoked below. Page hooks monitor only while this page is
                loaded.
              </p>
              <p>
                Hooks run on this website for this group. Groups sharing its
                login also share these hooks.
              </p>
              <p>
                Write a JavaScript callback body with <code>url</code>,{' '}
                <code>document</code>, <code>content</code> (HTML snapshot),{' '}
                <code>log(...values)</code> and <code>await</code>.
              </p>
              <p>
                Navigate with <code>page.reload()</code>,{' '}
                <code>page.back()</code>, <code>page.forward()</code> and{' '}
                <code>page.stop()</code>. Rapid loops are paused.
              </p>
              <p>
                Code runs in an isolated world, with access to the DOM but no
                website globals or Node.js. Only enable trusted code. Logs stay
                in memory; avoid logging secrets.
              </p>
            </div>
          </PreferenceHint>
          <div
            className="site-developer-status"
            role="status"
            data-status={
              saved.enabled ? developer?.status || 'waiting' : 'disabled'
            }
          >
            <span className="site-developer-dot" />
            <span>
              {saved.enabled
                ? labels[developer?.status || 'waiting']
                : 'Hooks are off'}
            </span>
            {dirty && <span className="site-developer-unsaved">Unsaved</span>}
          </div>
        </div>
        <div className="site-hooks-layout">
          <aside className="site-hooks-sidebar" aria-label="Site hooks">
            <div className="site-hooks-sidebar-heading">
              <h2>Hooks</h2>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                aria-label="Add hook"
                disabled={disabled || (draft.hooks?.length || 0) >= 20}
                onClick={() => {
                  const id = crypto.randomUUID();
                  setDraft({
                    ...draft,
                    hooks: [
                      ...(draft.hooks || []),
                      {
                        id,
                        name: 'New hook',
                        enabled: true,
                        path: '/*',
                        before: '',
                        after: '',
                        css: '',
                      },
                    ],
                  });
                  setHookId(id);
                }}
              >
                <Plus size={16} />
              </IconButton>
            </div>
            <div className="site-hooks-list">
              <button
                type="button"
                className="site-hooks-list-item"
                aria-pressed={!selectedHook}
                disabled={disabled}
                onClick={() => setHookId('')}
              >
                <strong>Default hook</strong>
                <small>All pages</small>
              </button>
              {draft.hooks?.map((hook) => (
                <button
                  key={hook.id}
                  type="button"
                  className="site-hooks-list-item"
                  aria-pressed={hook.id === hookId}
                  disabled={disabled}
                  onClick={() => setHookId(hook.id)}
                >
                  <strong>{hook.name || 'Untitled hook'}</strong>
                  <small>{hook.path}</small>
                  <span>{hook.enabled ? 'Enabled' : 'Disabled'}</span>
                </button>
              ))}
            </div>
          </aside>
          <div className="site-hook-detail">
            <div className="site-hook-selection">
              <h2>{selectedHook?.name || 'Default hook'}</h2>
              <div className="site-hook-options">
                {selectedHook ? (
                  <>
                    <HookPageTarget
                      path={selectedHook.path}
                      disabled={disabled}
                      origin={origin}
                      onChange={(path) => updateCode({ path })}
                    />
                    <label className="site-hook-enabled">
                      <Switch
                        size="1"
                        aria-label="Enable selected hook"
                        checked={selectedHook.enabled}
                        disabled={disabled}
                        onCheckedChange={(enabled) => updateCode({ enabled })}
                      />
                      Enabled
                    </label>
                    <Popover.Root>
                      <Popover.Trigger>
                        <IconButton
                          size="1"
                          color="gray"
                          variant="ghost"
                          disabled={disabled}
                          aria-label="Hook settings"
                        >
                          <Settings2 size={15} />
                        </IconButton>
                      </Popover.Trigger>
                      <Popover.Content
                        width="280px"
                        className="site-hook-popover"
                      >
                        <div className="site-hook-popover-title">
                          Hook settings
                        </div>
                        <label htmlFor="site-hook-name">Name</label>
                        <TextField.Root
                          id="site-hook-name"
                          size="2"
                          maxLength={120}
                          value={selectedHook.name}
                          disabled={disabled}
                          onChange={(event) =>
                            updateCode({ name: event.target.value })
                          }
                        />
                        <Button
                          size="1"
                          variant="soft"
                          color="red"
                          onClick={() => {
                            setDraft({
                              ...draft,
                              hooks: draft.hooks?.filter(
                                (hook) => hook.id !== hookId
                              ),
                            });
                            setHookId('');
                          }}
                        >
                          Remove hook
                        </Button>
                      </Popover.Content>
                    </Popover.Root>
                  </>
                ) : (
                  <span className="site-hook-default-target">All pages</span>
                )}
              </div>
            </div>
            <SiteDeveloperWorkspace
              code={
                <Tabs.Root
                  value={editor}
                  onValueChange={(value) => setEditor(value as typeof editor)}
                  className="site-hook-editor"
                >
                  <Tabs.List aria-label="Hook stage">
                    <Tabs.Trigger value="before">Before load</Tabs.Trigger>
                    <Tabs.Trigger value="after">After load</Tabs.Trigger>
                    <Tabs.Trigger value="css">CSS</Tabs.Trigger>
                  </Tabs.List>
                  <Tabs.Content
                    value={editor}
                    className="site-hook-editor-body"
                  >
                    <div className="site-section-heading">
                      <span className="site-hook-editor-label">
                        {editor === 'css'
                          ? 'Stylesheet'
                          : 'JavaScript callback'}
                      </span>
                      <div className="site-hook-editor-actions">
                        <Button
                          size="1"
                          variant="ghost"
                          color="gray"
                          disabled={disabled || !!code[editor]}
                          onClick={() =>
                            updateCode({ [editor]: examples[editor] })
                          }
                        >
                          Use example
                        </Button>
                        <Button
                          size="1"
                          variant="ghost"
                          color="gray"
                          disabled={disabled}
                          onClick={() => importInput.current?.click()}
                        >
                          Import
                        </Button>
                      </div>
                    </div>
                    <input
                      ref={importInput}
                      type="file"
                      hidden
                      aria-label="Import hook file"
                      accept={
                        editor === 'css'
                          ? '.css,text/css'
                          : '.js,.mjs,.txt,text/javascript,text/plain'
                      }
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (!file) return;
                        try {
                          if (file.size > 100000)
                            throw new Error(
                              'Choose a file smaller than 100 KB.'
                            );
                          const source = await file.text();
                          updateCode({ [editor]: source });
                          setImportError('');
                        } catch (error) {
                          setImportError(String(error));
                        }
                      }}
                    />
                    {importError && (
                      <p className="site-hook-import-error" role="alert">
                        {importError}
                      </p>
                    )}
                    <CodeEditor
                      key={editor}
                      label={`${stageLabels[editor]} code`}
                      language={editor === 'css' ? 'css' : 'javascript'}
                      value={code[editor]}
                      disabled={disabled}
                      onChange={(value) => updateCode({ [editor]: value })}
                    />
                    <p className="site-hook-stage-hint">{stageHints[editor]}</p>
                  </Tabs.Content>
                </Tabs.Root>
              }
              activity={
                <section aria-labelledby="site-developer-activity">
                  <div className="site-section-heading">
                    <h2 id="site-developer-activity">Activity</h2>
                    <Button
                      size="1"
                      variant="ghost"
                      color="gray"
                      disabled={disabled || !developer?.logs.length}
                      onClick={() => send('clear-site-developer-logs')}
                    >
                      Clear
                    </Button>
                  </div>
                  <div
                    className="site-hook-logs"
                    role="log"
                    aria-label="Hook activity"
                    aria-live="polite"
                  >
                    {developer?.logs.length ? (
                      developer.logs.map((entry, index) => (
                        <div
                          className="site-hook-log"
                          data-level={entry.level}
                          key={`${entry.time}-${index}`}
                        >
                          <time>
                            {new Date(entry.time).toLocaleTimeString()}
                          </time>
                          <span>{entry.message}</span>
                        </div>
                      ))
                    ) : (
                      <p>Run a page load to see hook activity here.</p>
                    )}
                  </div>
                </section>
              }
            />
          </div>
        </div>
      </div>
      {!!developer?.notifications?.length && (
        <section
          className="site-hook-notification-permissions"
          aria-label="Personal Data notification permissions"
        >
          {developer.notifications.map((permission) => (
            <div key={permission.id}>
              <span>
                <strong>{permission.key}</strong>
                <small>
                  {permission.label} · {permission.destinationHost}
                </small>
                <small>
                  {permission.active
                    ? 'Allowed for this browser session'
                    : 'Approval required'}
                </small>
              </span>
              {!permission.active && (
                <Button
                  size="1"
                  variant="soft"
                  disabled={disabled || dirty}
                  onClick={() =>
                    send('activate-hook-notification', {
                      grantId: permission.id,
                    })
                  }
                >
                  Allow
                </Button>
              )}
              <Button
                size="1"
                variant="ghost"
                color="gray"
                disabled={disabled}
                onClick={() =>
                  send('revoke-hook-notification', { grantId: permission.id })
                }
              >
                Revoke
              </Button>
            </div>
          ))}
        </section>
      )}
      <footer className="site-settings-footer site-developer-footer">
        <span>
          {dirty
            ? 'Save changes before running.'
            : 'Saved hooks run on the next page load.'}
        </span>
        <Button
          variant="soft"
          color="gray"
          disabled={disabled || !dirty || !validDeveloperConfig(draft)}
          onClick={() => send('set-site-developer', { developer: draft })}
        >
          Save hooks
        </Button>
        <Button
          disabled={disabled || dirty || !saved.enabled}
          onClick={() => send('reload')}
        >
          <RotateCw size={14} />
          Run
        </Button>
      </footer>
    </>
  );
}

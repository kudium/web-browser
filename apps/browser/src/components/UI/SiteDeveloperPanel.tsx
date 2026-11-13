/* Function components use parameter defaults for optional props. */
/* eslint-disable react/require-default-props */
/* Native controls are associated through htmlFor and unique IDs. */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertDialog,
  Button,
  DropdownMenu,
  IconButton,
  Popover,
  Switch,
  Tabs,
  TextField,
} from '@radix-ui/themes';
import {
  RotateCw,
  Plus,
  Settings2,
  Trash2,
  Store,
  MoreHorizontal,
} from 'lucide-react';
import { OPEN_HOOK_MARKETPLACE } from './HookMarketplaceDialog';
import { HookPresets } from './HookPresets';
import { HookHistory } from './HookHistory';
import { HookAISetup } from './HookAISetup';
import { HookPageTarget } from './HookPageTarget';
import { SiteDeveloperWorkspace } from './SiteDeveloperWorkspace';
import { CodeEditor } from './CodeEditor';
import { PreferenceHint } from './PreferenceHint';
import {
  emptyDeveloperConfig,
  validDeveloperConfig,
  SiteDeveloperState,
  SiteDeveloperConfig,
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
  selectedHookId = '',
  toolbarTarget,
}: {
  developer: SiteDeveloperState | undefined;
  disabled: boolean;
  origin?: string;
  selectedHookId?: string;
  toolbarTarget?: HTMLElement | null;
  send: (
    action: BrowserCommand['action'],
    patch?: Partial<BrowserCommand>
  ) => void;
}) {
  const saved = developer?.config || emptyDeveloperConfig;
  const serialized = JSON.stringify(saved);
  const [draft, setDraft] = useState(saved);
  const [hookId, setHookId] = useState(selectedHookId);
  const [enablePrompt, setEnablePrompt] = useState<{
    config: SiteDeveloperConfig;
    hookId: string;
    run?: boolean;
  }>();
  useEffect(() => {
    setHookId(selectedHookId);
  }, [selectedHookId]);
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
  const [jumpLine, setJumpLine] = useState<{ line: number; token: number }>();
  const [importError, setImportError] = useState('');
  const dirty = JSON.stringify(draft) !== serialized;
  const stageLabels = {
    before: 'Before load',
    after: 'After load',
    css: 'CSS',
  };
  const stageHints = {
    before:
      'At document creation. Asynchronous work does not pause website scripts.',
    after:
      'After resources finish loading, and on navigation within this page.',
    css: 'Applied at document start and on route changes. Browser CSS rules still apply.',
  };
  const askAI = (repair = false, outcome = 'Ask me what outcome I want.') => {
    const error = repair
      ? developer?.logs.filter((entry) => entry.level === 'error').at(-1)
      : undefined;
    const targetId = repair ? error?.hookId || '' : hookId;
    const target = targetId
      ? draft.hooks?.find((hook) => hook.id === targetId)
      : undefined;
    const stage = error?.phase || editor;
    const errors = developer?.logs
      .filter(
        (entry) => entry.level === 'error' && (entry.hookId || '') === targetId
      )
      .slice(-3)
      .map((entry) => entry.message)
      .join('\n');
    send('ask-hook-ai', {
      prompt: `Use site_customization to ${
        repair ? 'repair' : 'set up'
      } a page hook for ${origin}. Selected hook: ${
        target?.name || 'Default hook'
      } (${
        targetId || 'default'
      }). Read existing hooks first and preserve unrelated hooks. Use context.onCleanup, context.signal and managed timers/listeners. Explain the target, trigger and how to disable it. Show the proposed changes for local review; do not run code automatically. ${
        repair ? `Relevant errors: ${errors}` : `Requested outcome: ${outcome}`
      }\nSelected stage: ${stage}\nSelected source (first 20,000 characters):\n${(target ||
        draft)[stage].slice(0, 20000)}`,
    });
  };
  let publishHint = 'Publish this saved hook to the marketplace';
  if (dirty) publishHint = 'Save changes before publishing';
  else if (![code.before, code.after, code.css].some((value) => value.trim()))
    publishHint = 'Add code before publishing';
  const globalStatus = developer?.globalHookCount
    ? `${developer.globalHookCount} global hook${
        developer.globalHookCount === 1 ? '' : 's'
      } active`
    : 'Hooks are off';
  const toolbar = (
    <div className="site-developer-toolbar">
      <span id="site-developer-enable-label">Enable site hooks</span>
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
              context.notify(&quot;approved-key&quot;, &quot;Alert text&quot;)
            </code>
            ; credentials stay in Personal Data. Permissions can be allowed or
            revoked below. Page hooks monitor only while this page is loaded.
          </p>
          <p>
            Hooks run on this website for this group. Groups sharing its login
            also share these hooks.
          </p>
          <p>
            Write a JavaScript callback body with <code>url</code>,{' '}
            <code>document</code>, <code>content</code> (HTML snapshot),{' '}
            <code>log(...values)</code> and <code>await</code>.
          </p>
          <p>
            Add an Activity update with{' '}
            <code>
              await context.activity.create({'{ title, message, url }'})
            </code>
            . Save Markdown to Notes with{' '}
            <code>await context.notes.create({'{ title, body }'})</code>; this
            also creates a linked Activity entry. Hooks can create entries, but
            cannot read or edit existing notes. Outputs are limited to ten per
            minute per page.
          </p>
          <p>
            Examples lets you enable an enhancement or insert it into the
            current stage. Save and Run to apply inserted code. Dark mode and
            layout effects vary by website. Save example to keep your own
            version.
          </p>
          <p>
            Route changes clean up previous effects and rerun matching CSS and
            After load code. Use <code>context.onCleanup</code> for DOM changes
            and observers, and <code>context.listen</code> for event listeners.
            Hook timers stop automatically.
          </p>
          <p>
            Navigate with <code>page.reload()</code>, <code>page.back()</code>,{' '}
            <code>page.forward()</code> and <code>page.stop()</code>. Rapid
            loops are paused.
          </p>
          <p>
            Code runs in an isolated world, with access to the DOM but no
            website globals or Node.js. Only enable trusted code. Logs stay in
            memory; avoid logging secrets.
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
            : globalStatus}
        </span>
        {dirty && <span className="site-developer-unsaved">Unsaved</span>}
      </div>
    </div>
  );
  return (
    <>
      <div className="site-settings-scroll site-developer-scroll">
        {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar}
        <div className="site-hooks-layout">
          <aside className="site-hooks-sidebar" aria-label="Site hooks">
            <div className="site-hooks-sidebar-heading">
              <h2 className="visually-hidden">Hooks</h2>
              <Button
                size="1"
                variant="soft"
                className="site-hooks-get-button"
                disabled={disabled}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent(OPEN_HOOK_MARKETPLACE, {
                      detail: { mode: 'import', origin, hookId },
                    })
                  )
                }
              >
                <Store size={14} aria-hidden="true" /> Get Hooks
              </Button>
              <div className="site-hooks-heading-actions">
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
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    <IconButton
                      variant="ghost"
                      size="1"
                      color="gray"
                      disabled={disabled}
                      aria-label="More hook actions"
                    >
                      <MoreHorizontal size={16} />
                    </IconButton>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content>
                    {(
                      [
                        ['global', 'Global hooks'],
                        ['publish', 'Publish saved hook'],
                        ['updates', 'Check for updates'],
                      ] as const
                    ).map(([mode, label]) => (
                      <DropdownMenu.Item
                        key={mode}
                        disabled={
                          mode === 'publish' &&
                          (dirty ||
                            ![code.before, code.after, code.css].some((value) =>
                              value.trim()
                            ))
                        }
                        onSelect={() =>
                          window.dispatchEvent(
                            new CustomEvent(OPEN_HOOK_MARKETPLACE, {
                              detail: { mode, origin, hookId },
                            })
                          )
                        }
                      >
                        {label}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
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
                  title={`${hook.name || 'Untitled hook'} · ${hook.path}`}
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
              <div className="site-hook-editor-actions">
                <HookAISetup
                  disabled={disabled || dirty}
                  onAsk={(outcome) => askAI(false, outcome)}
                />
                <HookHistory
                  revisions={developer?.revisions || []}
                  hookId={hookId}
                  disabled={disabled || dirty}
                  onRestore={(previous) => {
                    const historical = previous.hooks?.find(
                      (hook) => hook.id === hookId
                    );
                    const config =
                      selectedHook && historical
                        ? {
                            ...draft,
                            hooks: draft.hooks?.map((hook) =>
                              hook.id === hookId
                                ? {
                                    ...hook,
                                    before: historical.before,
                                    after: historical.after,
                                    css: historical.css,
                                    name: historical.name,
                                    path: historical.path,
                                  }
                                : hook
                            ),
                          }
                        : {
                            ...draft,
                            before: previous.before,
                            after: previous.after,
                            css: previous.css,
                          };
                    setDraft(config);
                    send('set-site-developer', { developer: config });
                  }}
                />
                <HookPresets
                  stage={editor}
                  source={code[editor]}
                  canRun={!dirty}
                  onInsert={(source, targetStage = editor) => {
                    updateCode({
                      [targetStage]: code[targetStage].trim()
                        ? `${code[targetStage]}\n\n${
                            targetStage === 'css'
                              ? source
                              : `;\n{\n${source}\n}`
                          }`
                        : source,
                    });
                    setEditor(targetStage);
                  }}
                  onAsk={(outcome) => askAI(false, outcome)}
                  disabled={disabled}
                  onEnable={(example) => {
                    const id = `preset-${example.id}`;
                    const existing = draft.hooks?.find(
                      (hook) => hook.id === id
                    );
                    if (!existing && (draft.hooks?.length || 0) >= 20) {
                      setImportError(
                        'This site already has 20 hooks. Remove one before adding another.'
                      );
                      return;
                    }
                    const config = {
                      ...draft,
                      enabled: true,
                      hooks: existing
                        ? draft.hooks?.map((hook) =>
                            hook.id === id ? { ...hook, enabled: true } : hook
                          )
                        : [
                            ...(draft.hooks || []),
                            {
                              id,
                              name: example.name,
                              path: '/*',
                              enabled: true,
                              before: '',
                              after: '',
                              css: '',
                              [example.stage]: example.source,
                            },
                          ],
                    };
                    setDraft(config);
                    setHookId(id);
                    setEditor(example.stage);
                    send('set-site-developer', {
                      developer: config,
                      run: true,
                    });
                  }}
                />
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
                      </Popover.Content>
                    </Popover.Root>
                    <IconButton
                      size="1"
                      color="gray"
                      variant="ghost"
                      className="site-hook-delete"
                      aria-label="Delete hook"
                      title="Delete selected hook"
                      disabled={disabled}
                      onClick={() => {
                        setDraft((previous) => ({
                          ...previous,
                          hooks: previous.hooks?.filter(
                            (hook) => hook.id !== hookId
                          ),
                        }));
                        setHookId('');
                      }}
                    >
                      <Trash2 size={15} />
                    </IconButton>
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
                  <div className="site-hook-editor-toolbar">
                    <Tabs.List aria-label="Hook stage">
                      {(['before', 'after', 'css'] as const).map((stage) => (
                        <div className="site-hook-stage-tab" key={stage}>
                          <Tabs.Trigger value={stage}>
                            {stageLabels[stage]}
                          </Tabs.Trigger>
                          <PreferenceHint label={stageLabels[stage]}>
                            {stageHints[stage]}
                          </PreferenceHint>
                        </div>
                      ))}
                    </Tabs.List>
                  </div>
                  <Tabs.Content
                    value={editor}
                    className="site-hook-editor-body"
                  >
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
                      jumpLine={jumpLine}
                      language={editor === 'css' ? 'css' : 'javascript'}
                      value={code[editor]}
                      disabled={disabled}
                      onChange={(value) => updateCode({ [editor]: value })}
                    />
                  </Tabs.Content>
                </Tabs.Root>
              }
              activity={
                <section aria-labelledby="site-developer-activity">
                  <div className="site-section-heading">
                    <h2 id="site-developer-activity">Run output</h2>
                    {developer?.logs.some(
                      (entry) => entry.level === 'error'
                    ) && (
                      <Button
                        size="1"
                        color="gray"
                        variant="ghost"
                        disabled={disabled || dirty}
                        onClick={() => askAI(true)}
                      >
                        Fix with AI
                      </Button>
                    )}
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
                          {entry.level === 'error' &&
                            /kudium-hook-(.+)-(before|after)\.js:(\d+)/.test(
                              entry.message
                            ) && (
                              <button
                                type="button"
                                className="hook-error-line"
                                onClick={() => {
                                  const match = entry.message.match(
                                    /kudium-hook-(.+)-(before|after)\.js:(\d+)/
                                  )!;
                                  let id: string;
                                  try {
                                    id = decodeURIComponent(match[1]);
                                  } catch {
                                    return;
                                  }
                                  if (
                                    id !== 'default' &&
                                    !draft.hooks?.some((hook) => hook.id === id)
                                  )
                                    return;
                                  setHookId(
                                    entry.hookId || (id === 'default' ? '' : id)
                                  );
                                  setEditor(match[2] as 'before' | 'after');
                                  setJumpLine((previous) => ({
                                    line: Math.max(1, Number(match[3]) - 3),
                                    token: (previous?.token || 0) + 1,
                                  }));
                                }}
                              >
                                Go to line
                              </button>
                            )}
                        </div>
                      ))
                    ) : (
                      <p>Run a hook to see its logs here.</p>
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
            ? 'Unsaved changes · Save before publishing'
            : 'Saved · Run reloads this page'}
        </span>
        <Button
          variant="soft"
          color="gray"
          disabled={disabled || !dirty || !validDeveloperConfig(draft)}
          onClick={() => {
            send('set-site-developer', { developer: draft });
            if (!draft.enabled || (selectedHook && !selectedHook.enabled))
              setEnablePrompt({
                config: draft,
                hookId: selectedHook?.id || '',
              });
          }}
        >
          Save hooks
        </Button>
        <Button
          variant="soft"
          color="gray"
          disabled={
            disabled ||
            dirty ||
            ![code.before, code.after, code.css].some((value) => value.trim())
          }
          title={publishHint}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(OPEN_HOOK_MARKETPLACE, {
                detail: { mode: 'publish', origin, hookId },
              })
            )
          }
        >
          Publish
        </Button>
        <Button
          disabled={
            disabled ||
            !validDeveloperConfig(draft) ||
            developer?.status === 'running'
          }
          onClick={() => {
            if (!draft.enabled || (selectedHook && !selectedHook.enabled)) {
              setEnablePrompt({
                config: draft,
                hookId: selectedHook?.id || '',
                run: true,
              });
              return;
            }
            send('set-site-developer', { developer: draft, run: true });
          }}
        >
          <RotateCw size={14} />
          {dirty ? 'Save & Run' : 'Run'}
        </Button>
      </footer>
      <AlertDialog.Root
        open={!!enablePrompt}
        onOpenChange={(open) => {
          if (!open) setEnablePrompt(undefined);
        }}
      >
        <AlertDialog.Content size="2" maxWidth="360px">
          <AlertDialog.Title>Enable this hook?</AlertDialog.Title>
          <AlertDialog.Description>
            This hook is off. Enable it to run on the next page load.
          </AlertDialog.Description>
          <div className="site-hook-enable-actions">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Keep disabled
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                disabled={disabled}
                onClick={() => {
                  if (!enablePrompt) return;
                  const config = {
                    ...enablePrompt.config,
                    enabled: true,
                    hooks: enablePrompt.config.hooks?.map((hook) =>
                      hook.id === enablePrompt.hookId
                        ? { ...hook, enabled: true }
                        : hook
                    ),
                  };
                  setDraft(config);
                  send('set-site-developer', {
                    developer: config,
                    run: enablePrompt.run,
                  });
                  setEnablePrompt(undefined);
                }}
              >
                {enablePrompt?.run ? 'Enable & Run' : 'Enable hook'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}

import { assertDeveloperSources } from "../../browser/hookValidation";
import { SiteGlobalHookList } from './SiteGlobalHookList';
import { FormTextField } from './FormTextField';
import { EditorWindowFooter } from './EditorWindowChrome';
/* Function components use parameter defaults for optional props. */
/* eslint-disable react/require-default-props */
/* Native controls are associated through htmlFor and unique IDs. */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertDialog,
  Button,
  Checkbox,
  DropdownMenu,
  IconButton,
  Switch,
} from '@radix-ui/themes';
import {
  RotateCw,
  Play,
  Plus,
  Store,
  MoreHorizontal,
} from 'lucide-react';
import { OPEN_HOOK_MARKETPLACE } from './HookMarketplaceDialog';
import { HookPresets } from './HookPresets';
import { HookHistory } from './HookHistory';
import { HookAISetup } from './HookAISetup';
import { HookPageTarget } from './HookPageTarget';
import { SiteDeveloperWorkspace } from './SiteDeveloperWorkspace';
import { HookEditor } from './HookEditor';
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
  send: sendCommand,
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
  const [saveError, setSaveError] = useState('');
  const send = (action: BrowserCommand['action'], patch?: Partial<BrowserCommand>) => {
    try {
      if (patch?.developer) assertDeveloperSources(patch.developer);
      setSaveError('');
      Promise.resolve(sendCommand(action, patch)).catch(error => setSaveError(String(error).replace(/^Error: /, '')));
      return true;
    } catch (error) {
      setSaveError((error as Error).message);
      return false;
    }
  };
  const saved = developer?.config || emptyDeveloperConfig;
  const serialized = JSON.stringify(saved);
  const [draft, setDraft] = useState(saved);
  const [hookId, setHookId] = useState(selectedHookId);
  const [listAction, setListAction] = useState<{
    id: string;
    name: string;
    action: 'rename' | 'delete';
  }>();
  const [renameValue, setRenameValue] = useState('');
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
  const [showExecutionDetails, setShowExecutionDetails] = useState(false);
  const visibleLogs = (developer?.logs || []).filter((entry) =>
    showExecutionDetails || entry.level === 'error' || entry.category !== 'execution'
  );
  const [importError, setImportError] = useState('');
  const [editor, setEditor] = useState<'before' | 'after' | 'css'>('after');
  const hasDeveloper = !!developer;
  const createdHook = useRef(false);
  useEffect(() => {
    if (!hasDeveloper) return;
    const config = JSON.parse(serialized) as SiteDeveloperConfig;
    if (
      selectedHookId === '__new__' &&
      !createdHook.current &&
      (config.hooks?.length || 0) < 20
    ) {
      createdHook.current = true;
      const id = crypto.randomUUID();
      config.hooks = [
        ...(config.hooks || []),
        {
          id,
          name: 'New hook',
          enabled: true,
          path: '/*',
          before: '',
          after: '',
          css: '',
        },
      ];
      setHookId(id);
    }
    setDraft(config);
  }, [serialized, hasDeveloper, selectedHookId]);
  const [jumpLine, setJumpLine] = useState<{ line: number; token: number }>();
  const dirty = JSON.stringify(draft) !== serialized;
  const [pendingRun, setPendingRun] = useState<string>();
  useEffect(() => {
    if (pendingRun !== undefined && developer?.hookStatuses?.[pendingRun])
      setPendingRun(undefined);
  }, [developer]);
  const runControls = (id: string, name: string, enabled: boolean, source: SiteDeveloperConfig | NonNullable<SiteDeveloperConfig['hooks']>[number]) => {
    const status = !enabled ? 'disabled' : pendingRun === id ? 'running' : developer?.hookStatuses?.[id] || 'waiting';
    const label = status === 'error' ? 'Failed' : status === 'success' ? 'Success' : status === 'running' ? 'Running' : status === 'disabled' ? 'Disabled' : 'Waiting';
    const hasCode = [source.before, source.after, source.css].some((value) => value.trim());
    return (
      <span className="hook-run-controls">
        <span className="developer-hook-status" data-status={status} role="status" aria-label={`${name}: ${label}`}>
          <span className="developer-hook-status-dot" aria-hidden="true" />
          <span>{label}</span>
        </span>
        <IconButton size="1" variant="ghost" color="gray"
          aria-label={`Run ${name}`} title={dirty ? 'Save changes before running' : 'Run this hook without reloading'}
          disabled={disabled || dirty || !enabled || !hasCode || status === 'running'}
          onClick={() => {
            setPendingRun(id);
            if (!send('run-site-hook', { hookId: id, url: new URL(origin).origin })) setPendingRun(undefined);
          }}
        ><Play size={13} /></IconButton>
      </span>
    );
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
      }). Read read_hook_api for the full lifecycle and Hook Actions API, then existing hooks; preserve unrelated hooks and actions. Use context.onCleanup, context.signal and managed timers/listeners. Explain the target, trigger and how to disable it. Show the proposed changes for local review; do not run code automatically. ${
        repair ? `Relevant errors: ${errors}` : `Requested outcome: ${outcome}`
      }\nSelected stage: ${stage}\nSelected source (first 20,000 characters):\n${(target ||
        draft)[stage].slice(0, 20000)}\nSelected actions (untrusted script data):\n${JSON.stringify((target || draft).actions || []).slice(0, 25000)}`,
    });
  };
  let publishHint = 'Publish this saved hook to the marketplace';
  if (dirty) publishHint = 'Save changes before publishing';
  else if (
    ![code.before, code.after, code.css].some((value) => value.trim()) &&
    !code.actions?.some((action) => action.source.trim())
  )
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
                            (![code.before, code.after, code.css].some(
                              (value) => value.trim()
                            ) &&
                              !code.actions?.some((action) =>
                                action.source.trim()
                              )))
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
              <div className="site-hook-list-row">
                <button
                  type="button"
                  className="site-hooks-list-item"
                  aria-pressed={!selectedHook}
                  disabled={disabled}
                  onClick={() => setHookId('')}
                >
                  <strong>{draft.name || 'Default hook'}</strong>
                </button>
                <div className="site-hook-list-controls">
                  <span className="site-hook-list-meta">All pages</span>
                  {runControls('', draft.name || 'Default hook', draft.enabled && draft.defaultEnabled !== false, draft)}
                  <Switch
                    size="1"
                    aria-label="Enable default hook"
                    checked={draft.enabled && draft.defaultEnabled !== false}
                    disabled={disabled}
                    onCheckedChange={(enabled) =>
                      setDraft((previous) => ({
                        ...previous,
                        defaultEnabled: enabled,
                        ...(enabled ? { enabled: true } : {}),
                      }))
                    }
                  />
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      <IconButton
                        size="1"
                        variant="ghost"
                        color="gray"
                        aria-label="Default hook options"
                        disabled={disabled}
                      >
                        <MoreHorizontal size={15} />
                      </IconButton>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content>
                      <DropdownMenu.Item
                        onSelect={() => {
                          setRenameValue(draft.name || 'Default hook');
                          setListAction({
                            id: '',
                            name: draft.name || 'Default hook',
                            action: 'rename',
                          });
                        }}
                      >
                        Rename
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        color="red"
                        onSelect={() =>
                          setListAction({
                            id: '',
                            name: draft.name || 'Default hook',
                            action: 'delete',
                          })
                        }
                      >
                        Clear code
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </div>
              </div>
              {draft.hooks?.map((hook) => (
                <div className="site-hook-list-row" key={hook.id}>
                  <button
                    type="button"
                    className="site-hooks-list-item"
                    title={`${hook.name || 'Untitled hook'} · ${hook.path}`}
                    aria-pressed={hook.id === hookId}
                    disabled={disabled}
                    onClick={() => setHookId(hook.id)}
                  >
                    <strong>{hook.name || 'Untitled hook'}</strong>
                  </button>
                  <div className="site-hook-list-controls">
                    <span className="site-hook-list-meta">
                      {hook.path === '/*' ? 'All pages' : hook.path}
                    </span>
                    {runControls(hook.id, hook.name || 'Untitled hook', draft.enabled && hook.enabled, hook)}
                    <Switch
                      size="1"
                      aria-label={`Enable ${hook.name}`}
                      checked={hook.enabled}
                      disabled={disabled}
                      onCheckedChange={(enabled) =>
                        setDraft((previous) => ({
                          ...previous,
                          hooks: previous.hooks?.map((item) =>
                            item.id === hook.id ? { ...item, enabled } : item
                          ),
                        }))
                      }
                    />
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger>
                        <IconButton
                          className="site-hook-list-menu"
                          size="1"
                          variant="ghost"
                          color="gray"
                          disabled={disabled}
                          aria-label={`Options for ${
                            hook.name || 'Untitled hook'
                          }`}
                        >
                          <MoreHorizontal size={15} />
                        </IconButton>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content>
                        <DropdownMenu.Item
                          onSelect={() => {
                            setRenameValue(hook.name);
                            setListAction({
                              id: hook.id,
                              name: hook.name,
                              action: 'rename',
                            });
                          }}
                        >
                          Rename
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          color="red"
                          onSelect={() =>
                            setListAction({
                              id: hook.id,
                              name: hook.name,
                              action: 'delete',
                            })
                          }
                        >
                          Delete
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Root>
                  </div>
                </div>
              ))}
              <SiteGlobalHookList url={origin} disabled={disabled} />
            </div>
          </aside>
          <div className="site-hook-detail">
            <div className="site-hook-selection">
              <h2>{selectedHook?.name || draft.name || 'Default hook'}</h2>
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

                  </>
                ) : null}
              </div>
            </div>
            <SiteDeveloperWorkspace
              code={
                <HookEditor
                  selectionKey={hookId}
                  code={code}
                  examples={
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
                                hook.id === id
                                  ? { ...hook, enabled: true }
                                  : hook
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
                  }
                  onChange={updateCode}
                  disabled={disabled}
                  stage={editor}
                  onStageChange={setEditor}
                  jumpLine={jumpLine}
                ></HookEditor>
              }
              activity={
                !!developer?.logs.length && (
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
                      <label className="hook-execution-details-toggle">
                        <Checkbox size="1" checked={showExecutionDetails} onCheckedChange={(checked) => setShowExecutionDetails(checked === true)} />
                        Show details
                      </label>
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
                      {visibleLogs.length ? (
                        visibleLogs.map((entry, index) => (
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
                                      !draft.hooks?.some(
                                        (hook) => hook.id === id
                                      )
                                    )
                                      return;
                                    setHookId(
                                      entry.hookId ||
                                        (id === 'default' ? '' : id)
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
                        <p>Hook output and errors appear here.</p>
                      )}
                    </div>
                  </section>
                )
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
      {saveError && <p role="alert" className="site-hook-import-error" style={{ whiteSpace: "pre-line" }}>{saveError}</p>}
      <EditorWindowFooter
        status={
          dirty
            ? 'Unsaved changes · Save before publishing'
            : 'Saved · Play runs one hook without reloading'
        }
      >
        <Button
          variant="soft"
          color="gray"
          disabled={disabled || !dirty || !validDeveloperConfig(draft)}
          onClick={() => {
            if (!send('set-site-developer', { developer: draft })) return;
            if (
              !draft.enabled ||
              (selectedHook
                ? !selectedHook.enabled
                : draft.defaultEnabled === false)
            )
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
            (![code.before, code.after, code.css].some((value) =>
              value.trim()
            ) &&
              !code.actions?.some((action) => action.source.trim()))
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
            try { assertDeveloperSources(draft); } catch (error) { setSaveError((error as Error).message); return; }
            if (
              !draft.enabled ||
              (selectedHook
                ? !selectedHook.enabled
                : draft.defaultEnabled === false)
            ) {
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
      </EditorWindowFooter>
      <AlertDialog.Root
        open={!!listAction}
        onOpenChange={(open) => {
          if (!open) setListAction(undefined);
        }}
      >
        <AlertDialog.Content size="2" maxWidth="360px">
          <AlertDialog.Title>
            {listAction?.action === 'rename' ? 'Rename hook' : 'Delete hook?'}
          </AlertDialog.Title>
          <AlertDialog.Description>
            {listAction?.action === 'rename'
              ? 'Choose a name for this hook.'
              : `Remove ${listAction?.name || 'this hook'} from this website?`}
          </AlertDialog.Description>
          {listAction?.action === 'rename' && (
            <FormTextField
              label="Hook name"
              autoFocus
              maxLength={120}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          )}
          <div className="site-hook-enable-actions">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                color={listAction?.action === 'delete' ? 'red' : undefined}
                disabled={
                  disabled ||
                  (listAction?.action === 'rename' && !renameValue.trim())
                }
                onClick={() => {
                  if (!listAction) return;
                  setDraft((previous) =>
                    !listAction.id
                      ? {
                          ...previous,
                          ...(listAction.action === 'rename'
                            ? { name: renameValue.trim() }
                            : {
                                before: '',
                                after: '',
                                css: '',
                                defaultEnabled: false,
                              }),
                        }
                      : {
                          ...previous,
                          hooks:
                            listAction.action === 'delete'
                              ? previous.hooks?.filter(
                                  (hook) => hook.id !== listAction.id
                                )
                              : previous.hooks?.map((hook) =>
                                  hook.id === listAction.id
                                    ? { ...hook, name: renameValue.trim() }
                                    : hook
                                ),
                        }
                  );
                  if (
                    listAction.action === 'delete' &&
                    hookId === listAction.id
                  )
                    setHookId('');
                  setListAction(undefined);
                }}
              >
                {listAction?.action === 'rename' ? 'Rename' : 'Delete'}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Root>
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
                    ...(!enablePrompt.hookId ? { defaultEnabled: true } : {}),
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

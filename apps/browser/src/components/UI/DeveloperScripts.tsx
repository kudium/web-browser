/* Optional callbacks use defaults; Radix controls forward the IDs associated with field labels. */
/* eslint-disable react/require-default-props, no-nested-ternary, jsx-a11y/label-has-associated-control */
import { useEffect, useId, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DropdownMenu,
  IconButton,
  Select,
  TextField,
} from '@radix-ui/themes';
import {
  Play,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { SettingsLibrary } from './SettingsLibrary';
import {
  PanelDropdownContent,
  PanelDialogContent,
  PanelDialogHeader,
  usePanelOverlay,
} from './PanelDialog';
import type {
  ProjectScript,
  ProjectScriptRequest,
} from '../../browser/developerProject';
import { scriptCommandPresets } from '../../browser/scriptCommandPresets';
import { projectErrorMessage } from '../../browser/developerProject';

export function DeveloperScripts({
  sourceId,
  disabled,
  onRun = () => {},
}: {
  sourceId: string;
  disabled: boolean;
  onRun?: () => void;
}) {
  const overlayContainer = usePanelOverlay();
  const fieldId = useId();
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [id, setId] = useState<string>();
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const commandInput = useRef<HTMLInputElement>(null);
  const pickedPreset = useRef(false);
  const [presetLanguage, setPresetLanguage] = useState<string>();
  const preset = scriptCommandPresets.find(
    (entry) => entry.language === presetLanguage
  );
  const presetMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      presetMenu.current
        ?.querySelector<HTMLElement>(
          presetLanguage ? '[data-preset-command]' : '[data-preset-category]'
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [presetLanguage]);
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [deleting, setDeleting] = useState<string>();
  const live = useRef(true);
  const acting = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      revision.current += 1;
    };
  }, [sourceId]);
  const request = async (value: ProjectScriptRequest) => {
    const { current } = revision;
    const result = await window.electron.siteDeveloper.scripts(sourceId, value);
    if (live.current && current === revision.current)
      setScripts(result.scripts);
    return result;
  };
  const refresh = async () => {
    const { current } = revision;
    setLoading(true);
    setError('');
    try {
      await request({ action: 'list' });
    } catch (reason) {
      if (live.current && current === revision.current)
        setError(projectErrorMessage(reason));
    } finally {
      if (live.current && current === revision.current) setLoading(false);
    }
  };
  const run = async (scriptId: string) => {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError('');
    const { current } = revision;
    try {
      await request({ action: 'run', id: scriptId });
      if (live.current && current === revision.current) {
        setOpen(false);
        onRun();
      }
    } catch (reason) {
      if (live.current && current === revision.current)
        setError(projectErrorMessage(reason));
    } finally {
      acting.current = false;
      if (live.current && current === revision.current) setBusy(false);
    }
  };
  const edit = (script?: ProjectScript) => {
    setId(script?.id);
    setName(script?.name || '');
    setCommand(script?.command || '');
    setScope(script?.scope || 'project');
    setEditing(true);
    setError('');
    setDeleting(undefined);
  };
  const save = async (execute: boolean) => {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError('');
    const { current } = revision;
    try {
      const result = await request({
        action: 'save',
        id,
        name,
        command,
        scope,
      });
      const saved = result.scripts
        .slice()
        .reverse()
        .find((script) =>
          id
            ? script.id === id
            : script.name === name.trim() &&
              script.command === command.trim() &&
              script.scope === scope
        );
      if (saved && live.current && current === revision.current)
        setId(saved.id);
      if (execute && saved && live.current && current === revision.current)
        await request({ action: 'run', id: saved.id });
      if (live.current && current === revision.current) {
        setEditing(false);
        if (execute) {
          setOpen(false);
          onRun();
        }
      }
    } catch (reason) {
      if (live.current && current === revision.current)
        setError(projectErrorMessage(reason));
    } finally {
      acting.current = false;
      if (live.current && current === revision.current) setBusy(false);
    }
  };
  const remove = async (scriptId: string) => {
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError('');
    try {
      await request({ action: 'delete', id: scriptId });
      if (live.current) setDeleting(undefined);
    } catch (reason) {
      if (live.current) setError(projectErrorMessage(reason));
    } finally {
      acting.current = false;
      if (live.current) setBusy(false);
    }
  };
  const entries = (target: 'project' | 'global') =>
    scripts.filter((script) => script.scope === target);
  return (
    <>
      <DropdownMenu.Root
        onOpenChange={(shown) => {
          if (shown) refresh();
        }}
      >
        <DropdownMenu.Trigger>
          <Button
            size="1"
            variant="ghost"
            color="gray"
            disabled={disabled || busy}
            aria-label="Scripts"
            title="Scripts"
          >
            <Play size={13} />
            <span className="developer-project-action-label">Scripts</span>
            <ChevronDown size={12} />
          </Button>
        </DropdownMenu.Trigger>
        <PanelDropdownContent size="1" className="developer-scripts-menu">
          {loading && (
            <DropdownMenu.Item disabled>Loading scripts…</DropdownMenu.Item>
          )}
          {!loading && !scripts.length && (
            <DropdownMenu.Item disabled>No saved scripts</DropdownMenu.Item>
          )}
          {!loading &&
            (['project', 'global'] as const).map((target) =>
              entries(target).length ? (
                <div key={target}>
                  <DropdownMenu.Label>
                    {target === 'project' ? 'This project' : 'All projects'}
                  </DropdownMenu.Label>
                  {entries(target).map((script) => (
                    <DropdownMenu.Item
                      key={script.id}
                      title={script.command}
                      onSelect={() => run(script.id)}
                    >
                      <Play size={12} />
                      <span className="developer-script-menu-name">
                        {script.name}
                      </span>
                    </DropdownMenu.Item>
                  ))}
                </div>
              ) : null
            )}
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            onSelect={() => {
              setOpen(true);
              setEditing(false);
              setDeleting(undefined);
              refresh();
            }}
          >
            Manage scripts…
          </DropdownMenu.Item>
        </PanelDropdownContent>
      </DropdownMenu.Root>
      {error && !open && (
        <p
          role="alert"
          className="developer-project-notice developer-script-error"
        >
          {error}
        </p>
      )}
      <Dialog.Root
        open={open}
        onOpenChange={(shown) => {
          if (!busy) setOpen(shown);
        }}
      >
        <PanelDialogContent
          size="2"
          maxWidth="460px"
          className="developer-scripts-dialog"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy || editing) event.preventDefault();
          }}
        >
          <PanelDialogHeader
            title={editing ? (id ? 'Edit script' : 'New script') : 'Scripts'}
            leading={
              editing ? (
                <IconButton
                  type="button"
                  size="1"
                  variant="ghost"
                  color="gray"
                  aria-label="Back to scripts"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setError('');
                  }}
                >
                  <ArrowLeft size={16} />
                </IconButton>
              ) : null
            }
          />
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save(false);
              }}
            >
              <div className="developer-script-fields">
                <label htmlFor={`${fieldId}-name`}>
                  <span>Name</span>
                  <TextField.Root
                    id={`${fieldId}-name`}
                    aria-label="Script name"
                    value={name}
                    maxLength={60}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Start development"
                    disabled={busy}
                  />
                </label>
                <div className="developer-script-command-field">
                  <label htmlFor={`${fieldId}-command`}>Command</label>
                  <TextField.Root
                    ref={commandInput}
                    className="developer-script-command"
                    id={`${fieldId}-command`}
                    aria-label="Script command"
                    value={command}
                    maxLength={4096}
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="npm run dev"
                    disabled={busy}
                  >
                    <TextField.Slot
                      side="right"
                      className="developer-script-command-slot"
                    >
                      <DropdownMenu.Root
                        onOpenChange={(next) => {
                          if (next) {
                            pickedPreset.current = false;
                            setPresetLanguage(undefined);
                          }
                        }}
                      >
                        <DropdownMenu.Trigger>
                          <Button
                            type="button"
                            size="1"
                            color="gray"
                            variant="ghost"
                            className="developer-script-preset-trigger"
                            disabled={busy}
                            aria-label="Suggest a script command"
                            title="Common commands"
                          >
                            Suggestions{' '}
                            <ChevronDown size={12} aria-hidden="true" />
                          </Button>
                        </DropdownMenu.Trigger>
                        <PanelDropdownContent
                          size="1"
                          ref={presetMenu}
                          className={`developer-script-presets ${
                            preset ? 'developer-script-preset-commands' : ''
                          }`}
                          align="end"
                          collisionPadding={12}
                          onCloseAutoFocus={(event) => {
                            if (pickedPreset.current) {
                              event.preventDefault();
                              commandInput.current?.focus();
                            }
                          }}
                        >
                          {preset ? (
                            <>
                              <DropdownMenu.Item
                                onSelect={(event) => {
                                  event.preventDefault();
                                  setPresetLanguage(undefined);
                                }}
                              >
                                <ArrowLeft size={12} aria-hidden="true" /> All
                                languages
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator />
                              <DropdownMenu.Label>
                                {preset.language}
                              </DropdownMenu.Label>
                              {preset.commands.map(([title, value]) => (
                                <DropdownMenu.Item
                                  key={value}
                                  data-preset-command
                                  textValue={`${title} ${value}`}
                                  onSelect={() => {
                                    pickedPreset.current = true;
                                    setCommand(value);
                                  }}
                                >
                                  <span className="developer-script-preset-copy">
                                    <span>{title}</span>
                                    <code>{value}</code>
                                  </span>
                                </DropdownMenu.Item>
                              ))}
                            </>
                          ) : (
                            scriptCommandPresets.map((entry) => (
                              <DropdownMenu.Item
                                key={entry.language}
                                data-preset-category
                                onSelect={(event) => {
                                  event.preventDefault();
                                  setPresetLanguage(entry.language);
                                }}
                              >
                                <span className="developer-script-preset-category">
                                  {entry.language}
                                </span>
                                <ChevronRight size={12} aria-hidden="true" />
                              </DropdownMenu.Item>
                            ))
                          )}
                        </PanelDropdownContent>
                      </DropdownMenu.Root>
                    </TextField.Slot>
                  </TextField.Root>
                </div>
                <label htmlFor={`${fieldId}-scope`}>
                  <span>Available in</span>
                  <Select.Root
                    value={scope}
                    onValueChange={(value: 'project' | 'global') =>
                      setScope(value)
                    }
                    disabled={busy}
                  >
                    <Select.Trigger
                      id={`${fieldId}-scope`}
                      aria-label="Script scope"
                    />
                    <Select.Content
                      container={overlayContainer}
                      position={overlayContainer ? 'popper' : 'item-aligned'}
                      collisionBoundary={overlayContainer}
                      collisionPadding={12}
                    >
                      <Select.Item value="project">This project</Select.Item>
                      <Select.Item value="global">All projects</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </label>
              </div>
              <Dialog.Description className="developer-script-hint">
                {scope === 'global'
                  ? 'Runs in whichever project you have selected.'
                  : 'Saved for this group’s linked project folder.'}
              </Dialog.Description>
              {error && (
                <p role="alert" className="developer-project-notice">
                  {error}
                </p>
              )}
              <div className="developer-script-footer">
                <Button
                  type="button"
                  color="gray"
                  variant="soft"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setError('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  color="gray"
                  variant="soft"
                  disabled={busy || !name.trim() || !command.trim()}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  disabled={busy || !name.trim() || !command.trim()}
                  onClick={() => save(true)}
                >
                  Save & run
                </Button>
              </div>
            </form>
          ) : (
            <>
              <Dialog.Description size="2" className="developer-script-hint">
                Run saved commands in a new project terminal.
              </Dialog.Description>
              <div className="developer-script-list" aria-busy={loading}>
                {loading && (
                  <p className="developer-script-hint">Loading scripts…</p>
                )}
                <SettingsLibrary
                  label="Saved scripts"
                  entries={scripts.map((script) => ({
                    ...script,
                    subtitle:
                      script.scope === 'global'
                        ? 'All projects'
                        : 'This project',
                  }))}
                  renderToolbar={() => (
                    <IconButton
                      size="1"
                      variant="ghost"
                      color="gray"
                      aria-label="Add script"
                      disabled={loading || busy}
                      onClick={() => edit()}
                    >
                      <Plus size={13} />
                    </IconButton>
                  )}
                >
                  {(script) => (
                    <div className="developer-script-row" key={script.id}>
                      <div className="developer-script-row-main">
                        <div className="developer-script-copy">
                          <strong>{script.name}</strong>
                          <code title={script.command}>{script.command}</code>
                        </div>
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="gray"
                          aria-label={`Run ${script.name}`}
                          disabled={busy}
                          onClick={async () => {
                            await run(script.id);
                          }}
                        >
                          <Play size={13} />
                        </IconButton>
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="gray"
                          aria-label={`Edit ${script.name}`}
                          disabled={busy}
                          onClick={() => edit(script)}
                        >
                          <Pencil size={13} />
                        </IconButton>
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="gray"
                          aria-label={`Delete ${script.name}`}
                          disabled={busy}
                          onClick={() => setDeleting(script.id)}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                      {deleting === script.id && (
                        <div className="developer-script-delete">
                          <p>
                            {script.scope === 'global'
                              ? 'Remove this script from all projects?'
                              : 'Remove this saved script?'}
                          </p>
                          <div>
                            <Button
                              size="1"
                              color="gray"
                              variant="soft"
                              disabled={busy}
                              onClick={() => setDeleting(undefined)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="1"
                              color="red"
                              variant="soft"
                              disabled={busy}
                              onClick={() => remove(script.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </SettingsLibrary>
              </div>
              {error && (
                <p role="alert" className="developer-project-notice">
                  {error}
                </p>
              )}
              <div className="developer-script-footer">
                <Dialog.Close>
                  <Button color="gray" variant="soft" disabled={busy}>
                    Done
                  </Button>
                </Dialog.Close>
              </div>
            </>
          )}
        </PanelDialogContent>
      </Dialog.Root>
    </>
  );
}

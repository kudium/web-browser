/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */
import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  Button,
  Callout,
  Switch,
  Text,
  DropdownMenu,
  Dialog,
  TextField,
  TextArea,
} from '@radix-ui/themes';
import { Plus, Trash2 } from 'lucide-react';
import { PreferenceHint } from '../../UI/PreferenceHint';
import { PanelDialogHeader } from '../../UI/PanelDialog';
import type { AISkill, AISkillsRequest } from '../../../browser/aiSkills';

const errorMessage = (reason: unknown) =>
  String(reason)
    .replace(/^Error: /, '')
    .replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export function AISkillsSettings() {
  const errorRef = useRef<HTMLDivElement>(null);
  const [skills, setSkills] = useState<AISkill[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [editor, setEditor] = useState<'link' | 'create' | null>(null);
  const [source, setSource] = useState('');
  const [skillName, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dialogError, setDialogError] = useState('');
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [error]);
  useEffect(() => {
    let alive = true;
    window.electron.ai
      .skills({ action: 'list' })
      .then((value) => {
        if (alive) {
          setSkills(value);
          setReady(true);
          setError('');
        }
        return undefined;
      })
      .catch((reason) => {
        if (alive) setError(errorMessage(reason));
      });
    return () => {
      alive = false;
    };
  }, [retry]);
  const change = async (
    request: AISkillsRequest,
    file: File | undefined = undefined,
    inDialog = false
  ) => {
    if (busy) return false;
    setBusy(true);
    setError('');
    setDialogError('');
    try {
      setSkills(
        await (file
          ? window.electron.ai.skillsFromDrop(file)
          : window.electron.ai.skills(request))
      );
      return true;
    } catch (reason) {
      if (inDialog) setDialogError(errorMessage(reason));
      else setError(errorMessage(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submitLabel = editor === 'link' ? 'Install skill' : 'Create skill';
  return (
    <div
      className={`ai-skills-settings${dragging ? ' is-dragging' : ''}`}
      role="region"
      aria-label="Skills library"
      onDragOver={(event) => {
        if (!editor && event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          if (ready && !busy) setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(event) => {
        if (editor || !event.dataTransfer.files.length) return;
        event.preventDefault();
        setDragging(false);
        if (!ready || busy) return;
        if (event.dataTransfer.files.length !== 1) {
          setError('Drop one skill file or folder at a time.');
          return;
        }
        change({ action: 'import-path' }, event.dataTransfer.files[0]);
      }}
    >
      <div className="section-heading">
        <div className="ai-skills-title">
          <strong>Skills</strong>
          <PreferenceHint label="Skills">
            <Text as="p" size="2">
              Skills give your AI reusable instructions. Add a SKILL.md file,
              import a folder with text resources, or write your own.
            </Text>
            <Text as="p" size="2">
              Review the saved copy, then enable it. Enabled skills are shared
              with your AI when used. Existing permissions apply; scripts never
              run automatically.
            </Text>
          </PreferenceHint>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Button disabled={!ready || busy}>
              <Plus size={16} />
              Add skill
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Item
              onSelect={() => {
                setSource('');
                setDialogError('');
                setEditor('link');
              }}
            >
              From link…
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => change({ action: 'add', source: 'file' })}
            >
              Import file…
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => change({ action: 'add', source: 'folder' })}
            >
              Import folder…
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => {
                setName('');
                setDescription('');
                setInstructions('');
                setDialogError('');
                setEditor('create');
              }}
            >
              Create skill…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
      {dragging && (
        <Text size="2" className="ai-skills-drop-notice">
          Drop to import a skill
        </Text>
      )}
      <Dialog.Root
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null);
        }}
      >
        <Dialog.Content
          className="ai-skill-editor"
          maxWidth="540px"
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <PanelDialogHeader
            title={editor === 'link' ? 'Install from link' : 'Create skill'}
          />
          <Dialog.Description
            className="ai-skill-editor-description"
            size="2"
            color="gray"
          >
            {editor === 'link'
              ? 'Use a SKILL.md link or a GitHub skill folder. Links import instructions only.'
              : 'Write reusable instructions for your AI. New skills start disabled.'}
          </Dialog.Description>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const saved = await change(
                editor === 'link'
                  ? { action: 'import-link', source }
                  : {
                      action: 'create',
                      name: skillName,
                      description,
                      instructions,
                    },
                undefined,
                true
              );
              if (saved) setEditor(null);
            }}
          >
            <div className="ai-skill-editor-fields">
              {editor === 'link' ? (
                <label htmlFor="ai-skill-link">
                  Skill link
                  <TextField.Root
                    autoFocus
                    required
                    id="ai-skill-link"
                    type="url"
                    value={source}
                    maxLength={4096}
                    placeholder="https://github.com/…/SKILL.md"
                    onChange={(event) => setSource(event.target.value)}
                    disabled={busy}
                  />
                </label>
              ) : (
                <>
                  <label htmlFor="ai-skill-name">
                    Name
                    <TextField.Root
                      autoFocus
                      required
                      id="ai-skill-name"
                      value={skillName}
                      maxLength={100}
                      placeholder="Project review"
                      onChange={(event) => setName(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label htmlFor="ai-skill-description">
                    Description
                    <TextField.Root
                      id="ai-skill-description"
                      value={description}
                      maxLength={800}
                      placeholder="When should the AI use this skill?"
                      onChange={(event) => setDescription(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label htmlFor="ai-skill-instructions">
                    Instructions
                    <TextArea
                      required
                      id="ai-skill-instructions"
                      value={instructions}
                      maxLength={65536}
                      rows={8}
                      placeholder="Describe the workflow, tools to use, and how to check the result…"
                      onChange={(event) => setInstructions(event.target.value)}
                      disabled={busy}
                    />
                  </label>
                </>
              )}
              {dialogError && (
                <Callout.Root color="red" role="alert">
                  <Callout.Text>{dialogError}</Callout.Text>
                </Callout.Root>
              )}
            </div>
            <div className="dialog-actions">
              <Button
                type="button"
                variant="soft"
                color="gray"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (editor === 'link'
                    ? !source.trim()
                    : !skillName.trim() || !instructions.trim())
                }
              >
                {busy ? 'Saving…' : submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>
      {error && (
        <Callout.Root ref={errorRef} color="red" role="alert">
          <Callout.Text>{error}</Callout.Text>
          <Button
            variant="soft"
            color="gray"
            disabled={busy}
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </Button>
        </Callout.Root>
      )}
      {!ready && !error && <Text color="gray">Loading skills…</Text>}
      {ready && !skills.length && (
        <div className="ai-skills-empty">
          <strong>Drop a skill here</strong>
          <Text as="p" size="2" color="gray">
            A SKILL.md file or a skill folder
          </Text>
        </div>
      )}
      <div className="ai-skills-list">
        {skills.map((skill) => (
          <article key={skill.id} className="ai-skill-row">
            <div className="ai-skill-heading">
              <div>
                <strong>{skill.name}</strong>
                <Text as="p" size="2" color="gray">
                  {skill.description || 'Local skill'}
                </Text>
              </div>
              <Switch
                aria-label={`Enable ${skill.name}`}
                checked={skill.enabled}
                disabled={busy}
                onCheckedChange={(enabled) =>
                  change({ action: 'toggle', id: skill.id, enabled })
                }
              />
            </div>
            <details>
              <summary>View instructions and resources</summary>
              <div className="ai-skill-source">
                <div
                  className="ai-skill-code"
                  role="textbox"
                  aria-readonly="true"
                  aria-label={`${skill.name} instructions`}
                  tabIndex={0}
                >
                  {skill.instructions}
                </div>
                {Object.entries(skill.resources).map(([name, content]) => (
                  <details key={name}>
                    <summary>{name}</summary>
                    <div
                      className="ai-skill-code"
                      role="textbox"
                      aria-readonly="true"
                      aria-label={name}
                      tabIndex={0}
                    >
                      {content}
                    </div>
                  </details>
                ))}
              </div>
            </details>
            <div className="ai-skill-footer">
              <Text size="1" color="gray">
                {skill.enabled ? 'Enabled' : 'Disabled'} ·{' '}
                {Object.keys(skill.resources).length} text{' '}
                {Object.keys(skill.resources).length === 1
                  ? 'resource'
                  : 'resources'}
              </Text>
              <AlertDialog.Root>
                <AlertDialog.Trigger>
                  <Button
                    variant="ghost"
                    color="gray"
                    size="1"
                    disabled={busy}
                    aria-label={`Remove ${skill.name}`}
                  >
                    <Trash2 size={14} />
                    Remove
                  </Button>
                </AlertDialog.Trigger>
                <AlertDialog.Content maxWidth="400px">
                  <AlertDialog.Title>Remove {skill.name}?</AlertDialog.Title>
                  <AlertDialog.Description>
                    This removes the installed copy. Your original skill folder
                    is kept.
                  </AlertDialog.Description>
                  <div className="dialog-actions">
                    <AlertDialog.Cancel>
                      <Button variant="soft" color="gray">
                        Cancel
                      </Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action>
                      <Button
                        color="red"
                        onClick={() =>
                          change({ action: 'remove', id: skill.id })
                        }
                      >
                        Remove skill
                      </Button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Root>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

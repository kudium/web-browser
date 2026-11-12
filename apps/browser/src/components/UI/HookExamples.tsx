import { useState } from 'react';
import { Button, DropdownMenu, Dialog, TextField } from '@radix-ui/themes';
import { readHookExamples, saveHookExamples } from '../../browser/hookExamples';
import type { HookExample, HookStage } from '../../browser/hookExamples';

export function HookExamples({
  stage,
  source,
  disabled,
  onInsert,
}: {
  stage: HookStage;
  source: string;
  disabled: boolean;
  onInsert: (exampleSource: string) => void;
}) {
  const [saved, setSaved] = useState(readHookExamples);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<HookExample>();
  const persist = (next: HookExample[]) => {
    try {
      saveHookExamples(next);
      setSaved(next);
      setError('');
      return true;
    } catch (failure) {
      setError(String(failure));
      return false;
    }
  };
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button size="1" variant="ghost" color="gray" disabled={disabled}>
            Saved scripts
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Label>Insert into current script</DropdownMenu.Label>
          {saved
            .filter((example) => example.stage === stage)
            .map((example) => (
              <DropdownMenu.Item
                key={example.id}
                onSelect={() => onInsert(example.source)}
              >
                {example.name}
              </DropdownMenu.Item>
            ))}
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            disabled={!source.trim()}
            onSelect={() => setOpen(true)}
          >
            Save example…
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => {
              setError('');
              setEditing(undefined);
              setManaging(true);
            }}
          >
            Manage examples…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Dialog.Root open={managing} onOpenChange={setManaging}>
        <Dialog.Content
          className="hook-examples-manager"
          style={{ maxWidth: 640 }}
        >
          <Dialog.Title size="3">Manage examples</Dialog.Title>
          <Dialog.Description>
            Edit your saved scripts for reuse on any page. Built-in enhancements
            are available in the Examples picker.
          </Dialog.Description>
          <div className="hook-examples-list">
            {!saved.length && (
              <p>
                No saved examples yet. Use Save example in the Saved scripts
                menu.
              </p>
            )}
            {saved.map((example) => (
              <div className="hook-examples-row" key={example.id}>
                <button
                  type="button"
                  className="hook-examples-select"
                  aria-pressed={editing?.id === example.id}
                  onClick={() => setEditing({ ...example })}
                >
                  <strong>{example.name}</strong>
                  <small>
                    {
                      {
                        before: 'Before load',
                        after: 'After load',
                        css: 'CSS',
                      }[example.stage]
                    }
                  </small>
                </button>
                <Button
                  size="1"
                  variant="ghost"
                  color="red"
                  aria-label={`Delete ${example.name}`}
                  onClick={() => {
                    if (
                      persist(saved.filter((item) => item.id !== example.id)) &&
                      editing?.id === example.id
                    )
                      setEditing(undefined);
                  }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
          {editing && (
            <div className="hook-example-edit">
              {/* TextField renders its input with the matching ID. */}
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
              <label htmlFor="saved-example-name">
                Name
                <TextField.Root
                  id="saved-example-name"
                  aria-label="Saved example name"
                  maxLength={120}
                  value={editing.name}
                  onChange={(event) =>
                    setEditing({ ...editing, name: event.target.value })
                  }
                />
              </label>
              <label htmlFor="saved-example-stage">
                Stage
                <select
                  id="saved-example-stage"
                  aria-label="Saved example stage"
                  value={editing.stage}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      stage: event.target.value as HookStage,
                    })
                  }
                >
                  <option value="before">Before load</option>
                  <option value="after">After load</option>
                  <option value="css">CSS</option>
                </select>
              </label>
              <label htmlFor="saved-example-script">
                Script
                <textarea
                  id="saved-example-script"
                  aria-label="Saved example script"
                  value={editing.source}
                  maxLength={100000}
                  spellCheck={false}
                  onChange={(event) =>
                    setEditing({ ...editing, source: event.target.value })
                  }
                />
              </label>
              <Button
                size="1"
                disabled={!editing.name.trim() || !editing.source.trim()}
                onClick={() => {
                  if (
                    saved.some(
                      (item) =>
                        item.id !== editing.id &&
                        item.name === editing.name.trim() &&
                        item.stage === editing.stage
                    )
                  ) {
                    setError(
                      'An example with this name and stage already exists. Choose another name.'
                    );
                    return;
                  }
                  if (
                    persist(
                      saved.map((item) =>
                        item.id === editing.id
                          ? { ...editing, name: editing.name.trim() }
                          : item
                      )
                    )
                  )
                    setEditing(undefined);
                }}
              >
                Save changes
              </Button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <Dialog.Close>
            <Button size="1" variant="soft" color="gray">
              Done
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Root>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content style={{ maxWidth: 360 }}>
          <Dialog.Title size="3">Save example</Dialog.Title>
          <Dialog.Description>
            Reuse this script on other pages from Examples. Saved on this
            device.
          </Dialog.Description>
          <TextField.Root
            aria-label="Example name"
            placeholder="Example name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            size="1"
            disabled={!name.trim()}
            onClick={() => {
              try {
                const next = [
                  ...saved.filter(
                    (example) =>
                      !(example.name === name.trim() && example.stage === stage)
                  ),
                  { id: crypto.randomUUID(), name: name.trim(), stage, source },
                ];
                if (next.length > 50)
                  throw new Error(
                    'You can save up to 50 examples. Reuse an existing name to replace it.'
                  );
                saveHookExamples(next);
                setSaved(next);
                setName('');
                setError('');
                setOpen(false);
              } catch (failure) {
                setError(String(failure));
              }
            }}
          >
            Save
          </Button>
          {error && <p role="alert">{error}</p>}
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, TextField, Text } from '@radix-ui/themes';
import { Plus, RotateCcw, Search, Upload, Download } from 'lucide-react';
import { browser } from '../../../browser/client';
import {
  shortcutActions,
  defaultShortcuts,
  displayBinding,
  bindingFromInput,
  validateShortcuts,
  exportShortcuts,
  importShortcuts,
  ShortcutAction,
  ShortcutBindings,
} from '../../../browser/shortcuts';

export function KeyboardShortcuts({
  bindings,
  busy,
  save,
}: {
  bindings: ShortcutBindings;
  busy: boolean;
  save: (next: ShortcutBindings) => Promise<boolean>;
}) {
  const mac = navigator.platform.toLowerCase().includes('mac');
  const [editing, setEditing] = useState<ShortcutAction>();
  const [captured, setCaptured] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [pendingImport, setPendingImport] = useState<ShortcutBindings>();
  const [transferError, setTransferError] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importRequest = useRef(0);
  useEffect(
    () => () => {
      importRequest.current += 1;
    },
    [],
  );
  const changedActions = pendingImport
    ? shortcutActions.filter(
        (action) =>
          JSON.stringify(bindings[action.id]) !==
          JSON.stringify(pendingImport[action.id]),
      )
    : [];

  useEffect(() => {
    if (!editing) return undefined;
    browser
      .preferenceAction('shortcut-capture-start')
      .catch((reason) => setError(String(reason)));
    return () => {
      browser.preferenceAction('shortcut-capture-end').catch(() => {});
    };
  }, [editing]);
  const change = async (id: ShortcutAction, keys: string[]) => {
    try {
      const next = validateShortcuts({ ...bindings, [id]: keys }, mac);
      if (await save(next)) {
        setEditing(undefined);
        setError('');
      } else setError('Couldn’t save this shortcut. Try again.');
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  return (
    <div className="keyboard-shortcuts">
      <div className="shortcut-intro">
        <Text as="p" size="2" color="gray">
          Customize shortcuts for navigation, your spaces, and the Assistant.
        </Text>
        <Text as="p" size="1" color="gray">
          {mac ? 'Command' : 'Control'} + S saves the file when the developer
          editor has focus.
        </Text>
      </div>
      {error && !editing && (
        <Text role="alert" color="red" size="2">
          {error}
        </Text>
      )}
      <div className="shortcut-toolbar">
        <TextField.Root
          aria-label="Search keyboard shortcuts"
          placeholder="Search shortcuts"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        >
          <TextField.Slot>
            <Search size={15} aria-hidden="true" />
          </TextField.Slot>
        </TextField.Root>
        <div className="shortcut-controls shortcut-transfer-controls">
          <Button
            variant="soft"
            size="1"
            aria-label="Import shortcuts"
            disabled={busy || transferBusy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={14} aria-hidden="true" /> Import
          </Button>
          <Button
            variant="soft"
            size="1"
            aria-label="Export shortcuts"
            disabled={busy || transferBusy}
            onClick={() => {
              try {
                const url = URL.createObjectURL(
                  new Blob([exportShortcuts(bindings, mac)], {
                    type: 'application/json',
                  }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'kudiumbrowser-shortcuts.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setTransferError('');
              } catch (reason) {
                setTransferError((reason as Error).message);
              }
            }}
          >
            <Download size={14} aria-hidden="true" /> Export
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-label="Import shortcut file"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              importRequest.current += 1;
              const request = importRequest.current;
              setTransferBusy(true);
              setTransferError('');
              try {
                if (file.size > 65536)
                  throw new Error('Shortcut file is too large');
                const next = importShortcuts(await file.text(), mac);
                if (request === importRequest.current) setPendingImport(next);
              } catch (reason) {
                if (request === importRequest.current)
                  setTransferError((reason as Error).message);
              } finally {
                if (request === importRequest.current) setTransferBusy(false);
              }
            }}
          />
          <Button
            variant="ghost"
            size="1"
            aria-label="Reset all shortcuts"
            disabled={busy || transferBusy}
            onClick={() => save(defaultShortcuts)}
          >
            <RotateCcw size={14} aria-hidden="true" /> Reset all
          </Button>
        </div>
      </div>
      {transferError && !pendingImport && (
        <Text role="alert" color="red" size="2">
          {transferError}
        </Text>
      )}
      <Dialog.Root
        open={!!pendingImport}
        onOpenChange={(open) => {
          if (!open && !transferBusy) setPendingImport(undefined);
        }}
      >
        <Dialog.Content
          maxWidth="480px"
          onEscapeKeyDown={(event) => {
            if (transferBusy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (transferBusy) event.preventDefault();
          }}
        >
          <Dialog.Title>Import shortcuts</Dialog.Title>
          <Dialog.Description size="2">
            Replace your shortcuts with this file. {changedActions.length}{' '}
            actions will change. Command / Control adapts to this computer.
          </Dialog.Description>
          <div style={{ maxHeight: 280, overflowY: 'auto', marginBlock: 16 }}>
            {changedActions.map((action) => (
              <div className="preference-row" key={action.id}>
                <strong>{action.title}</strong>
                <Text size="2">
                  {pendingImport?.[action.id]
                    .map((key) => displayBinding(key, mac))
                    .join(', ') || 'Unassigned'}
                </Text>
              </div>
            ))}
          </div>
          <div className="shortcut-controls">
            <Button
              variant="surface"
              disabled={transferBusy}
              onClick={() => setPendingImport(undefined)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || transferBusy || !changedActions.length}
              onClick={async () => {
                if (!pendingImport) return;
                setTransferBusy(true);
                setTransferError('');
                try {
                  if (await save(pendingImport)) setPendingImport(undefined);
                  else
                    setTransferError(
                      'Shortcuts could not be saved. Try again.',
                    );
                } catch {
                  setTransferError('Shortcuts could not be saved. Try again.');
                } finally {
                  setTransferBusy(false);
                }
              }}
            >
              Replace shortcuts
            </Button>
          </div>
          {transferError && (
            <Text role="alert" color="red" size="2">
              {transferError}
            </Text>
          )}
        </Dialog.Content>
      </Dialog.Root>

      {shortcutActions
        .filter((action) =>
          `${action.title} ${bindings[action.id]
            .map((key) => displayBinding(key, mac))
            .join(' ')}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .map((action) => (
          <div className="preference-row" key={action.id}>
            <strong>{action.title}</strong>
            <div className="shortcut-controls">
              {bindings[action.id].map((key, index) => (
                <span className="shortcut-binding" key={key}>
                  <kbd>{displayBinding(key, mac)}</kbd>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Remove ${
                      action.title
                    } shortcut ${displayBinding(key, mac)}`}
                    title="Remove this shortcut"
                    onClick={() =>
                      change(
                        action.id,
                        bindings[action.id].filter(
                          (_, position) => position !== index,
                        ),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              {!bindings[action.id].length && (
                <Text size="2" color="gray">
                  Unassigned
                </Text>
              )}
              <Button
                variant="surface"
                disabled={busy}
                aria-label={`Change ${action.title} shortcut`}
                onClick={() => {
                  setAdding(false);
                  setEditing(action.id);
                  setCaptured(undefined);
                  setError('');
                }}
              >
                Change
              </Button>
              <Button
                variant="ghost"
                disabled={busy || bindings[action.id].length >= 4}
                title="Add alternate shortcut"
                aria-label={`Add ${action.title} alternate shortcut`}
                onClick={() => {
                  setAdding(true);
                  setEditing(action.id);
                  setCaptured(undefined);
                  setError('');
                }}
              >
                <Plus size={15} />
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                title="Reset shortcut"
                aria-label={`Reset ${action.title} shortcut`}
                onClick={() => change(action.id, [...action.keys])}
              >
                <RotateCcw size={14} />
              </Button>
            </div>
          </div>
        ))}
      <Dialog.Root
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <Dialog.Content className="shortcut-capture">
          <Dialog.Title>
            {shortcutActions.find((action) => action.id === editing)?.title}
          </Dialog.Title>
          <Dialog.Description size="2">
            {adding
              ? 'Add an alternate without changing existing shortcuts.'
              : 'Replace the current shortcuts with a new key combination.'}{' '}
            Escape cancels.
          </Dialog.Description>
          <TextField.Root
            aria-label="New shortcut"
            placeholder="Press your shortcut"
            value={captured ? displayBinding(captured, mac) : ''}
            readOnly
            autoFocus
            onKeyDown={(event) => {
              if (
                event.key === 'Escape' ||
                (event.key === 'Tab' &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.altKey)
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              const key = bindingFromInput(
                {
                  code: event.code,
                  key: event.key,
                  meta: event.metaKey,
                  control: event.ctrlKey,
                  alt: event.altKey,
                  shift: event.shiftKey,
                },
                mac,
              );
              if (key) {
                setCaptured(key);
                setError('');
              }
            }}
          />
          {error && (
            <Text role="alert" color="red" size="2">
              {error}
            </Text>
          )}
          <div className="shortcut-controls" style={{ marginTop: 16 }}>
            {!adding && (
              <Button
                variant="surface"
                disabled={busy}
                onClick={() => editing && change(editing, [])}
              >
                Unassign
              </Button>
            )}
            <Dialog.Close>
              <Button variant="surface">Cancel</Button>
            </Dialog.Close>
            <Button
              disabled={!captured || busy}
              onClick={() =>
                editing &&
                captured &&
                change(
                  editing,
                  adding ? [...bindings[editing], captured] : [captured],
                )
              }
            >
              Save
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}

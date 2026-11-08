import { Button, IconButton, TextField } from '@radix-ui/themes';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { IApp } from '../../types';
import { resolveAddress } from '../../utils/navigation';

export interface GroupTabChanges {
  edits: Record<string, { customName?: string; url?: string }>;
  added: { id: string; name: string; url: string }[];
  removed: string[];
}
export function GroupTabsSettings({
  tabs,
  changes,
  onChange,
}: {
  tabs: IApp[];
  changes: GroupTabChanges;
  onChange: (next: GroupTabChanges) => void;
}) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const rows: { id: string; name: string; url: string; customName?: string }[] =
    [
      ...tabs.map((tab) => ({
        id: tab.id,
        name: tab.customName || tab.name,
        url: tab.url,
        ...changes.edits[tab.id],
      })),
      ...changes.added,
    ].filter((tab) => !changes.removed.includes(tab.id));
  return (
    <section className="group-tabs-settings" aria-label="Tabs">
      <div className="group-project-folder-header">
        <strong>Tabs</strong>
        <span>{rows.length}</span>
      </div>
      <div className="group-tabs-list">
        {rows.map((tab) => (
          <div className="group-tab-settings-row" key={tab.id}>
            <div className="group-tab-settings-fields">
              <TextField.Root
                aria-label={`Tab name: ${tab.name}`}
                value={tab.customName ?? tab.name}
                placeholder="Tab name"
                onChange={(event) => {
                  const name = event.target.value;
                  onChange(
                    changes.added.some((entry) => entry.id === tab.id)
                      ? {
                          ...changes,
                          added: changes.added.map((entry) =>
                            entry.id === tab.id ? { ...entry, name } : entry
                          ),
                        }
                      : {
                          ...changes,
                          edits: {
                            ...changes.edits,
                            [tab.id]: {
                              ...changes.edits[tab.id],
                              customName: name,
                            },
                          },
                        }
                  );
                }}
              />
              <TextField.Root
                aria-label={`Tab address: ${tab.name}`}
                value={tab.url}
                placeholder="https://example.com"
                onChange={(event) => {
                  const url = event.target.value;
                  onChange(
                    changes.added.some((entry) => entry.id === tab.id)
                      ? {
                          ...changes,
                          added: changes.added.map((entry) =>
                            entry.id === tab.id ? { ...entry, url } : entry
                          ),
                        }
                      : {
                          ...changes,
                          edits: {
                            ...changes.edits,
                            [tab.id]: { ...changes.edits[tab.id], url },
                          },
                        }
                  );
                }}
              />
            </div>
            <IconButton
              type="button"
              variant="ghost"
              color="gray"
              aria-label={`Remove tab: ${tab.name}`}
              title="Remove tab"
              onClick={() =>
                onChange({
                  ...changes,
                  added: changes.added.filter((entry) => entry.id !== tab.id),
                  removed: [...changes.removed, tab.id],
                })
              }
            >
              <X size={15} />
            </IconButton>
          </div>
        ))}
      </div>
      <div className="group-tabs-add">
        <TextField.Root
          aria-label="New tab address"
          placeholder="Add a website URL…"
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget
                .closest('.group-tabs-add')
                ?.querySelector<HTMLButtonElement>('button')
                ?.click();
            }
          }}
        />
        <Button
          type="button"
          variant="soft"
          color="gray"
          disabled={!address.trim()}
          onClick={() => {
            try {
              const url = resolveAddress(address);
              onChange({
                ...changes,
                added: [
                  ...changes.added,
                  {
                    id: crypto.randomUUID(),
                    name: new URL(url).hostname || 'New tab',
                    url,
                  },
                ],
              });
              setAddress('');
              setError('');
            } catch {
              setError('Enter a valid website address.');
            }
          }}
        >
          <Plus size={15} />
          Add tab
        </Button>
      </div>
      {error && <div role="alert">{error}</div>}
    </section>
  );
}

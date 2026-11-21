import { Button, IconButton, TextField, TextArea } from '@radix-ui/themes';
import { ChevronRight, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { IApp } from '../../types';
import { editGroupTabList } from '../../utils/groupTabList';
import { websiteAddress } from '../../utils/websiteAddress';
import { TabIconPicker, type TabAppearance } from './TabIcon';

export interface GroupTabChanges {
  edits: Record<string, { customName?: string; url?: string } & TabAppearance>;
  added: ({ id: string; name: string; url: string } & TabAppearance)[];
  removed: string[];
  order?: string[];
}
export function GroupTabsSettings({
  tabs,
  changes,
  onChange,
  pendingAddress,
  onPendingAddressChange,
}: {
  tabs: IApp[];
  changes: GroupTabChanges;
  onChange: (next: GroupTabChanges) => void;
  pendingAddress?: string;
  onPendingAddressChange?: (address: string) => void;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(tabs.length === 0);
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState('');
  const [localAddress, setLocalAddress] = useState('');
  const address = pendingAddress ?? localAddress;
  const setAddress = (next: string) => {
    setLocalAddress(next);
    onPendingAddressChange?.(next);
  };
  const [error, setError] = useState('');
  const rows: ({
    id: string;
    name: string;
    url: string;
    icon?: string;
    customName?: string;
  } & TabAppearance)[] = [
    ...tabs.map((tab) => ({
      id: tab.id,
      name: tab.customName || tab.name,
      url: tab.url,
      icon: tab.icon,
      customIconEmoji: tab.customIconEmoji,
      customIconImage: tab.customIconImage,
      focusColor: tab.focusColor,
      ...changes.edits[tab.id],
    })),
    ...changes.added,
  ]
    .filter((tab) => !changes.removed.includes(tab.id))
    .sort((a, b) =>
      changes.order
        ? changes.order.indexOf(a.id) - changes.order.indexOf(b.id)
        : 0
    );
  return (
    <section
      className="group-tabs-settings settings-disclosure"
      aria-label="Tabs"
    >
      <button
        type="button"
        className="settings-disclosure-header"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight size={15} aria-hidden="true" />
        <strong>Tabs</strong>
        <span>
          {rows.length} {rows.length === 1 ? 'tab' : 'tabs'}
        </span>
      </button>
      <div
        id={contentId}
        className="group-tabs-settings-content settings-disclosure-content"
        hidden={!expanded}
      >
        <div className="group-tabs-tools">
          <Button
            type="button"
            size="1"
            variant="ghost"
            color="gray"
            aria-pressed={textMode}
            onClick={() => {
              setText(rows.map((tab) => tab.url).join('\n'));
              setTextMode(!textMode);
            }}
          >
            {textMode ? 'Individual tabs' : 'Text list'}
          </Button>
        </div>
        {textMode ? (
          <div className="group-tabs-text">
            <TextArea
              aria-label="Tab URL list"
              placeholder={'example.com\nhttps://another.com'}
              value={text}
              rows={5}
              onChange={(event) => {
                const { value } = event.target;
                setText(value);
                onChange(
                  editGroupTabList(
                    value,
                    rows,
                    tabs.map((tab) => tab.id),
                    changes
                  )
                );
              }}
            />
            <span className="group-tabs-hint">
              One website per line. No https:// needed.
            </span>
          </div>
        ) : (
          <>
            <div className="group-tabs-list">
              {rows.map((tab) => (
                <div className="group-tab-settings-row" key={tab.id}>
                  <TabIconPicker
                    tab={{ ...tab, icon: tab.icon || '' }}
                    onChange={(patch) =>
                      onChange(
                        changes.added.some((entry) => entry.id === tab.id)
                          ? {
                              ...changes,
                              added: changes.added.map((entry) =>
                                entry.id === tab.id
                                  ? { ...entry, ...patch }
                                  : entry
                              ),
                            }
                          : {
                              ...changes,
                              edits: {
                                ...changes.edits,
                                [tab.id]: {
                                  ...changes.edits[tab.id],
                                  ...patch,
                                },
                              },
                            }
                      )
                    }
                  />
                  <div className="group-tab-settings-fields">
                    <details className="group-tab-name settings-disclosure settings-disclosure-compact">
                      <summary className="settings-disclosure-header">
                        <ChevronRight size={13} aria-hidden="true" />
                        <span>Tab name</span>
                      </summary>
                      <div className="settings-disclosure-content">
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
                                      entry.id === tab.id
                                        ? { ...entry, name }
                                        : entry
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
                      </div>
                    </details>
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
                                  entry.id === tab.id
                                    ? { ...entry, url }
                                    : entry
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
                    >
                      <TextField.Slot side="right">
                        <IconButton
                          type="button"
                          variant="ghost"
                          className="group-tab-remove"
                          color="gray"
                          aria-label={`Remove tab: ${tab.name}`}
                          title="Remove tab"
                          onClick={() =>
                            onChange({
                              ...changes,
                              added: changes.added.filter(
                                (entry) => entry.id !== tab.id
                              ),
                              removed: [...changes.removed, tab.id],
                            })
                          }
                        >
                          <X size={15} />
                        </IconButton>
                      </TextField.Slot>
                    </TextField.Root>
                  </div>
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
                    const url = websiteAddress(address);
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
          </>
        )}
        {error && <div role="alert">{error}</div>}
      </div>
    </section>
  );
}

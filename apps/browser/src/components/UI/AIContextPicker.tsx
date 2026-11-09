import { Button, Popover, TextField } from '@radix-ui/themes';
import { FileUp, PanelTop, Plus, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import type { AIGroup } from '../../browser/aiGroups';
import { aiGroupId } from '../../browser/aiGroups';
import type { AIContextReference } from '../../browser/aiContext';
import type { IApp } from '../../types';
import { PanelPopoverContent } from './PanelDialog';
import { AppIcon } from './AppIcon/AppIcon';
import { GroupIcon } from './GroupIcon';

export function AIContextPicker({
  groups,
  tabs,
  activeTabId,
  disabled,
  filesDisabled,
  onAttach,
  onFiles,
}: {
  groups: AIGroup[];
  tabs: IApp[];
  activeTabId?: string;
  disabled: boolean;
  filesDisabled: boolean;
  onAttach: (reference: AIContextReference) => void;
  onFiles: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [groupLimit, setGroupLimit] = useState(5);
  const [tabLimit, setTabLimit] = useState(5);
  const search = useDeferredValue(query.trim().toLowerCase());
  const indexedGroups = useMemo(
    () =>
      open
        ? groups.map((group) => ({
            ...group,
            search: `${group.name} ${group.slug}`.toLowerCase(),
          }))
        : [],
    [groups, open]
  );
  const indexedTabs = useMemo(
    () =>
      open
        ? groups.flatMap((group) =>
            group.tabs.map((tab) => ({
              ...tab,
              groupName: group.name,
              search: `${tab.name} ${tab.url} ${group.name}`.toLowerCase(),
            }))
          )
        : [],
    [groups, open]
  );
  const identities = useMemo(() => {
    const result = new Map<string, IApp>();
    if (open)
      tabs.forEach((tab) => {
        const key = aiGroupId(tab);
        if (!result.has(key)) result.set(key, tab);
      });
    return result;
  }, [tabs, open]);
  const matchingGroups = useMemo(
    () => indexedGroups.filter((group) => group.search.includes(search)),
    [indexedGroups, search]
  );
  const matchingTabs = useMemo(
    () => indexedTabs.filter((tab) => tab.search.includes(search)),
    [indexedTabs, search]
  );
  const activeTab = indexedTabs.find((tab) => tab.id === activeTabId);
  const attach = (reference: AIContextReference) => {
    setOpen(false);
    onAttach(reference);
  };
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          setGroupLimit(5);
          setTabLimit(5);
        }
      }}
    >
      <Popover.Trigger>
        <Button
          variant="ghost"
          aria-label="Attach context"
          title="Attach tabs, groups, or files"
          className="ai-attach-button"
          disabled={disabled}
        >
          <Plus size={18} />
        </Button>
      </Popover.Trigger>
      <PanelPopoverContent
        className="ai-context-menu"
        side="top"
        align="start"
        sideOffset={6}
        size="1"
        aria-label="Attach AI context"
      >
        <TextField.Root
          size="1"
          aria-label="Search browser context"
          placeholder="Search groups and tabs…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setGroupLimit(5);
            setTabLimit(5);
          }}
        >
          <TextField.Slot>
            <Search size={15} />
          </TextField.Slot>
        </TextField.Root>
        <div className="ai-context-menu-results">
          {!search && activeTab && (
            <Button
              variant="ghost"
              size="1"
              className="ai-context-menu-action"
              onClick={() => attach({ kind: 'tab', id: activeTab.id })}
            >
              <PanelTop size={15} />
              Attach current tab
            </Button>
          )}
          <section aria-label="Groups">
            <h3>Groups</h3>
            {matchingGroups
              .slice(Math.max(0, groupLimit - 20), groupLimit)
              .map((group) => {
                const item = identities.get(group.id);
                return (
                  <Button
                    key={group.id}
                    variant="ghost"
                    className="ai-context-menu-item"
                    onClick={() => attach({ kind: 'group', id: group.id })}
                  >
                    {item ? (
                      <GroupIcon item={item} tabs={tabs} />
                    ) : (
                      <AppIcon
                        icon={group.tabs[0]?.icon || ''}
                        title={group.name}
                      />
                    )}
                    <span className="ai-context-menu-label">
                      <strong>{group.name}</strong>
                      <small>@{group.slug}</small>
                    </span>
                  </Button>
                );
              })}
            {groupLimit > 5 && (
              <Button
                variant="ghost"
                size="1"
                onClick={() =>
                  setGroupLimit((value) => Math.max(5, value - 20))
                }
              >
                Previous groups
              </Button>
            )}
            {matchingGroups.length > groupLimit && (
              <Button
                variant="ghost"
                size="1"
                onClick={() => setGroupLimit((value) => value + 20)}
              >
                View more groups
              </Button>
            )}
          </section>
          <section aria-label="Tabs">
            <h3>Tabs</h3>
            {matchingTabs
              .slice(Math.max(0, tabLimit - 20), tabLimit)
              .map((tab) => (
                <Button
                  key={tab.id}
                  variant="ghost"
                  className="ai-context-menu-item"
                  onClick={() => attach({ kind: 'tab', id: tab.id })}
                >
                  <AppIcon icon={tab.icon} title={tab.name} />
                  <span className="ai-context-menu-label">
                    <strong>{tab.name}</strong>
                    <small>
                      {tab.groupName} · {tab.url}
                    </small>
                  </span>
                </Button>
              ))}
            {tabLimit > 5 && (
              <Button
                variant="ghost"
                size="1"
                onClick={() => setTabLimit((value) => Math.max(5, value - 20))}
              >
                Previous tabs
              </Button>
            )}
            {matchingTabs.length > tabLimit && (
              <Button
                variant="ghost"
                size="1"
                onClick={() => setTabLimit((value) => value + 20)}
              >
                View more tabs
              </Button>
            )}
          </section>
          {!matchingGroups.length && !matchingTabs.length && (
            <p>No matching groups or tabs.</p>
          )}
        </div>
        <div className="ai-context-menu-files">
          <Button
            variant="ghost"
            size="1"
            disabled={filesDisabled}
            onClick={() => {
              setOpen(false);
              onFiles();
            }}
          >
            <FileUp size={16} />
            Upload files from computer
          </Button>
          <small>Up to 8 files · 20 MB each</small>
        </div>
      </PanelPopoverContent>
    </Popover.Root>
  );
}
AIContextPicker.defaultProps = { activeTabId: undefined };

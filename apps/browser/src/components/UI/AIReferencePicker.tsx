/* Functional components use parameter defaults instead of deprecated defaultProps. */
/* eslint-disable react/require-default-props */
import { useState } from 'react';
import { Popover, TextField, Button } from '@radix-ui/themes';
import { Search, Layers } from 'lucide-react';
import { PanelPopoverContent } from './PanelDialog';
import { AIGroup, aiGroupId } from '../../browser/aiGroups';
import { AIContextReference } from '../../browser/aiContext';
import { AppManager } from '../../utils/AppManager';
import { GroupIcon } from './GroupIcon';
import { AppIcon } from './AppIcon/AppIcon';
import { lockedGroup, useGroupAccess } from '../../utils/groupAccess';

/** One bounded, searchable drill-down for references in drafts and messages. */
export function AIReferencePicker({
  group,
  label,
  onAdd,
  disabled = false,
  initialOpen = false,
  onClose,
  onTabContextMenu,
  onGroupContextMenu,
}: {
  group: AIGroup;
  label?: string;
  onAdd: (reference: AIContextReference) => void;
  disabled?: boolean;
  initialOpen?: boolean;
  onClose?: () => void;
  onTabContextMenu?: (id: string) => void;
  onGroupContextMenu?: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(initialOpen);
  const access = useGroupAccess();
  const tabs = AppManager.getAll().filter((tab) => !lockedGroup(tab, access));
  const item = tabs.find((tab) => !tab.archived && aiGroupId(tab) === group.id);
  const accessibleIds = new Set(tabs.map((tab) => tab.id));
  const visibleTabs = group.tabs.filter((tab) => accessibleIds.has(tab.id));
  const matches = visibleTabs.filter((tab) =>
    `${tab.name} ${tab.url}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase())
  );
  const close = () => {
    setOpen(false);
    onClose?.();
  };
  const focus = (id?: string) => {
    if (id)
      window.dispatchEvent(
        new CustomEvent('kudiumbrowser-ai-focus-tab', { detail: id })
      );
    close();
  };
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) onClose?.();
        setQuery('');
      }}
    >
      <Popover.Trigger>
        <button
          type="button"
          className="ai-reference-link"
          title={`${group.name} · ${visibleTabs.length} tabs`}
          onContextMenu={(event) => {
            if (!onGroupContextMenu) return;
            event.preventDefault();
            event.stopPropagation();
            onGroupContextMenu(group.id);
          }}
          onKeyDown={(event) => {
            if (
              onGroupContextMenu &&
              (event.key === 'ContextMenu' ||
                (event.shiftKey && event.key === 'F10'))
            ) {
              event.preventDefault();
              event.stopPropagation();
              onGroupContextMenu(group.id);
            }
          }}
        >
          {item ? <GroupIcon item={item} tabs={tabs} /> : <Layers size={14} />}
          <span>{label || group.name}</span>
        </button>
      </Popover.Trigger>
      <PanelPopoverContent
        className="group-picker ai-reference-picker"
        sideOffset={6}
      >
        <div className="ai-reference-heading">
          <strong>{group.name}</strong>
          <span>{visibleTabs.length} tabs</span>
        </div>
        <div className="ai-reference-actions">
          <Button variant="soft" onClick={() => focus(visibleTabs[0]?.id)}>
            Focus group
          </Button>
          <Button
            variant="soft"
            disabled={disabled || !item}
            onClick={() => {
              onAdd({ kind: 'group', id: group.id });
              setOpen(false);
            }}
          >
            Add group to AI
          </Button>
        </div>
        <TextField.Root
          aria-label={`Search tabs in ${group.name}`}
          placeholder="Search tabs…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        >
          <TextField.Slot>
            <Search size={15} />
          </TextField.Slot>
        </TextField.Root>
        <div className="group-picker-results ai-reference-tabs">
          {matches.slice(0, 50).map((tab) => (
            <div className="ai-reference-tab" key={tab.id}>
              <button
                type="button"
                title={tab.url}
                onContextMenu={(event) => {
                  if (!onTabContextMenu) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onTabContextMenu(tab.id);
                }}
                onKeyDown={(event) => {
                  if (
                    onTabContextMenu &&
                    (event.key === 'ContextMenu' ||
                      (event.shiftKey && event.key === 'F10'))
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    onTabContextMenu(tab.id);
                  }
                }}
                onClick={() => focus(tab.id)}
              >
                <AppIcon icon={tab.icon} title={tab.name} />
                <span>
                  <strong>{tab.name}</strong>
                  <small>{tab.url}</small>
                </span>
              </button>
              <button
                type="button"
                disabled={disabled || !item}
                aria-label={`Use ${tab.name} as AI context`}
                onClick={() => {
                  onAdd({ kind: 'tab', id: tab.id });
                  close();
                }}
              >
                Use tab
              </button>
            </div>
          ))}
          {!matches.length && <p>No matching tabs.</p>}
          {matches.length > 50 && (
            <p>Showing 50 of {matches.length}. Refine your search.</p>
          )}
        </div>
      </PanelPopoverContent>
    </Popover.Root>
  );
}

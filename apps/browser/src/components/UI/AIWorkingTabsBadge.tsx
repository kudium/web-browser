/* Optional activity details use parameter defaults. */
/* eslint-disable react/require-default-props */
import { useState } from 'react';
import { Popover } from '@radix-ui/themes';
import { ChevronRight, LoaderCircle, Sparkles } from 'lucide-react';
import { AppIcon } from './AppIcon/AppIcon';
import { PanelPopoverContent } from './PanelDialog';

export interface AIWorkingTab {
  id: string;
  name: string;
  icon?: string;
}

export function AIWorkingTabsBadge({
  tabs,
  activeTabId,
  onSelect,
}: {
  tabs: AIWorkingTab[];
  activeTabId?: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const working = tabs.some((tab) => tab.id === activeTabId);
  if (!tabs.length) return null;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <button
          type="button"
          className="ai-working-tabs-banner"
          data-working={working || undefined}
          aria-label={`View active AI tabs (${tabs.length})`}
        >
          {working ? (
            <LoaderCircle
              size={13}
              className="loading-spinner"
              aria-hidden="true"
            />
          ) : (
            <Sparkles size={13} aria-hidden="true" />
          )}
          <span>Active AI tabs</span>
          <span className="ai-working-tabs-count" aria-hidden="true">
            {tabs.length > 99 ? '99+' : tabs.length}
          </span>
        </button>
      </Popover.Trigger>
      <PanelPopoverContent
        className="ai-working-tabs-popover"
        side="top"
        align="end"
        sideOffset={8}
        aria-label="Active AI tabs"
      >
        <div className="ai-working-tabs-heading">
          <strong>AI activity</strong>
          <span>
            {tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}
          </span>
        </div>
        <div className="ai-working-tabs-list">
          {tabs.map((tab) => (
            <button
              type="button"
              className="ai-working-tab-row"
              data-active={tab.id === activeTabId || undefined}
              key={tab.id}
              aria-label={`Open ${tab.name}`}
              onClick={() => {
                setOpen(false);
                onSelect(tab.id);
              }}
            >
              <AppIcon icon={tab.icon || ''} title={tab.name} />
              <span className="ai-working-tab-details">
                <span className="ai-working-tab-title">{tab.name}</span>
                <span
                  className="ai-working-tab-status"
                  data-active={tab.id === activeTabId || undefined}
                >
                  {tab.id === activeTabId && (
                    <LoaderCircle
                      size={11}
                      className="loading-spinner"
                      aria-hidden="true"
                    />
                  )}
                  {tab.id === activeTabId ? 'Active now' : 'Used in this run'}
                </span>
              </span>
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      </PanelPopoverContent>
    </Popover.Root>
  );
}

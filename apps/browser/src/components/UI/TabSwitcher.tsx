import { useEffect, useRef } from 'react';
import { Dialog } from '@radix-ui/themes';
import { Globe } from 'lucide-react';
import type { BrowserSnapshot, IApp } from '../../types';

export function TabSwitcher({
  tabs,
  selectedId = undefined,
  snapshots,
  onSelect,
  onCancel,
}: {
  tabs: IApp[];
  selectedId: string | undefined;
  snapshots: BrowserSnapshot[];
  onSelect: (tab: IApp) => void;
  onCancel: () => void;
}) {
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selected.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Content
        className="tab-switcher-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          selected.current?.scrollIntoView?.({
            block: 'nearest',
            inline: 'nearest',
          });
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            const tab = tabs.find((item) => item.id === selectedId);
            if (tab) onSelect(tab);
          }
        }}
      >
        <Dialog.Title className="visually-hidden">Nav history</Dialog.Title>
        <Dialog.Description className="visually-hidden">
          Press Control and Tab to move forward, or Control, Shift and Tab to
          move backward. Release Control to open the selected tab. Escape
          cancels.
        </Dialog.Description>
        <div className="tab-switcher-strip">
          {tabs.map((tab) => {
            const frame = snapshots.find((item) => item.id === tab.id);
            const active = tab.id === selectedId;
            return (
              <button
                key={tab.id}
                type="button"
                ref={active ? selected : undefined}
                className="tab-switcher-card"
                aria-label={tab.name || tab.url}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(tab)}
              >
                <div className="tab-switcher-preview">
                  {frame ? (
                    <img src={frame.image} alt="" />
                  ) : (
                    <Globe size={40} />
                  )}
                  {tab.sessionName && (
                    <span className="tab-switcher-group">
                      {tab.sessionName}
                    </span>
                  )}
                </div>
                <span className="tab-switcher-label">
                  {tab.icon ? (
                    <img src={tab.icon} alt="" />
                  ) : (
                    <Globe size={16} />
                  )}
                  <span>{tab.name || tab.url}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

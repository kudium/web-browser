import { Popover } from '@radix-ui/themes';
import { Puzzle } from 'lucide-react';
import type { BrowserState } from './contracts';
import { ChromeIconButton } from '../components/UI/ChromeIconButton';
import { ExtensionActions } from './ExtensionActions';
import { ExtensionPicker } from './ExtensionPicker';

export function ExtensionToolbar({
  context,
  order,
  showPinned,
  open,
  onOpenChange,
  onClose,
  onManage,
  onStore,
}: {
  context: BrowserState['extensionContext'];
  order: string[] | null;
  showPinned: boolean;
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  onClose: () => void;
  onManage: () => void;
  onStore: () => void;
}) {
  return (
    <div
      className="extension-toolbar"
      role="group"
      aria-label="Address bar extensions"
    >
      {showPinned && <ExtensionActions context={context} order={order} />}
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger>
          <ChromeIconButton
            icon={Puzzle}
            label="Extensions"
            aria-expanded={open}
          />
        </Popover.Trigger>
        <Popover.Content
          className="extension-picker-popover"
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={8}
        >
          <ExtensionPicker
            context={context}
            order={order}
            close={onClose}
            manage={onManage}
            store={onStore}
          />
        </Popover.Content>
      </Popover.Root>
    </div>
  );
}

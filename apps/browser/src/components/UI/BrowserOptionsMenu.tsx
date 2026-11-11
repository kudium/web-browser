import { DropdownMenu } from '@radix-ui/themes';
import {
  MoreHorizontal,
  Plus,
  PanelsTopLeft,
  KeyRound,
  History,
  Download,
  Folder,
  Cloud,
  Search,
  Printer,
  Settings2,
  Globe,
  Puzzle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ChromeIconButton } from './ChromeIconButton';

export type BrowserOption =
  | 'new-tab'
  | 'new-window'
  | 'passwords'
  | 'history'
  | 'downloads'
  | 'spaces'
  | 'sync'
  | 'find'
  | 'print'
  | 'settings'
  | 'site-settings'
  | 'extensions';
const groups: {
  id: BrowserOption;
  label: string;
  icon: LucideIcon;
  page?: boolean;
}[][] = [
  [
    { id: 'new-tab', label: 'New tab or group…', icon: Plus },
    { id: 'new-window', label: 'New window', icon: PanelsTopLeft },
  ],
  [
    { id: 'passwords', label: 'Passwords and autofill', icon: KeyRound },
    { id: 'history', label: 'History', icon: History },
    { id: 'downloads', label: 'Downloads', icon: Download },
    { id: 'spaces', label: 'Spaces and groups', icon: Folder },
    { id: 'sync', label: 'Account and sync', icon: Cloud },
  ],
  [
    { id: 'find', label: 'Find on page…', icon: Search, page: true },
    { id: 'print', label: 'Print…', icon: Printer, page: true },
    { id: 'site-settings', label: 'Site settings…', icon: Globe, page: true },
    { id: 'extensions', label: 'Extensions', icon: Puzzle },
  ],
  [{ id: 'settings', label: 'Settings…', icon: Settings2 }],
];
export function BrowserOptionsMenu({
  onSelect,
  pageAvailable,
}: {
  onSelect: (option: BrowserOption) => void;
  pageAvailable: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <ChromeIconButton icon={MoreHorizontal} label="Browser options" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        sideOffset={8}
        size="2"
        className="browser-options-menu"
        aria-label="Browser options"
      >
        {groups.map((items, index) => (
          <DropdownMenu.Group key={items[0].id}>
            {index > 0 && <DropdownMenu.Separator />}
            {items.map(({ id, label, icon: Icon, page }) => (
              <DropdownMenu.Item
                key={id}
                disabled={page && !pageAvailable}
                onSelect={() => onSelect(id)}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{label}</span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Group>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

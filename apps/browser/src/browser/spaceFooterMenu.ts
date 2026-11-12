import type { NativeMenuItem } from './nativeUi';

export function spaceFooterMenu(
  spaces: { id: string; name: string }[],
  currentPage: string,
  compact: boolean
): NativeMenuItem[] {
  return [
    { id: 'new-tab', label: 'New Tab…' },
    { id: 'new-group', label: 'Create Group…' },
    { id: 'import-group', label: 'Import Group…' },
    { id: 'folder', label: 'New Collection…' },
    { type: 'separator' },
    {
      label: 'Spaces',
      submenu: spaces.map((space) => ({
        id: `space:${space.id}`,
        label:
          space.id === currentPage ? `${space.name} (Current)` : space.name,
      })),
    },
    {
      label: 'System Spaces',
      submenu: [
        { id: 'system:downloads', label: 'Downloads' },
        { id: 'system:history', label: 'History' },
        { id: 'system:archive', label: 'Archive' },
      ],
    },
    { id: 'create', label: 'New Space…' },
    { id: 'manage', label: 'Manage Space…' },
    { id: 'delete', label: 'Delete Space…', enabled: spaces.length > 1 },
    { type: 'separator' },
    {
      id: 'sidebar-mode',
      label: compact ? 'Expand Sidebar' : 'Compact Sidebar',
    },
    { id: 'sidebar-hide', label: 'Hide Sidebar' },
    { id: 'settings', label: 'Settings…' },
  ];
}

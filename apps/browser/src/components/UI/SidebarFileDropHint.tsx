import { FolderOpen } from 'lucide-react';

export function SidebarFileDropHint() {
  return (
    <div className="sidebar-file-drop-hint">
      <FolderOpen size={22} aria-hidden="true" />
      <span>Import a group or start a project</span>
    </div>
  );
}

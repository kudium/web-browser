import { TabIcon } from './TabIcon';
import { Folder, FolderOpen } from 'lucide-react';
import { IApp } from '../../types';
import { groupTabs } from '../../utils/groups';
import { AppIcon } from './AppIcon/AppIcon';

/** Shared identity for sidebar groups, pickers and group settings. */
export function GroupIcon({
  item,
  tabs,
  compact = false,
  expanded = false,
}: {
  item: IApp;
  tabs: IApp[];
  compact?: boolean;
  expanded?: boolean;
}) {
  if (
    item.groupDisplay === 'folder' &&
    !item.favorite &&
    !item.sessionIconEmoji &&
    !item.sessionIconImage
  ) {
    const Icon = expanded ? FolderOpen : Folder;
    return (
      <span className="group-icon-slot" aria-hidden="true">
        <Icon size={18} />
      </span>
    );
  }
  const seen = new Set<string>();
  const icons = groupTabs(tabs, item)
    .filter((tab) => {
      const key =
        tab.customIconEmoji || tab.customIconImage || tab.icon || tab.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  const mixed =
    (!compact || item.favorite) &&
    !item.sessionIconEmoji &&
    !item.sessionIconImage &&
    icons.length > 1;
  return (
    <span
      className={`group-icon-slot${mixed ? ' group-icons' : ''}`}
      aria-hidden="true"
    >
      {mixed ? icons.map((tab) => <TabIcon key={tab.id} tab={tab} />) : null}
      {!mixed && item.sessionIconEmoji && (
        <span className="app-icon session-symbol">{item.sessionIconEmoji}</span>
      )}
      {!mixed &&
        !item.sessionIconEmoji &&
        (item.sessionIconImage ? (
          <AppIcon
            icon={item.sessionIconImage}
            title={item.sessionName || item.name}
          />
        ) : (
          <TabIcon tab={tabs.find((tab) => tab.id === item.id) || item} />
        ))}
    </span>
  );
}
GroupIcon.defaultProps = { compact: false, expanded: false };

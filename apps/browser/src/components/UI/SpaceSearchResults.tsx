import { AppIcon } from './AppIcon/AppIcon';
import type { IApp } from '../../types';

export function SpaceSearchResults({
  tabs,
  selectedId,
  onSelect,
  onContextMenu,
}: {
  tabs: IApp[];
  selectedId?: string;
  onSelect: (tab: IApp) => void;
  onContextMenu: (tab: IApp) => void;
}) {
  return (
    <div className="space-search-results">
      <div className="space-search-status" role="status">
        {tabs.length
          ? `${tabs.length} matching tab${tabs.length === 1 ? '' : 's'}`
          : 'No matching tabs'}
      </div>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="space-search-result"
          aria-label={tab.customName || tab.name}
          aria-current={tab.id === selectedId ? 'page' : undefined}
          title={tab.url}
          onClick={() => onSelect(tab)}
          onContextMenu={(event) => {
            event.preventDefault();
            onContextMenu(tab);
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'ContextMenu' ||
              (event.shiftKey && event.key === 'F10')
            ) {
              event.preventDefault();
              onContextMenu(tab);
            }
          }}
        >
          <AppIcon icon={tab.icon} title={tab.customName || tab.name} />
          <span className="space-search-result-copy">
            <span>{tab.customName || tab.name}</span>
            <small>{tab.sessionName || tab.url}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

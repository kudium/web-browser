import { useRef, useState } from 'react';
import { Button, Checkbox, Text } from '@radix-ui/themes';
import { RotateCcw, ChevronDown } from 'lucide-react';
import { SearchControl } from '../../../UI/FormControls';
import { BulkActions } from './BulkActions';
import { useAppList } from '../../../../utils/hooks/useAppList';
import { AppManager } from '../../../../utils/AppManager';
import { lockedGroup, useGroupAccess } from '../../../../utils/groupAccess';
import { aiGroupId } from '../../../../browser/aiGroups';
import { GroupIcon } from '../../../UI/GroupIcon';
import type { IApp } from '../../../../types';
import { AppIcon } from '../../../UI/AppIcon/AppIcon';

export function Archive({ embedded = false }: { embedded?: boolean }) {
  const { appList } = useAppList();
  useGroupAccess();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const archived = appList.filter((item) => item.archived);
  const visible = archived.filter(
    (item) =>
      !query.trim() ||
      `${item.sessionName || ''} ${item.name} ${item.url}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  const [expanded, setExpanded] = useState<string[]>([]);
  const groups = new Map<string, IApp[]>();
  visible.forEach((tab) => {
    const key = aiGroupId(tab);
    groups.set(key, [...(groups.get(key) || []), tab]);
  });
  const restoreGroup = (tabs: IApp[]) => {
    const ids = new Set(tabs.map((tab) => tab.id));
    AppManager.set(
      AppManager.getAll().map((tab) =>
        ids.has(tab.id) && tab.archived && !lockedGroup(tab)
          ? { ...tab, archived: false, restorationId: crypto.randomUUID() }
          : tab
      )
    );
    setSelected((previous) => previous.filter((id) => !ids.has(id)));
  };
  return (
    <section className={embedded ? 'archive-sidebar-panel' : 'tab-content'}>
      {embedded && (
        <>
          <header className="library-panel-header">
            <span>
              {archived.length} archived tab{archived.length === 1 ? '' : 's'}
            </span>
          </header>
          <SearchControl
            inputRef={search}
            label="Search archived groups"
            value={query}
            onChange={setQuery}
          />
        </>
      )}
      {!embedded && (
        <Text color="gray" size="2">
          Restore a group, or expand it to restore individual tabs.
        </Text>
      )}
      {!embedded && (
        <BulkActions
          ids={archived
            .filter((item) => !lockedGroup(item))
            .map((item) => item.id)}
          selected={selected}
          onSelect={setSelected}
          action="Remove"
          description="The selected archived tabs will be removed from this list. Saved groups and login data remain on this device."
          onRemove={(ids) =>
            AppManager.set(
              AppManager.getAll().filter(
                (item) => !ids.includes(item.id) || lockedGroup(item)
              )
            )
          }
        />
      )}
      <div className={embedded ? 'archive-sidebar-list' : undefined}>
        {[...groups.entries()].map(([key, tabs]) => {
          const group = tabs[0];
          const open = expanded.includes(key);
          const name = group.sessionName || group.name;
          return (
            <section
              className="archive-group"
              key={key}
              aria-label={`Archived group ${name}`}
            >
              <div className="archive-group-header">
                <button
                  className="archive-group-toggle"
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setExpanded((previous) =>
                      open
                        ? previous.filter((id) => id !== key)
                        : [...previous, key]
                    )
                  }
                >
                  <ChevronDown size={14} className={open ? 'expanded' : ''} />
                  <GroupIcon
                    item={group}
                    tabs={tabs.map((tab) => ({ ...tab, archived: false }))}
                  />
                  <span>
                    <strong>{name}</strong>
                    <small>
                      {tabs.length} tab{tabs.length === 1 ? '' : 's'}
                    </small>
                  </span>
                </button>
                <Button
                  size="1"
                  variant="soft"
                  disabled={archived.some(
                    (tab) => aiGroupId(tab) === key && lockedGroup(tab)
                  )}
                  onClick={() =>
                    restoreGroup(
                      archived.filter((tab) => aiGroupId(tab) === key)
                    )
                  }
                  aria-label={`Restore group ${name}`}
                >
                  <RotateCcw size={14} /> {embedded ? null : 'Restore group'}
                </Button>
              </div>
              {open && (
                <div className="archive-group-tabs">
                  {tabs.map((item) => (
                    <div className="app-row" key={item.id}>
                      {!embedded && (
                        <Checkbox
                          aria-label={`Select ${item.name}`}
                          disabled={lockedGroup(item)}
                          checked={selected.includes(item.id)}
                          onCheckedChange={(checked) =>
                            setSelected(
                              checked
                                ? [...selected, item.id]
                                : selected.filter((id) => id !== item.id)
                            )
                          }
                        />
                      )}
                      <AppIcon icon={item.icon} title={item.name} />
                      <div className="app-row-copy">
                        <strong>{item.name}</strong>
                        <Text color="gray" size="2">
                          {lockedGroup(item) ? 'Locked group' : item.url}
                        </Text>
                      </div>
                      <Button
                        variant="soft"
                        aria-label={embedded ? `Restore ${item.name}` : undefined}
                        disabled={lockedGroup(item)}
                        onClick={() => AppManager.restore(item)}
                      >
                        <RotateCcw size={15} />
                        {embedded ? null : 'Restore'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {!visible.length && (
          <p className="empty-message">
            {archived.length
              ? 'No matching archived tabs.'
              : 'Nothing archived yet.'}
          </p>
        )}
      </div>
    </section>
  );
}

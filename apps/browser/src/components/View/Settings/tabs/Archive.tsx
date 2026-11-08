import { useState } from 'react';
import { Button, Checkbox, Text } from '@radix-ui/themes';
import { RotateCcw } from 'lucide-react';
import { BulkActions } from './BulkActions';
import { useAppList } from '../../../../utils/hooks/useAppList';
import { AppManager } from '../../../../utils/AppManager';
import { lockedGroup, useGroupAccess } from '../../../../utils/groupAccess';
import { AppIcon } from '../../../UI/AppIcon/AppIcon';

export function Archive() {
  const { appList } = useAppList();
  useGroupAccess();
  const [selected, setSelected] = useState<string[]>([]);
  const archived = appList.filter((item) => item.archived);
  return (
    <section className="tab-content">
      <Text color="gray" size="2">
        Restore an archived tab with its original group.
      </Text>
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
      {archived.map((item) => (
        <div className="app-row" key={item.id}>
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
          <AppIcon icon={item.icon} title={item.name} />
          <div className="app-row-copy">
            <strong>{item.name}</strong>
            <Text color="gray" size="2">
              {lockedGroup(item) ? 'Locked group' : item.url}
            </Text>
          </div>
          <Button
            variant="soft"
            disabled={lockedGroup(item)}
            onClick={() => AppManager.restore(item)}
          >
            <RotateCcw size={15} />
            Restore
          </Button>
        </div>
      ))}
      {!archived.length && (
        <p className="empty-message">Nothing archived yet.</p>
      )}
    </section>
  );
}

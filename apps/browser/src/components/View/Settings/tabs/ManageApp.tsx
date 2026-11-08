import { useState } from 'react';
import {
  Checkbox,
  AlertDialog,
  Badge,
  Button,
  IconButton,
  Text,
  Tooltip,
} from '@radix-ui/themes';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { BulkActions } from './BulkActions';
import { ADD_APP_WINDOW } from '../../../../utils/constant';
import { useAppList } from '../../../../utils/hooks/useAppList';
import { AppManager } from '../../../../utils/AppManager';
import { lockedGroup, useGroupAccess } from '../../../../utils/groupAccess';
import { AppIcon } from '../../../UI/AppIcon/AppIcon';

export function ManageApp() {
  const { appList } = useAppList();
  useGroupAccess();
  const [selected, setSelected] = useState<string[]>([]);
  const removable = appList
    .filter((item) => !item.archived && !lockedGroup(item))
    .map((item) => item.id);
  const move = (index: number, offset: number) => {
    const next = [...appList];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    AppManager.set(
      next.map((item, position) => ({ ...item, position: position + 1 }))
    );
  };
  return (
    <section className="tab-content">
      <div className="section-heading">
        <div>
          <strong>Your groups</strong>
          <Text as="p" size="2" color="gray">
            Separate groups, without the extra windows.
          </Text>
        </div>
        <Button
          onClick={() =>
            window.electron.ipcRenderer.sendMessage('ipc-create-window', [
              { ...ADD_APP_WINDOW, intent: 'new-session' },
            ])
          }
        >
          <Plus size={16} />
          New group
        </Button>
      </div>
      <BulkActions
        ids={removable}
        selected={selected}
        onSelect={setSelected}
        action="Remove"
        description="The selected entries will close. Saved groups and login data remain on this device."
        onRemove={(ids) =>
          AppManager.set(
            AppManager.getAll().filter(
              (item) => !ids.includes(item.id) || lockedGroup(item)
            )
          )
        }
      />
      <div className="app-list">
        {appList
          .filter((item) => !item.archived)
          .map((item) => {
            const index = appList.findIndex((entry) => entry.id === item.id);
            return (
              <article className="app-row" key={item.id}>
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
                  <Text as="p" size="1" color="gray">
                    {lockedGroup(item) ? 'Locked group' : item.url}
                  </Text>
                  <Badge size="1" variant="soft" color="gray">
                    {appList.filter(
                      (entry) => entry.sessionId === item.sessionId
                    ).length > 1
                      ? 'Shared group'
                      : 'Independent group'}
                  </Badge>
                </div>
                <Tooltip content="Move up">
                  <IconButton
                    variant="ghost"
                    aria-label={`Move ${item.name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip content="Move down">
                  <IconButton
                    variant="ghost"
                    aria-label={`Move ${item.name} down`}
                    disabled={index === appList.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </IconButton>
                </Tooltip>
                <AlertDialog.Root>
                  <AlertDialog.Trigger>
                    <IconButton
                      variant="ghost"
                      disabled={lockedGroup(item)}
                      color="red"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </AlertDialog.Trigger>
                  <AlertDialog.Content maxWidth="400px">
                    <AlertDialog.Title>Remove {item.name}?</AlertDialog.Title>
                    <AlertDialog.Description>
                      This tab will close. Its saved group remains available on
                      this device.
                    </AlertDialog.Description>
                    <div className="dialog-actions">
                      <AlertDialog.Cancel>
                        <Button variant="soft" color="gray">
                          Cancel
                        </Button>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action>
                        <Button
                          color="red"
                          onClick={() =>
                            AppManager.set(
                              appList.filter((entry) => entry.id !== item.id)
                            )
                          }
                        >
                          Remove tab
                        </Button>
                      </AlertDialog.Action>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Root>
              </article>
            );
          })}
        {!appList.some((item) => !item.archived) && (
          <p className="empty-message">
            Your workspace is ready for its first group.
          </p>
        )}
      </div>
    </section>
  );
}

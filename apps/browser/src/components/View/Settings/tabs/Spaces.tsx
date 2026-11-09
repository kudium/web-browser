import {
  Dialog,
  Checkbox,
  AlertDialog,
  Badge,
  Button,
  IconButton,
  Text,
  Popover,
  TextField,
} from '@radix-ui/themes';
import { ArrowDown, ArrowUp, Plus, Trash2, Info } from 'lucide-react';
import { useState } from 'react';
import { SettingsLibrary } from '../../../UI/SettingsLibrary';
import { BulkActions } from './BulkActions';
import { SpaceColorPicker } from '../../../UI/SpaceColorPicker';
import { SpaceIconPicker } from '../../../UI/SpaceIcon';
import {
  SpaceManager,
  useSpaces,
  SpaceColor,
  SpaceIconName,
} from '../../../../utils/SpaceManager';
import { useAppList } from '../../../../utils/hooks/useAppList';

export function Spaces() {
  const { spaces, activeId } = useSpaces();
  const { appList } = useAppList();
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<SpaceIconName>('layers');
  const [emoji, setEmoji] = useState('');
  const [image, setImage] = useState('');
  const [customColor, setCustomColor] = useState('');
  const [color, setColor] = useState<SpaceColor>('iris');
  return (
    <section className="tab-content">
      <div className="section-heading spaces-heading">
        <strong>Your spaces</strong>
        <Popover.Root>
          <Popover.Trigger>
            <IconButton
              variant="ghost"
              color="gray"
              size="1"
              aria-label="About spaces"
            >
              <Info size={15} />
            </IconButton>
          </Popover.Trigger>
          <Popover.Content maxWidth="300px">
            Organize apps into workspaces. Moving an app keeps its group and
            tabs.
          </Popover.Content>
        </Popover.Root>
      </div>
      <Dialog.Root open={creating} onOpenChange={setCreating}>
        <Dialog.Content maxWidth="480px">
          <Dialog.Title>New space</Dialog.Title>
          <Dialog.Description size="2">
            Choose a name, icon, and color.
          </Dialog.Description>
          <form
            className="space-create-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                const created = SpaceManager.add(name, color, icon);
                SpaceManager.update(created.id, {
                  iconEmoji: emoji || undefined,
                  iconImage: image || undefined,
                  customColor: customColor || undefined,
                });
                setName('');
                setCreating(false);
              }
            }}
          >
            <TextField.Root
              required
              aria-label="New space name"
              placeholder="Work, Personal, Side project…"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <SpaceIconPicker
              icon={icon}
              image={image}
              emoji={emoji}
              label="New space icon"
              onChange={(patch) => {
                if (patch.icon) setIcon(patch.icon);
                setEmoji(patch.iconEmoji || '');
                setImage(patch.iconImage || '');
              }}
            />
            <SpaceColorPicker
              color={color}
              customColor={customColor}
              label="New space color"
              onChange={(patch) => {
                if (patch.color) setColor(patch.color);
                setCustomColor(patch.customColor || '');
              }}
            />
            <div className="dialog-actions space-create-dialog-actions">
              <Button
                type="button"
                variant="soft"
                color="gray"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Create
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>
      <details className="settings-library-bulk">
        <summary>Manage multiple items</summary>
        <BulkActions
          ids={spaces.slice(1).map((space) => space.id)}
          selected={selected}
          onSelect={setSelected}
          action="Delete"
          description={`Contents will move to ${spaces[0]?.name}. Groups, tabs and logins are preserved. One space always remains.`}
          onRemove={(ids) => ids.forEach((id) => SpaceManager.remove(id))}
        />
      </details>
      <SettingsLibrary
        label="Spaces"
        entries={spaces}
        renderToolbar={() => (
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label="New space"
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
          </IconButton>
        )}
      >
        {(space, index) => (
          <div className="space-setting" key={space.id}>
            <div className="space-setting-header">
              <Checkbox
                aria-label={`Select ${space.name}`}
                disabled={index === 0}
                checked={selected.includes(space.id)}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked
                      ? [...selected, space.id]
                      : selected.filter((id) => id !== space.id)
                  )
                }
              />
              <SpaceIconPicker
                icon={space.icon || 'layers'}
                image={space.iconImage || ''}
                emoji={space.iconEmoji || ''}
                label={`Icon for ${space.name}`}
                onChange={(patch) => SpaceManager.update(space.id, patch)}
              />
              <TextField.Root
                aria-label={`Rename ${space.name}`}
                defaultValue={space.name}
                key={`${space.id}-${space.name}`}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next) SpaceManager.update(space.id, { name: next });
                  else event.target.value = space.name;
                }}
              />
              <SpaceColorPicker
                color={space.color}
                customColor={space.customColor || ''}
                label={`Color for ${space.name}`}
                onChange={(patch) => SpaceManager.update(space.id, patch)}
              />
            </div>
            <div className="space-setting-footer">
              <Text size="2" color="gray">
                {
                  appList.filter(
                    (item) => (item.spaceId || 'default') === space.id
                  ).length
                }{' '}
                apps
              </Text>
              {activeId === space.id ? (
                <Badge color="gray">Current space</Badge>
              ) : (
                <Button
                  variant="soft"
                  color="gray"
                  onClick={() => SpaceManager.select(space.id)}
                >
                  Switch here
                </Button>
              )}
              <IconButton
                variant="ghost"
                color="gray"
                aria-label={`Move ${space.name} earlier`}
                disabled={!index}
                onClick={() => {
                  const next = [...spaces];
                  [next[index], next[index - 1]] = [
                    next[index - 1],
                    next[index],
                  ];
                  SpaceManager.set(next);
                }}
              >
                <ArrowUp size={15} />
              </IconButton>
              <IconButton
                variant="ghost"
                color="gray"
                aria-label={`Move ${space.name} later`}
                disabled={index === spaces.length - 1}
                onClick={() => {
                  const next = [...spaces];
                  [next[index], next[index + 1]] = [
                    next[index + 1],
                    next[index],
                  ];
                  SpaceManager.set(next);
                }}
              >
                <ArrowDown size={15} />
              </IconButton>
              <AlertDialog.Root>
                <AlertDialog.Trigger>
                  <IconButton
                    variant="ghost"
                    color="red"
                    disabled={spaces.length === 1}
                    aria-label={`Delete ${space.name}`}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </AlertDialog.Trigger>
                <AlertDialog.Content maxWidth="400px">
                  <AlertDialog.Title>Delete {space.name}?</AlertDialog.Title>
                  <AlertDialog.Description>
                    Its apps will move to{' '}
                    {spaces.find((item) => item.id !== space.id)?.name}. Their
                    groups and logins will be preserved.
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
                        onClick={() => SpaceManager.remove(space.id)}
                      >
                        Delete space
                      </Button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Root>
            </div>
          </div>
        )}
      </SettingsLibrary>
    </section>
  );
}

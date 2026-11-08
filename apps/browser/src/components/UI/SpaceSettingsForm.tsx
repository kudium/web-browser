import { Button, TextField } from '@radix-ui/themes';
import { Space, spaceColorNames } from '../../utils/SpaceManager';
import { SpaceIconPicker } from './SpaceIcon';
import { SpaceColorPicker } from './SpaceColorPicker';

type SpaceDraft = Pick<
  Space,
  'name' | 'icon' | 'color' | 'iconImage' | 'iconEmoji' | 'customColor'
>;
export function SpaceSettingsForm({
  value,
  creating,
  onChange,
  onSave,
  onCancel,
}: {
  value: SpaceDraft;
  creating: boolean;
  onChange: (patch: Partial<SpaceDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="space-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.name.trim()) onSave();
      }}
    >
      <span className="space-settings-label">Space name</span>
      <div className="space-settings-identity">
        <SpaceIconPicker
          icon={value.icon || 'layers'}
          image={value.iconImage || ''}
          emoji={value.iconEmoji || ''}
          label="Space icon"
          onChange={onChange}
        />
        <TextField.Root
          aria-label="Space name"
          required
          autoFocus
          placeholder="Work, Personal, Projects…"
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div className="space-settings-color">
        <div>
          <strong>Theme color</strong>
          <small>
            {value.customColor ? 'Custom color' : spaceColorNames[value.color]}
          </small>
        </div>
        <SpaceColorPicker
          color={value.color}
          customColor={value.customColor || ''}
          label="Space color"
          onChange={onChange}
        />
      </div>
      <div className="space-settings-footer">
        <Button type="button" variant="soft" color="gray" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!value.name.trim()}>
          {creating ? 'Create space' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

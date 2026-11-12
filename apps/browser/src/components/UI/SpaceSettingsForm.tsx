import { useId } from 'react';
import { Button, Checkbox, Text, TextField } from '@radix-ui/themes';
import {
  Space,
  spaceColorNames,
  spacePrimaryColor,
  spaceColorValues,
} from '../../utils/SpaceManager';
import { SpaceIconPicker } from './SpaceIcon';
import { SpaceColorPicker } from './SpaceColorPicker';

type SpaceDraft = Pick<
  Space,
  | 'name'
  | 'icon'
  | 'color'
  | 'iconImage'
  | 'iconEmoji'
  | 'customColor'
  | 'frameColor'
>;
export function SpaceSettingsForm({
  value,
  creating,
  onChange,
  onSave,
  onCancel,
  onPreferences,
}: {
  value: SpaceDraft;
  creating: boolean;
  onChange: (patch: Partial<SpaceDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  // eslint-disable-next-line react/require-default-props
  onPreferences?: () => void;
}) {
  const frameLinkId = useId();
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
          <strong>Primary color</strong>
          <small>
            {value.customColor ? 'Custom color' : spaceColorNames[value.color]}
          </small>
        </div>
        <SpaceColorPicker
          color={value.color}
          customColor={value.customColor || ''}
          label="Space primary color"
          onChange={onChange}
        />
      </div>
      <Text
        as="label"
        className="space-settings-frame-link"
        htmlFor={frameLinkId}
      >
        <Checkbox
          id={frameLinkId}
          checked={!value.frameColor}
          onCheckedChange={(checked) =>
            onChange({
              frameColor:
                checked === true ? undefined : spacePrimaryColor(value),
            })
          }
        />
        Use primary color for frame
      </Text>
      {value.frameColor && (
        <div className="space-settings-color space-settings-frame-color">
          <div>
            <strong>Frame tint</strong>
            <small>Only the browser frame</small>
          </div>
          <SpaceColorPicker
            color={value.color}
            customColor={value.frameColor}
            label="Frame tint"
            onChange={(patch) =>
              onChange({
                frameColor:
                  patch.customColor ||
                  spaceColorValues[patch.color || value.color],
              })
            }
          />
        </div>
      )}
      <div className="space-settings-footer">
        {onPreferences && (
          <Button
            type="button"
            variant="ghost"
            color="gray"
            className="space-settings-preferences"
            onClick={onPreferences}
          >
            Workspace settings…
          </Button>
        )}
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

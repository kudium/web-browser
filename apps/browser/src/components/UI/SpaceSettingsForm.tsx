import { FormTextField } from './FormTextField';
import { useId } from 'react';
import { Button, Switch, Text } from '@radix-ui/themes';
import {
  Space,
  spaceColorNames,
  spacePrimaryColor,
  spaceColorValues,
} from '../../utils/SpaceManager';
import { SpaceIconPicker } from './SpaceIcon';
import { PreferenceHint } from './PreferenceHint';
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
  | 'useWebsiteColors'
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
  const websiteColorsId = useId();
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
        <FormTextField
          aria-label="Space name"
          required
          autoFocus
          placeholder="Work, Personal, Projects…"
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div className="space-settings-appearance">
        <div className="space-settings-toggle-row">
          <div className="space-settings-toggle-label">
            <Text as="label" htmlFor={websiteColorsId}>
              Match website color
            </Text>
            <PreferenceHint label="Match website color">
              Uses the active site’s color, or your fallback. In split view,
              follows the focused pane.
            </PreferenceHint>
          </div>
          <Switch
            id={websiteColorsId}
            size="1"
            checked={value.useWebsiteColors === true}
            onCheckedChange={(checked) =>
              onChange({ useWebsiteColors: checked })
            }
          />
        </div>
        <div className="space-settings-color">
          <div>
            <strong>
              {value.useWebsiteColors ? 'Fallback color' : 'Primary color'}
            </strong>
            <small>
              {value.customColor
                ? 'Custom color'
                : spaceColorNames[value.color]}
            </small>
          </div>
          <SpaceColorPicker
            color={value.color}
            customColor={value.customColor || ''}
            label={
              value.useWebsiteColors
                ? 'Space fallback color'
                : 'Space primary color'
            }
            onChange={onChange}
          />
        </div>
        <div className="space-settings-toggle-row">
          <Text as="label" htmlFor={frameLinkId}>
            Use primary color for frame
          </Text>
          <Switch
            id={frameLinkId}
            size="1"
            checked={!value.frameColor}
            onCheckedChange={(checked) =>
              onChange({
                frameColor: checked ? undefined : spacePrimaryColor(value),
              })
            }
          />
        </div>
        {value.frameColor && (
          <div className="space-settings-color space-settings-frame-color">
            <strong>Frame color</strong>
            <SpaceColorPicker
              color={value.color}
              customColor={value.frameColor}
              label="Frame color"
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
      </div>
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

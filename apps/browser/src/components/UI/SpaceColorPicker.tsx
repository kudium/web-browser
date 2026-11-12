import { useId } from 'react';
import { Button, Popover } from '@radix-ui/themes';
import {
  Space,
  SpaceColor,
  spaceColors,
  spaceColorNames,
  spaceColorValues,
} from '../../utils/SpaceManager';

export function SpaceColorPicker({
  color,
  customColor,
  label,
  onChange,
}: {
  color: SpaceColor;
  customColor: string;
  label: string;
  onChange: (patch: Partial<Pick<Space, 'color' | 'customColor'>>) => void;
}) {
  const colorId = useId();
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button
          type="button"
          variant="surface"
          color="gray"
          aria-label={label}
          className="space-color-trigger"
        >
          <span
            style={{ background: customColor || spaceColorValues[color] }}
          />
        </Button>
      </Popover.Trigger>
      <Popover.Content
        width="260px"
        className="space-picker-popover"
        aria-label={label}
      >
        <div className="space-color-picker" role="group" aria-label={label}>
          <span>Recommended colors</span>
          <div className="space-color-options">
            {spaceColors.map((value) => (
              <button
                type="button"
                key={value}
                aria-label={`${spaceColorNames[value]} for ${label}`}
                aria-pressed={!customColor && color === value}
                style={{ background: spaceColorValues[value] }}
                onClick={() =>
                  onChange({ color: value, customColor: undefined })
                }
              />
            ))}
            <label className="space-custom-color" htmlFor={colorId}>
              Custom
              <input
                id={colorId}
                type="color"
                aria-label={`Custom ${label}`}
                value={
                  /^#[0-9a-f]{6}$/i.test(customColor)
                    ? customColor
                    : spaceColorValues[color]
                }
                onChange={(event) =>
                  onChange({ customColor: event.target.value })
                }
              />
            </label>
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

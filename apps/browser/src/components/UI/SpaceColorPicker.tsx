import { useId } from 'react';
import { Button, Popover } from '@radix-ui/themes';
import {
  Space,
  SpaceColor,
  spaceColors,
  spaceColorNames,
} from '../../utils/SpaceManager';

const shades = {
  iris: '#8b7cc8',
  blue: '#6c9bd2',
  green: '#76ad91',
  amber: '#d2a35f',
  pink: '#cd83aa',
};
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
          <span style={{ background: customColor || shades[color] }} />
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
                style={{ background: shades[value] }}
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
                    : shades[color]
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

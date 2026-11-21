import { Button, Dialog, TextField, Text } from '@radix-ui/themes';
import { Check, CircleOff, ImagePlus, Pipette, Smile } from 'lucide-react';
import { ReactNode, useRef, useState } from 'react';
import { PanelDialogContent } from './PanelDialog';
import { iconSymbols, imageSymbol, symbolImage } from './iconSymbols';
import type { SpaceIconName } from '../../utils/SpaceManager';
import { browser } from '../../browser/client';
import { primaryContrast, spaceColorValues } from '../../utils/appTheme';
import { normalizeFocusColor } from '../../utils/focusColor';

/** Shared on-demand emoji/image picker; callers supply their own default icon. */
export function IconPicker({
  label,
  emoji,
  image,
  preview,
  onChange,
  renderDefaultChoice,
  symbol,
  focusColor,
  onFocusColorChange,
  colorMode = 'selection',
}: {
  label: string;
  emoji: string;
  image: string;
  preview: ReactNode;
  onChange: (value: { emoji: string; image: string }) => void;
  renderDefaultChoice?: (select: () => void) => ReactNode;
  symbol?: SpaceIconName;
  focusColor?: string;
  onFocusColorChange?: (color: string | undefined) => void;
  colorMode?: 'selection' | 'background';
}) {
  const colorName = colorMode === 'background' ? 'background' : 'focus';
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState(emoji);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [colorDraft, setColorDraft] = useState(normalizeFocusColor(focusColor));
  const originalColor = useRef(normalizeFocusColor(focusColor));
  const customColor =
    !!colorDraft && !Object.values(spaceColorValues).includes(colorDraft);
  const input = useRef<HTMLInputElement>(null);
  const select = (value: { emoji: string; image: string }) => {
    onChange(value);
    setOpen(false);
  };
  const selectFocusColor = (color: string | undefined) => {
    setColorDraft(color);
    onFocusColorChange?.(color);
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (next) {
          originalColor.current = normalizeFocusColor(focusColor);
          setColorDraft(originalColor.current);
          setEntry(emoji);
          setError('');
        } else if (colorDraft !== originalColor.current) {
          onFocusColorChange?.(originalColor.current);
        }
      }}
    >
      <Dialog.Trigger>
        <Button
          type="button"
          variant="surface"
          color="gray"
          className="icon-picker-trigger"
          aria-label={label}
          title={label}
        >
          {preview}
        </Button>
      </Dialog.Trigger>
      <PanelDialogContent
        className="icon-picker-dialog"
        maxWidth="360px"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <Dialog.Title size="4">
          {onFocusColorChange ? 'Icon & color' : 'Choose an icon'}
        </Dialog.Title>
        <Dialog.Description size="2" color="gray">
          Choose a symbol, emoji, or your own image.
        </Dialog.Description>
        <div className="icon-picker-content">
          <fieldset className="icon-picker-icons" disabled={busy}>
            <legend>Icon</legend>
            {renderDefaultChoice && (
              <div className="icon-picker-default">
                {renderDefaultChoice(() => setOpen(false))}
              </div>
            )}
            <div
              className="icon-picker-symbols"
              role="group"
              aria-label="Suggested icons"
            >
              {Object.entries(iconSymbols).map(([name, Symbol]) => (
                <button
                  type="button"
                  key={name}
                  aria-label={`Use ${name} icon for ${label}`}
                  title={name[0].toUpperCase() + name.slice(1)}
                  aria-pressed={
                    !emoji && (symbol || imageSymbol(image)) === name
                  }
                  disabled={busy}
                  onClick={() =>
                    select({
                      emoji: '',
                      image: symbolImage(name as SpaceIconName),
                    })
                  }
                >
                  <Symbol size={20} strokeWidth={1.6} aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="icon-picker-emoji-entry">
              <TextField.Root
                ref={input}
                aria-label={`Emoji for ${label}`}
                placeholder="Paste an emoji"
                value={entry}
                disabled={busy}
                onChange={(event) => {
                  setEntry(
                    new Intl.Segmenter(undefined, { granularity: 'grapheme' })
                      .segment(event.target.value.trim())
                      [Symbol.iterator]()
                      .next().value?.segment || ''
                  );
                }}
              >
                {window.electron?.platform === 'darwin' && (
                  <TextField.Slot side="right">
                    <button
                      type="button"
                      className="icon-picker-system-emoji"
                      aria-label="Open system emoji picker"
                      title="Open system emoji picker"
                      disabled={busy}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        input.current?.focus();
                        browser
                          .showEmojiPicker()
                          .catch((reason) => setError(String(reason)));
                      }}
                    >
                      <Smile size={16} />
                    </button>
                  </TextField.Slot>
                )}
              </TextField.Root>
              <Button
                type="button"
                variant="soft"
                color="gray"
                disabled={!entry || busy}
                onClick={() => select({ emoji: entry, image: '' })}
              >
                Use emoji
              </Button>
            </div>
            <Button
              type="button"
              variant="surface"
              color="gray"
              disabled={busy}
              aria-label={`Choose image for ${label}`}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const result = await browser.chooseSpaceIcon();
                  if (result) select({ image: result, emoji: '' });
                } catch (reason) {
                  setError(
                    String(reason instanceof Error ? reason.message : reason)
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <ImagePlus size={16} />
              {busy ? 'Choosing image…' : 'Choose image…'}
            </Button>
            {image && !imageSymbol(image) && (
              <Text size="1" color="gray">
                A custom image is currently selected.
              </Text>
            )}
          </fieldset>
          {onFocusColorChange && (
            <fieldset className="icon-picker-color" disabled={busy}>
              <legend
                title={
                  colorMode === 'background'
                    ? 'Always visible on this item.'
                    : 'Visible when this tab is selected.'
                }
              >
                {colorMode === 'background'
                  ? 'Background color'
                  : 'Focus color'}
              </legend>
              <div className="icon-picker-color-options">
                <button
                  type="button"
                  aria-label={`Transparent ${colorName} color for ${label}`}
                  title="Transparent (default)"
                  aria-pressed={!colorDraft}
                  onClick={() => selectFocusColor(undefined)}
                >
                  <span className="icon-picker-color-swatch icon-picker-color-transparent">
                    <CircleOff size={14} aria-hidden="true" />
                  </span>
                </button>
                {Object.entries(spaceColorValues).map(([name, color]) => (
                  <button
                    type="button"
                    key={name}
                    aria-label={`${name === 'iris' ? 'Teal' : name[0].toUpperCase() + name.slice(1)} ${colorName} color for ${label}`}
                    title={
                      name === 'iris'
                        ? 'Teal'
                        : name[0].toUpperCase() + name.slice(1)
                    }
                    aria-pressed={colorDraft === color}
                    onClick={() => selectFocusColor(color)}
                  >
                    <span
                      className="icon-picker-color-swatch"
                      style={{
                        background: color,
                        color: primaryContrast(color),
                      }}
                    >
                      {colorDraft === color && (
                        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                      )}
                    </span>
                  </button>
                ))}
                <label
                  className="icon-picker-custom-color"
                  data-selected={customColor || undefined}
                  title={
                    customColor
                      ? `Custom color ${colorDraft}`
                      : 'Choose a custom color'
                  }
                >
                  <span
                    className="icon-picker-color-swatch"
                    style={
                      customColor
                        ? {
                            background: colorDraft,
                            color: primaryContrast(colorDraft!),
                          }
                        : undefined
                    }
                  >
                    {customColor ? (
                      <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <Pipette size={14} aria-hidden="true" />
                    )}
                  </span>
                  <input
                    type="color"
                    aria-label={`Custom ${colorName} color for ${label}`}
                    value={colorDraft || spaceColorValues.iris}
                    onChange={(event) =>
                      selectFocusColor(normalizeFocusColor(event.target.value))
                    }
                  />
                </label>
              </div>
            </fieldset>
          )}
          {error && (
            <Text size="2" color="red" role="alert">
              {error}
            </Text>
          )}
        </div>
        <div className="icon-picker-footer">
          <Dialog.Close>
            <Button type="button" variant="soft" color="gray" disabled={busy}>
              Cancel
            </Button>
          </Dialog.Close>
          {onFocusColorChange && (
            <Button
              type="button"
              variant="solid"
              color="gray"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          )}
        </div>
      </PanelDialogContent>
    </Dialog.Root>
  );
}

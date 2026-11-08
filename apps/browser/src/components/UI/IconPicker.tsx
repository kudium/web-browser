import { Button, Dialog, TextField, Text } from '@radix-ui/themes';
import { ImagePlus, Smile } from 'lucide-react';
import { ReactNode, useRef, useState } from 'react';
import { PanelDialogContent } from './PanelDialog';
import { browser } from '../../browser/client';

/** Shared on-demand emoji/image picker; callers supply their own default icon. */
export function IconPicker({
  label,
  emoji,
  image,
  preview,
  onChange,
  renderDefaultChoice,
}: {
  label: string;
  emoji: string;
  image: string;
  preview: ReactNode;
  onChange: (value: { emoji: string; image: string }) => void;
  renderDefaultChoice: (select: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState(emoji);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const select = (value: { emoji: string; image: string }) => {
    onChange(value);
    setOpen(false);
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (next) {
          setEntry(emoji);
          setError('');
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
        <Dialog.Title size="4">Choose an icon</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          Use an emoji, your own image, or the default icon.
        </Dialog.Description>
        <div className="icon-picker-content">
          <div
            className="icon-picker-emojis"
            role="group"
            aria-label="Suggested emojis"
          >
            {[
              '🏠',
              '💼',
              '✨',
              '🎨',
              '🚀',
              '📚',
              '🎮',
              '🌿',
              '💻',
              '🌍',
              '☕',
              '❤️',
            ].map((symbol) => (
              <button
                type="button"
                key={symbol}
                aria-label={`Use ${symbol} for ${label}`}
                aria-pressed={emoji === symbol}
                disabled={busy}
                onClick={() => select({ emoji: symbol, image: '' })}
              >
                {symbol}
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
          {image && (
            <Text size="1" color="gray">
              A custom image is currently selected.
            </Text>
          )}
          <fieldset className="icon-picker-default" disabled={busy}>
            {renderDefaultChoice(() => setOpen(false))}
          </fieldset>
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
        </div>
      </PanelDialogContent>
    </Dialog.Root>
  );
}

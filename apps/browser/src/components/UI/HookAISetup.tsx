import { useState } from 'react';
import { Button, Dialog, TextField } from '@radix-ui/themes';
import { Sparkles } from 'lucide-react';

export function HookAISetup({
  disabled,
  onAsk,
}: {
  disabled: boolean;
  onAsk: (outcome: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState('');
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" color="gray" variant="ghost" disabled={disabled}>
          <Sparkles size={14} /> Ask AI
        </Button>
      </Dialog.Trigger>
      <Dialog.Content size="2" maxWidth="400px">
        <Dialog.Title size="3">What should this page do?</Dialog.Title>
        <Dialog.Description size="2">
          Describe the result. AI will prepare a hook for you to review.
        </Dialog.Description>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (outcome.trim()) {
              onAsk(outcome.trim());
              setOpen(false);
            }
          }}
        >
          <TextField.Root
            mt="3"
            aria-label="Hook outcome"
            value={outcome}
            maxLength={2000}
            placeholder="Notify me when this price changes"
            onChange={(event) => setOutcome(event.target.value)}
          />
          <div className="site-hook-enable-actions">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="submit" disabled={disabled || !outcome.trim()}>
              Continue in AI
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

import { useState } from 'react';
import { Button, Dialog } from '@radix-ui/themes';
import { History } from 'lucide-react';
import { HookRevision, SiteDeveloperConfig } from '../../browser/siteDeveloper';

export function HookHistory({
  revisions,
  hookId,
  disabled,
  onRestore,
}: {
  revisions: HookRevision[];
  hookId: string;
  disabled: boolean;
  onRestore: (config: SiteDeveloperConfig) => void;
}) {
  const [selected, setSelected] = useState<HookRevision>();
  const [open, setOpen] = useState(false);
  const available = revisions
    .filter(
      (revision) =>
        !hookId || revision.config.hooks?.some((hook) => hook.id === hookId)
    )
    .slice()
    .reverse();
  const source =
    selected &&
    (hookId
      ? selected.config.hooks?.find((hook) => hook.id === hookId)
      : selected.config);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button
          size="1"
          variant="ghost"
          color="gray"
          disabled={disabled || !available.length}
        >
          <History size={14} /> History
        </Button>
      </Dialog.Trigger>
      <Dialog.Content size="2" maxWidth="600px">
        <Dialog.Title size="3">Restore a hook version</Dialog.Title>
        <Dialog.Description size="2">
          Preview a saved version. Restoring changes only this hook and keeps it
          enabled or disabled as it is now.
        </Dialog.Description>
        <div className="hook-preset-list">
          {available.map((revision, index) => (
            <button
              type="button"
              key={`${revision.time}-${index}`}
              aria-pressed={selected === revision}
              onClick={() => setSelected(revision)}
            >
              <strong>{new Date(revision.time).toLocaleString()}</strong>
              <span>
                {revision.workingHooks?.includes(hookId)
                  ? 'Successfully executed'
                  : 'Saved version'}
              </span>
            </button>
          ))}
        </div>
        {source && (
          <pre className="hook-history-source">
            {['before', 'after', 'css']
              .map(
                (stage) => `${stage}\n${source[stage as 'before'] || '(empty)'}`
              )
              .join('\n\n')}
          </pre>
        )}
        <div className="site-hook-enable-actions">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            disabled={!selected || disabled}
            onClick={() => {
              if (selected) {
                onRestore(selected.config);
                setOpen(false);
              }
            }}
          >
            Restore version
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

import { Dialog, Button } from '@radix-ui/themes';
import { LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StorageRecoveryAction } from './StorageRecoveryAction';

export function StorageRecoveryBanner() {
  const [status, setStatus] = useState<{
    available: boolean;
    needsRecovery: boolean;
  }>();
  useEffect(() => {
    let alive = true;
    window.electron.browser
      .storageStatus()
      .then((value) => {
        if (alive) setStatus(value);
        return undefined;
      })
      .catch(() => {
        // Startup failure must not prevent the rest of the workspace rendering.
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!status || (status.available && !status.needsRecovery)) return null;
  return (
    <div className="storage-recovery-banner" role="status">
      <LockKeyhole size={14} aria-hidden="true" />
      <span className="storage-recovery-copy">
        <strong>
          {status.available
            ? 'Some saved data is locked'
            : 'Saved data is locked'}
        </strong>
        <span>Restore access to continue.</span>
      </span>
      <Dialog.Root>
        <Dialog.Trigger>
          <Button type="button" size="1" variant="surface" color="gray">
            Restore access
          </Button>
        </Dialog.Trigger>
        <Dialog.Content maxWidth="400px">
          <Dialog.Title>Restore access to saved data</Dialog.Title>
          <Dialog.Description size="2">
            Retry access to your saved keys and private data. Allow access to
            your system’s secure storage if prompted. Your saved files are safe.
          </Dialog.Description>
          <p className="storage-recovery-dialog-note">
            If recovery fails, you can back up unreadable data and start fresh.
          </p>
          <div className="storage-recovery-dialog-actions">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <StorageRecoveryAction
              message="Kudium could not unlock secure storage."
              showHint={false}
            />
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}

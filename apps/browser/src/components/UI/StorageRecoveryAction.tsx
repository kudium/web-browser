import { useState } from 'react';
import { Button } from '@radix-ui/themes';
import { isStorageRecoveryError } from '../../browser/storageRecovery';

export function StorageRecoveryAction({
  message,
  showHint = true,
}: {
  message: string;
  showHint?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!isStorageRecoveryError(message)) return null;
  return (
    <span>
      <Button
        type="button"
        size="1"
        variant="soft"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await window.electron.ai.recoverStorage();
          } catch (reason) {
            setError(
              (reason as Error).message.replace(
                /^Error invoking remote method '[^']+': (Error: )?/,
                ''
              )
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Retry access
      </Button>
      {showHint && (
        <span> You’ll be asked before any saved data is reset.</span>
      )}
      {error && <span role="alert"> {error}</span>}
    </span>
  );
}

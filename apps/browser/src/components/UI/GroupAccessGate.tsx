import { ReactElement, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { LockKeyhole } from 'lucide-react';
import type { IApp } from '../../types';
import {
  groupAccessAction,
  lockedGroup,
  useGroupAccess,
} from '../../utils/groupAccess';

/** Shared gate for the browser viewport and every group settings entry point. */
export function GroupAccessGate({
  item,
  children,
}: {
  item: IApp;
  children: ReactElement;
}) {
  const access = useGroupAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (access.ready && !lockedGroup(item)) return children;
  return (
    <div className="group-access-gate" role="region" aria-label="Locked group">
      <LockKeyhole size={28} />
      <h2>{item.sessionName || item.name}</h2>
      <p>
        {access.ready
          ? 'Authenticate to access or manage this group.'
          : 'Checking group access…'}
      </p>
      {access.ready && (
        <Button
          disabled={busy || !!access.error}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await groupAccessAction('unlock', item);
            } catch (cause) {
              setError(String(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Authenticating…' : 'Unlock group'}
        </Button>
      )}
      {(error || access.error) && <p role="alert">{error || access.error}</p>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Button } from '@radix-ui/themes';
import { RefreshCw } from 'lucide-react';
import { browser } from '../../../browser/client';
import type { BrowserProtectionStatus } from '../../../browser/protection';

export function ProtectionStatus({enabled}: {enabled: boolean}) {
  const [status,setStatus] = useState<BrowserProtectionStatus>();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {
    let live = true;
    const refresh = () => browser.preferenceAction('protection-status').then(result => {
      if(live && result && 'phase' in result && 'available' in result)setStatus(result as BrowserProtectionStatus);
      return undefined;
    }).catch(() => {if(live)setError('Protection status could not be read.');});
    refresh();window.addEventListener('focus',refresh);
    return () => {live=false;window.removeEventListener('focus',refresh);};
  },[enabled]);
  let label = !enabled ? 'Ad and tracker blocking is turned off.' : !status ? 'Loading protection rules…' :
    !status.available ? 'Protection rules are unavailable.' : status.phase==='updating' ? 'Updating protection rules…' :
    status.phase==='stale' ? 'Using older protection rules.' : 'Protection rules are ready.';
  if(status?.updatedAt)label+=` Last updated ${new Date(status.updatedAt).toLocaleDateString()}.`;
  return <div className="preference-row">
    <div><strong>Protection lists</strong><p role="status">{label}</p><p>EasyList and EasyPrivacy. Only public lists are downloaded; matching happens on this device.</p>{(error || status?.error) && <p role="status">{error || status?.error}</p>}</div>
    <Button variant="soft" disabled={busy} onClick={async () => {
      setBusy(true);setError('');
      try {const result=await browser.preferenceAction('update-protection');if(result && 'phase' in result && 'available' in result)setStatus(result as BrowserProtectionStatus);}
      catch {setError('Protection rules could not be updated.');}
      finally {setBusy(false);}
    }}><RefreshCw size={15}/>{busy?'Updating…':'Update lists'}</Button>
  </div>;
}

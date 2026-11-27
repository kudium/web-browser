import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@radix-ui/themes';
import { useAssistantPanelVisible } from './AssistantPanelContext';
import { FormTextField } from './FormTextField';
import { EMAIL_BROWSER_PROVIDERS, type EmailBrowserInbox, type EmailBrowserDetection, isEmailAddress } from '../../browser/email';

type Draft = { providerId: string; address: string; url: string };
const EMPTY: Draft = { providerId: '', address: '', url: '' };

export function EmailBrowserInboxForm({ groupId, groupName, inbox, onSave, onOpen, compact = false, onCancel, groupPicker }: {
  groupId?: string;
  groupPicker?: ReactNode;
  groupName?: string;
  inbox?: EmailBrowserInbox;
  onSave: (value: EmailBrowserInbox | undefined) => void;
  onOpen?: () => void;
  compact?: boolean;
  onCancel?: () => void;
}) {
  // Keep each group's draft while the user switches groups or hides the panel.
  const active = useAssistantPanelVisible();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const providerInputId = useId();
  const accountInputId = useId();
  const revision = useRef(0);
  const [retry, setRetry] = useState(0);
  const [detection, setDetection] = useState<{ key: string; mode: 'checking' | 'found' | 'choose' | 'manual'; accounts: EmailBrowserDetection['accounts'] }>({ key: '', mode: 'manual', accounts: [] });
  const draft = (groupId && drafts[groupId]) || inbox || (compact ? { ...EMPTY, providerId: 'google', url: 'https://mail.google.com/' } : EMPTY);
  const edit = (patch: Partial<Draft>) => {
    revision.current += 1;
    if (groupId) setDrafts((current) => ({ ...current, [groupId]: { ...draft, ...patch } }));
  };
  const detectionKey = `${groupId}:${draft.providerId}:${retry}`;
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const version = revision.current;
    if (!groupId || !draft.providerId || draft.providerId === 'custom' || (draft.address && !retry)) {
      setDetection({ key: detectionKey, mode: 'manual', accounts: [] });
      return undefined;
    }
    setDetection({ key: detectionKey, mode: 'checking', accounts: [] });
    const fallback = () => { if (!cancelled && revision.current === version) setDetection({ key: detectionKey, mode: 'manual', accounts: [] }); };
    window.electron.email?.({ action: 'detectBrowserInbox', groupId, providerId: draft.providerId as EmailBrowserInbox['providerId'] }).then((result) => {
      if (cancelled || revision.current !== version) return;
      const accounts = 'accounts' in result && Array.isArray(result.accounts) ? result.accounts.filter((account) => isEmailAddress(account.address)) : [];
      setDetection({ key: detectionKey, mode: accounts.length === 1 ? 'found' : accounts.length ? 'choose' : 'manual', accounts });
      if (accounts.length === 1) setDrafts((current) => ({ ...current, [groupId]: { ...draft, address: accounts[0].address, url: accounts[0].url } }));
    }).catch(fallback);
    if (!window.electron.email) fallback();
    return () => { cancelled = true; };
    // Address edits deliberately do not restart detection or replace the user's draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, groupId, draft.providerId, retry]);
  const mode = detection.key === detectionKey ? detection.mode : 'checking';
  const manual = () => {
    revision.current += 1;
    setDetection({ key: detectionKey, mode: 'manual', accounts: [] });
  };
  return (
    <section className="email-section" aria-label="Browser inbox">
      {!compact && <h3>Browser inbox</h3>}
      {(!compact || !groupId) && <p className="email-section-empty">
        {groupName ? `Use the mail account signed in to ${groupName}. The AI checks this group's inbox tab for verification emails.` : 'Choose an unlocked tab group to use its signed-in mail account.'}
      </p>}
      <form className="email-alias-form" onSubmit={(event) => {
        event.preventDefault();
        if (!groupId || (draft.providerId && (!isEmailAddress(draft.address) || mode === 'checking'))) return;
        onSave(draft.providerId ? draft as EmailBrowserInbox : undefined);
      }}>
        <div className={groupPicker ? "email-browser-targets" : undefined}>
          {groupPicker}
        <div className="app-form-field">
          <label htmlFor={providerInputId}>Email service</label>
          <select id={providerInputId} className="email-select" value={draft.providerId} disabled={!groupId}
            onChange={(event) => {
              const providerId = event.target.value;
              const provider = EMAIL_BROWSER_PROVIDERS.find((item) => item.id === providerId);
              edit({ providerId, url: provider?.url || '', address: '' });
            }}>
            {!compact && <option value="">No browser inbox</option>}
            {EMAIL_BROWSER_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
          </select>
        </div>
        </div>
        {draft.providerId && <>
          {mode === 'checking' && <p className="email-section-empty" role="status">Checking the signed-in inbox…</p>}
          {mode === 'choose' && <div className="app-form-field">
            <label htmlFor={accountInputId}>Account</label>
            <select id={accountInputId} className="email-select" value={detection.accounts.findIndex((account) => account.address === draft.address && account.url === draft.url)}
              onChange={(event) => {
                const account = detection.accounts[Number(event.target.value)];
                if (account) edit({ address: account.address, url: account.url });
              }}>
              <option value={-1}>Choose your signed-in account</option>
              {detection.accounts.map((account, index) => <option value={index} key={`${account.address}:${account.url}`}>{account.address}{detection.accounts.some((other) => other !== account && other.address === account.address) ? ` · ${new URL(account.url).pathname}` : ''}</option>)}
            </select>
          </div>}
          {(mode === 'found' || mode === 'manual') && <FormTextField label="Email address" value={draft.address} placeholder="you@example.com" spellCheck={false}
            readOnly={mode === 'found'} disabled={!groupId} onChange={(event) => edit({ address: event.target.value })} />}
          {(mode === 'found' || mode === 'choose') && <p className="email-section-empty" role="status">{mode === 'found' ? `Found in ${groupName || 'this tab group'}. Confirm this is your inbox.` : 'Choose the inbox you want the AI to use.'}</p>}
          {mode === 'manual' && !inbox && <p className="email-section-empty">{draft.providerId === 'custom' ? 'Enter the address used in this inbox.' : 'Couldn’t detect an account. Enter its address, or sign in and check again.'}</p>}
          <div className="email-detection-actions">
            {mode !== 'manual' && <Button type="button" size="1" variant="ghost" color="gray" aria-label="Enter address manually" onClick={manual}>Enter manually</Button>}
            {mode === 'manual' && draft.providerId !== 'custom' && <Button type="button" size="1" variant="ghost" color="gray" disabled={!groupId} onClick={() => { revision.current += 1; setRetry((value) => value + 1); }}>Check again</Button>}
          </div>
        </>}
        {draft.providerId === 'custom' && <FormTextField label="Inbox URL" value={draft.url} placeholder="https://mail.example.com/" spellCheck={false}
          disabled={!groupId} onChange={(event) => edit({ url: event.target.value })} />}
        <div className="email-provider-actions">
          {onCancel && <Button type="button" size="2" variant="soft" color="gray" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" size={compact ? '2' : '1'} disabled={!groupId || (!!draft.providerId && (!isEmailAddress(draft.address) || mode === 'checking'))}>{compact ? 'Save mailbox' : 'Save inbox'}</Button>
          {onOpen && <Button type="button" size="1" variant="soft" color="gray" disabled={!groupId || !inbox} onClick={onOpen}>Open inbox</Button>}
        </div>
        {!compact && inbox && <p className="email-section-empty" role="status">Saved: {inbox.address}. Open the inbox to check your sign-in.</p>}
      </form>
    </section>
  );
}

import { useState } from 'react';
import { Dialog, SegmentedControl } from '@radix-ui/themes';
import { PanelDialogContent, PanelDialogHeader } from './PanelDialog';
import { AssistantPanelVisibilityContext, useAssistantPanelVisible } from './AssistantPanelContext';
import { GroupPicker, type GroupOption } from './GroupPicker';
import { EmailBrowserInboxForm } from './EmailBrowserInboxForm';
import { EmailProviderForm } from './EmailProviderForm';
import type { EmailBrowserInbox, EmailProviderKind, EmailStatus } from '../../browser/email';

export function EmailAddDialog({ kind, status, groups, initialGroupId, editing, onClose, onConnect, onSaveBrowser, onCancelSignIn }: {
  kind: EmailProviderKind;
  status?: EmailStatus;
  groups: GroupOption[];
  initialGroupId?: string;
  editing?: { groupId: string; inbox: EmailBrowserInbox };
  onClose: () => void;
  onConnect: (providerId: string, values: Record<string, string>) => Promise<void>;
  onSaveBrowser: (groupId: string, inbox: EmailBrowserInbox) => void;
  onCancelSignIn: () => void;
}) {
  const panelVisible = useAssistantPanelVisible();
  const [method, setMethod] = useState('browser');
  const [groupId, setGroupId] = useState(editing?.groupId || initialGroupId || groups[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const group = groups.find((option) => option.id === groupId);
  const browser = kind === 'mailbox' && method === 'browser';
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <PanelDialogContent size="2" maxWidth="400px" className="email-manage-dialog">
      <PanelDialogHeader title={editing ? 'Edit mailbox' : kind === 'alias' ? 'Add alias provider' : 'Add mailbox'} />
      <Dialog.Description className="email-manage-description">
        {kind === 'alias' ? 'Create aliases that forward to your inbox.' : browser ? 'Use an inbox signed in to a tab group.' : 'Read emails here from a connected inbox.'}
      </Dialog.Description>
      {kind === 'mailbox' && !editing && <div className="personal-page-tabs email-connection-method">
        <SegmentedControl.Root value={method} onValueChange={setMethod} disabled={busy} aria-label="Read emails from">
          <SegmentedControl.Item value="browser" aria-label="Browser tab">Browser tab</SegmentedControl.Item>
          <SegmentedControl.Item value="connected" aria-label="Connected inbox">Connected inbox</SegmentedControl.Item>
        </SegmentedControl.Root>
      </div>}
      {kind === 'mailbox' && <div hidden={!browser}>
        <AssistantPanelVisibilityContext.Provider value={browser && panelVisible}>
          <EmailBrowserInboxForm groupId={group?.id} groupName={group?.name} inbox={editing?.groupId === group?.id ? editing?.inbox : undefined} compact onCancel={onClose}
            groupPicker={<div className="app-form-field"><span className="email-mapping-label">Tab group</span><GroupPicker label="Mailbox tab group" options={groups} value={groupId} onChange={setGroupId} disabled={busy} /></div>}
            onSave={(inbox) => {
              if (!inbox || !group) return;
              try { onSaveBrowser(group.id, inbox); onClose(); }
              catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
            }} />
        </AssistantPanelVisibilityContext.Provider>
      </div>}
      <div hidden={browser}><EmailProviderForm kind={kind} status={status} busy={busy} onCancel={onClose} onCancelSignIn={onCancelSignIn}
        onSubmit={async (providerId, values) => {
          setBusy(true); setError('');
          try { await onConnect(providerId, values); onClose(); }
          catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
          finally { setBusy(false); }
        }} /></div>
      {error && <p role="alert" className="email-provider-error">{error}</p>}
    </PanelDialogContent>
  </Dialog.Root>;
}

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, Switch, SegmentedControl } from '@radix-ui/themes';
import { Copy, Check, Mail, Plus, RefreshCw, Trash2, AtSign, ArrowUpRight, Pencil, ChevronRight } from 'lucide-react';
import { AssistantPageHeader } from './AssistantPageHeader';
import { ChromeIconButton } from './ChromeIconButton';
import { EmptyState } from './EmptyState';
import { EmailAddDialog } from './EmailAddDialog';
import { EmailFieldSelect } from './EmailProviderForm';
import { PanelDialogContent, PanelDialogHeader } from './PanelDialog';
import { FormTextField } from './FormTextField';
import { useAssistantPanelVisible, useAssistantPanelDocument } from './AssistantPanelContext';
import { useAppList } from '../../utils/hooks/useAppList';
import { AppManager } from '../../utils/AppManager';
import { lockedGroup, useGroupAccess } from '../../utils/groupAccess';
import { aiGroupId, aiGroups } from '../../browser/aiGroups';
import { browserInboxId, updateGroupBrowserInbox, browserEmailContexts } from '../../browser/emailGroups';
import { commandDestination } from '../../utils/commandNavigation';
import { type EmailAlias, type EmailBrowserInbox, type EmailMessage, type EmailProviderConnection, type EmailProviderKind, type EmailStatus } from '../../browser/email';

function relativeTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function senderName(from: string) {
  const match = from.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  return (match ? match[1].trim() || match[2] : from) || 'Unknown sender';
}

function EmailCopyButton({ value, label, className, iconSize }: { value: string; label: string; className: string; iconSize: number }) {
  const [feedback, setFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setFeedback('idle');
    return () => { generation.current += 1; if (timer.current) clearTimeout(timer.current); };
  }, [value]);
  const copy = async () => {
    const current = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    setFeedback('idle');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (generation.current !== current) return;
      setFeedback('copied');
    } catch {
      if (generation.current !== current) return;
      setFeedback('failed');
    }
    timer.current = setTimeout(() => setFeedback('idle'), 2000);
  };
  const Icon = feedback === 'copied' ? Check : Copy;
  return <button type="button" className={className} aria-label={value}
    title={feedback === 'copied' ? 'Copied' : feedback === 'failed' ? 'Copy failed. Try again.' : label} onClick={copy}>
    <span className="email-copy-value">{value}</span>
    <Icon size={iconSize} aria-hidden="true" />
    <span className="email-copy-feedback" role="status">{feedback === 'copied' ? 'Copied' : feedback === 'failed' ? 'Copy failed' : ''}</span>
  </button>;
}

function AliasRow({
  alias,
  busy,
  onToggle,
  onDelete,
}: {
  alias: EmailAlias;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <li className={`email-alias${alias.enabled ? '' : ' email-alias-disabled'}`}>
      <div className="email-alias-main">
        <EmailCopyButton value={alias.email} label="Copy alias" className="email-alias-address" iconSize={12} />
        <span className="email-alias-meta">
          {alias.name || alias.hostname ? <span className="email-chip">{alias.name || alias.hostname}</span> : null}
          {alias.forwards ? <span>{alias.forwards} forwarded</span> : null}
          <time dateTime={new Date(alias.createdAt).toISOString()}>{relativeTime(alias.createdAt)}</time>
        </span>
      </div>
      <Switch
        size="1"
        checked={alias.enabled}
        disabled={busy}
        aria-label={`${alias.enabled ? 'Disable' : 'Enable'} ${alias.email}`}
        onCheckedChange={onToggle}
      />
      <ChromeIconButton icon={Trash2} label={`Delete ${alias.email}`} className="email-alias-delete" disabled={busy} onClick={onDelete} />
    </li>
  );
}

function MessageRow({ message, expanded, onSelect }: { message: EmailMessage; expanded: boolean; onSelect: () => void }) {
  return (
    <li className={`email-message${expanded ? ' email-message-expanded' : ''}`}>
      <button type="button" className="email-message-summary" aria-expanded={expanded} onClick={onSelect}>
        <span className="email-message-from">{senderName(message.from)}</span>
        <time dateTime={new Date(message.receivedAt).toISOString()}>{relativeTime(message.receivedAt)}</time>
        <span className="email-message-subject">{message.subject || '(no subject)'}</span>
        {message.alias && <span className="email-message-to">to {message.alias}</span>}
      </button>
      {expanded && (
        <div className="email-message-detail">
          {message.codes.length > 0 && (
            <div className="email-message-codes">
              {message.codes.map((code) => (
                <EmailCopyButton key={code} value={code} label="Copy code" className="email-code" iconSize={11} />
              ))}
            </div>
          )}
          {message.links.length > 0 && (
            <ul className="email-message-links">
              {message.links.slice(0, 5).map((link) => (
                <li key={link}>
                  <a href={link}>{link.replace(/^https?:\/\//, '').slice(0, 80)}</a>
                </li>
              ))}
            </ul>
          )}
          <p className="email-message-text">{message.text || 'This message has no text content.'}</p>
        </div>
      )}
    </li>
  );
}

function EmailDisclosure({ address, subtitle, open, onToggle, count, countLabel = 'recent messages', actions, renderContent }: {
  address: string; subtitle: string; open: boolean; onToggle: () => void;
  count?: number; countLabel?: string; actions?: ReactNode; renderContent: () => ReactNode;
}) {
  const panelId = useId();
  const [mounted, setMounted] = useState(open);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  return <section className={`email-mailbox${open ? ' email-mailbox-open' : ''}`}>
    <div className="email-mailbox-heading">
      <button type="button" className="email-mailbox-toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <ChevronRight size={14} className="email-mailbox-chevron" aria-hidden="true" />
        <span className="email-account-copy"><strong>{address}</strong><span>{subtitle}</span></span>
        {count !== undefined && <span className="email-section-count" aria-label={`${count} ${countLabel}`}>{count}</span>}
      </button>
      {actions}
    </div>
    <div id={panelId} hidden={!open} className="email-mailbox-content">
      {(open || mounted) && renderContent()}
    </div>
  </section>;
}

function InboxMessages({ mailbox, messages }: { mailbox: EmailProviderConnection; messages: EmailMessage[] }) {
  const [expanded, setExpanded] = useState<string>();
  return <>
    {mailbox.refreshedAt && <p className="email-inbox-updated">Updated {relativeTime(mailbox.refreshedAt)}</p>}
    {mailbox.error && <p role="alert" className="email-error">{mailbox.error}</p>}
    {messages.length ? <ul className="email-message-list">{messages.map((message) => <MessageRow key={message.id} message={message}
      expanded={expanded === message.id} onSelect={() => setExpanded(expanded === message.id ? undefined : message.id)} />)}</ul>
      : <p className="email-section-empty">{mailbox.refreshing ? 'Loading inbox…' : 'Recent emails will appear here.'}</p>}
  </>;
}

export function EmailPage({ active: requestedActive, onFocusTab }: { active: boolean; currentHostname?: string; onFocusTab?: (id: string) => void }) {
  const panelVisible = useAssistantPanelVisible();
  const panelDocument = useAssistantPanelDocument();
  const [documentVisible, setDocumentVisible] = useState(panelDocument.visibilityState === 'visible');
  useEffect(() => {
    const update = () => setDocumentVisible(panelDocument.visibilityState === 'visible');
    update();
    panelDocument.addEventListener('visibilitychange', update);
    return () => panelDocument.removeEventListener('visibilitychange', update);
  }, [panelDocument]);
  const active = requestedActive && panelVisible && documentVisible;
  const { appList, lastIndex } = useAppList();
  const groupAccess = useGroupAccess();
  const accessibleTabs = useMemo(() => appList.filter((tab) => !lockedGroup(tab, groupAccess)), [appList, groupAccess]);
  const groups = useMemo(() => aiGroups(accessibleTabs), [accessibleTabs]);
  const browserInboxes = useMemo(() => browserEmailContexts(accessibleTabs, null), [accessibleTabs]);
  const [tab, setTab] = useState('aliases');
  const [status, setStatus] = useState<EmailStatus>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshingAccounts, setRefreshingAccounts] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<EmailProviderKind>();
  const [editing, setEditing] = useState<{ groupId: string; inbox: EmailBrowserInbox }>();
  const [aliasDialog, setAliasDialog] = useState(false);
  const [aliasName, setAliasName] = useState('');
  const [aliasError, setAliasError] = useState('');
  const [aliasAccount, setAliasAccount] = useState('');
  const [forwardTo, setForwardTo] = useState('');
  const [openMailbox, setOpenMailbox] = useState<string | null>();
  const [openAliasAccount, setOpenAliasAccount] = useState<string | null>();
  const email = window.electron.email;
  const statusTarget = useRef<string | undefined>(undefined);
  const statusEpoch = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const applyStatus = useCallback((next: EmailStatus) => setStatus((previous) => {
    if (previous?.revision !== undefined && next.revision !== undefined && next.revision < previous.revision) return previous;
    if (!('messagesFor' in next)) return next;
    const accounts = new Set(next.mailboxes?.map((mailbox) => mailbox.id));
    const retained = previous?.messages.filter((message) => accounts.has(message.mailboxId) && (next.messagesFor === null || message.mailboxId !== next.messagesFor)) || [];
    return { ...next, messages: [...retained, ...next.messages] };
  }), []);
  const refresh = useCallback(async () => {
    if (!email || !activeRef.current) return;
    const epoch = statusEpoch.current;
    try {
      const next = await email(statusTarget.current ? { action: 'status', mailboxId: statusTarget.current } : { action: 'status', summariesOnly: true }) as EmailStatus;
      if (epoch === statusEpoch.current && activeRef.current) applyStatus(next);
    } catch (reason) { if (epoch === statusEpoch.current && activeRef.current) setError(reason instanceof Error ? reason.message : 'Email is unavailable.'); }
  }, [email, applyStatus]);
  useEffect(() => {
    if (!active) return undefined;
    statusEpoch.current += 1;
    refresh();
    const unsubscribe = window.electron.onEmailChanged?.(refresh);
    return () => { statusEpoch.current += 1; unsubscribe?.(); };
  }, [active, refresh]);
  const providers = status?.aliasProviders || (status?.alias ? [status.alias] : []);
  const mailboxes = status?.mailboxes || (status?.mailbox ? [status.mailbox] : []);
  const openMailboxId = openMailbox === undefined ? (mailboxes[0] ? `connected:${mailboxes[0].id || mailboxes[0].providerId}` : null) : openMailbox;
  const selected = mailboxes.find((mailbox) => `connected:${mailbox.id || mailbox.providerId}` === openMailboxId);
  const mailboxId = selected?.id;
  statusTarget.current = tab === 'mailboxes' ? mailboxId : undefined;
  const configuredAt = selected?.configuredAt;
  useEffect(() => {
    if (!active || tab !== 'mailboxes' || !configuredAt || !email) return undefined;
    let current = true;
    const pull = () => email({ action: 'refresh', mailboxId, automatic: true }).then((result) => { if (current && result && 'available' in result) applyStatus(result); }).catch(() => undefined);
    pull();
    const timer = setInterval(pull, 60000);
    return () => { current = false; clearInterval(timer); };
  }, [active, tab, configuredAt, mailboxId, email, applyStatus]);
  const run = useCallback(async (work: () => Promise<unknown>, refreshKey?: string) => {
    if (refreshKey) setRefreshingAccounts((current) => new Set(current).add(refreshKey));
    else setBusy(true);
    setError('');
    try {
      const result = await work();
      if (result && typeof result === 'object' && 'available' in result) applyStatus(result as EmailStatus);
      return result;
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); throw reason; }
    finally {
      if (refreshKey) setRefreshingAccounts((current) => { const next = new Set(current); next.delete(refreshKey); return next; });
      else setBusy(false);
    }
  }, [applyStatus]);
  const aliasesByAccount = useMemo(() => {
    const grouped = new Map<string | undefined, { aliases: EmailAlias[]; destinations: Map<string, EmailAlias[]> }>();
    (status?.aliases || []).forEach((alias) => {
      let account = grouped.get(alias.accountId);
      if (!account) {
        account = { aliases: [], destinations: new Map() };
        grouped.set(alias.accountId, account);
      }
      account.aliases.push(alias);
      const recipients = alias.forwardTo?.length ? alias.forwardTo : ['Provider default'];
      recipients.forEach((address) => {
        const key = address.toLowerCase();
        const aliases = account!.destinations.get(key) || [];
        if (!account!.destinations.has(key)) account!.destinations.set(key, aliases);
        aliases.push(alias);
      });
    });
    return grouped;
  }, [status?.aliases]);
  const openBrowserInbox = (groupId: string, id: string) => {
    try {
      const tabs = AppManager.getAll();
      const context = browserEmailContexts(tabs, groupId).find((inbox) => inbox.id === id);
      if (!context) throw new Error('This mailbox is unavailable.');
      const source = tabs.find((item) => item.id === context.sourceTabId);
      if (!source || lockedGroup(source)) throw new Error('Unlock this group before opening its mailbox.');
      if (context.tabs[0]) { onFocusTab?.(context.tabs[0].tabId); setError(''); return; }
      const destination = commandDestination(tabs, source, context.url, false, source.spaceId || 'default');
      const target = destination.existing || destination.app;
      if (destination.app) AppManager.add(destination.app);
      if (target) onFocusTab?.(target.id);
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const selectedProvider = providers.find((provider) => provider.id === aliasAccount) || (aliasAccount ? undefined : providers[0]);
  const messagesByMailbox = useMemo(() => {
    const grouped = new Map<string | undefined, EmailMessage[]>();
    (status?.messages || []).forEach((message) => {
      const messages = grouped.get(message.mailboxId) || [];
      if (!grouped.has(message.mailboxId)) grouped.set(message.mailboxId, messages);
      messages.push(message);
    });
    return grouped;
  }, [status?.messages]);
  const startAlias = (provider: EmailProviderConnection) => {
    setAliasName(''); setAliasAccount(provider.id || ''); setForwardTo(''); setAliasError(''); setAliasDialog(true);
  };
  const openAdd = () => { setEditing(undefined); setAdding(tab === 'aliases' ? 'alias' : 'mailbox'); };
  return <section className="email-page" aria-label="Email workspace">
    <AssistantPageHeader className="email-heading">
      <h2>Email</h2>
      <ChromeIconButton icon={Plus} label={tab === 'aliases' ? 'Add alias provider' : 'Add mailbox'} disabled={busy} onClick={openAdd} />
    </AssistantPageHeader>
    <div className="email-tabs">
      <div className="personal-page-tabs">
        <SegmentedControl.Root value={tab} onValueChange={setTab} aria-label="Email navigation">
          <SegmentedControl.Item value="aliases" aria-label="Aliases">Aliases{status?.aliases.length ? ` · ${status.aliases.length}` : ''}</SegmentedControl.Item>
          <SegmentedControl.Item value="mailboxes" aria-label="Mailboxes">Mailboxes{mailboxes.length + browserInboxes.length ? ` · ${mailboxes.length + browserInboxes.length}` : ''}</SegmentedControl.Item>
        </SegmentedControl.Root>
      </div>
      {error && <p role="alert" className="email-error">{error}</p>}
      <div hidden={tab !== 'aliases'} className="email-tab-body">
        {!providers.length ? <EmptyState icon={<AtSign size={24} />} title="Create an address for each website"
          description="Connect an alias provider. Your forwarding addresses will be grouped by the inbox they go to."
          action={{ label: 'Add alias provider', onClick: openAdd }} /> : <div className="email-account-list" aria-label="Alias providers">
          {providers.map((provider, index) => {
            const id = provider.id || provider.providerId;
            const account = aliasesByAccount.get(provider.id);
            const open = openAliasAccount === undefined ? index === 0 : openAliasAccount === id;
            return <EmailDisclosure key={id} address={provider.summary} subtitle={`${provider.label}${provider.account?.aliasLimit !== undefined ? ` · Limit: ${provider.account.aliasLimit} aliases` : ''}`}
              count={account?.aliases.length || 0} countLabel="aliases" open={open} onToggle={() => setOpenAliasAccount(open ? null : id)}
              actions={<>
                <ChromeIconButton icon={Plus} label={`New alias for ${provider.summary}`} disabled={busy} onClick={() => startAlias(provider)} />
                <ChromeIconButton icon={RefreshCw} label={`Refresh aliases for ${provider.summary}`} disabled={busy || refreshingAccounts.has(`alias:${id}`)}
                  onClick={() => run(() => email!({ action: 'refreshAliases', accountId: provider.id }), `alias:${id}`).catch(() => undefined)} />
                <ChromeIconButton icon={Trash2} label={`Remove ${provider.summary} alias provider`} disabled={busy}
                  onClick={() => run(() => email!({ action: 'disconnect', kind: 'alias', accountId: provider.id })).catch(() => undefined)} />
              </>}
              renderContent={() => !account?.aliases.length ? <EmptyState icon={<AtSign size={24} />} title="No aliases yet" description="Use New alias above to create an address with this account." /> : <div className="email-alias-destinations">{[...account.destinations.entries()].map(([address, aliases]) => <section className="email-alias-destination" key={address}>
                  <h3>{address === 'provider default' ? 'Forwarding details unavailable' : `Forwards to ${address}`}</h3>
                  <ul className="email-alias-list">{aliases.map((alias) => <AliasRow key={`${alias.accountId}:${alias.id}`} alias={alias} busy={busy}
                    onToggle={(enabled) => run(() => email!({ action: 'setAliasEnabled', id: alias.id, accountId: alias.accountId, enabled })).catch(() => undefined)}
                    onDelete={() => run(() => email!({ action: 'deleteAlias', id: alias.id, accountId: alias.accountId })).catch(() => undefined)} />)}</ul>
                </section>)}</div>} />;
          })}
        </div>}

      </div>
      <div hidden={tab !== 'mailboxes'} className="email-tab-body">
        {!mailboxes.length && !browserInboxes.length ? <EmptyState icon={<Mail size={24} />} title="Choose where the AI reads email"
          description="Use a signed-in browser tab, or connect an inbox to read emails here. You can add more than one."
          action={{ label: 'Add mailbox', onClick: openAdd }} /> : <div className="email-account-list" aria-label="Mailboxes">
          {browserInboxes.map((inbox) => {
            const id = `browser:${inbox.groupId}:${inbox.id}`;
            return <EmailDisclosure key={id} address={inbox.address} subtitle={`${inbox.provider} · ${inbox.groupName}`}
              open={openMailboxId === id} onToggle={() => setOpenMailbox(openMailboxId === id ? null : id)}
              actions={<>
                <ChromeIconButton icon={ArrowUpRight} label={`Open ${inbox.address}`} disabled={!onFocusTab} onClick={() => openBrowserInbox(inbox.groupId, inbox.id!)} />
                <ChromeIconButton icon={Pencil} label={`Edit ${inbox.address}`} onClick={() => { setEditing({ groupId: inbox.groupId, inbox }); setAdding('mailbox'); }} />
                <ChromeIconButton icon={Trash2} label={`Remove ${inbox.address}`} onClick={() => {
                  try { AppManager.set(updateGroupBrowserInbox(AppManager.getAll(), inbox.groupId, undefined, inbox.id)); setError(''); }
                  catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
                }} />
              </>}
              renderContent={() => <p className="email-section-empty">Read this inbox in the signed-in {inbox.groupName} tab group. Use Open to go to the mailbox.</p>} />;
          })}
          {mailboxes.map((mailbox) => {
            const id = `connected:${mailbox.id || mailbox.providerId}`;
            const messages = messagesByMailbox.get(mailbox.id) || [];
            return <EmailDisclosure key={id} address={mailbox.summary} subtitle={`${mailbox.label} · Connected inbox`}
              count={mailbox.messageCount ?? messages.length} open={openMailboxId === id} onToggle={() => setOpenMailbox(openMailboxId === id ? null : id)}
              actions={<>
                <ChromeIconButton icon={RefreshCw} label={`Refresh ${mailbox.summary}`} disabled={busy || !!mailbox.refreshing || refreshingAccounts.has(id)}
                  onClick={() => run(() => email!({ action: 'refresh', mailboxId: mailbox.id }), id).catch(() => undefined)} />
                <ChromeIconButton icon={Trash2} label={`Remove ${mailbox.summary}`} disabled={busy}
                  onClick={() => run(() => email!({ action: 'disconnect', kind: 'mailbox', accountId: mailbox.id })).catch(() => undefined)} />
              </>}
              renderContent={() => <InboxMessages mailbox={mailbox} messages={messages} />} />;
          })}
        </div>}
      </div>
    </div>
    {adding && <EmailAddDialog kind={adding} status={status} groups={groups.map((group) => ({ id: group.id, name: group.name, group: accessibleTabs.find((item) => aiGroupId(item) === group.id) }))}
      initialGroupId={appList[lastIndex] && aiGroupId(appList[lastIndex])} editing={editing} onClose={() => { setAdding(undefined); setEditing(undefined); }}
      onConnect={(providerId, values) => run(() => email!({ action: 'connect', providerId, values })).then(() => undefined)}
      onSaveBrowser={(groupId, inbox) => {
        const id = editing && browserInboxId(editing.inbox);
        let updated = updateGroupBrowserInbox(AppManager.getAll(), groupId, inbox, id);
        if (editing && editing.groupId !== groupId) updated = updateGroupBrowserInbox(updated, editing.groupId, undefined, id);
        AppManager.set(updated); setError('');
      }}
      onCancelSignIn={() => { email?.({ action: 'cancelConnect' }).catch(() => undefined); }} />}
    <Dialog.Root open={aliasDialog} onOpenChange={(shown) => !busy && setAliasDialog(shown)}>
      <PanelDialogContent size="2" maxWidth="400px"><PanelDialogHeader title="New alias" />
        <Dialog.Description className="email-manage-description">Create an email address you can use on any website. Emails sent to it go to your forwarding inbox.</Dialog.Description>
        <form className="email-alias-form" onSubmit={(event) => {
          event.preventDefault();
          if (!selectedProvider) return;
          setAliasError('');
          run(() => email!({ action: 'createAlias', ...(aliasName.trim() ? { note: aliasName.trim() } : {}), accountId: selectedProvider?.id, ...(forwardTo ? { forwardTo } : {}) }))
            .then(() => { setAliasDialog(false); refresh(); }).catch((reason) => setAliasError(reason instanceof Error ? reason.message : String(reason)));
        }}>
          <FormTextField label="Alias provider" value={selectedProvider ? `${selectedProvider.label} · ${selectedProvider.summary}` : 'Account unavailable'} readOnly />
          {!!selectedProvider?.destinations?.length && <EmailFieldSelect label="Forward to" value={forwardTo} disabled={busy} onChange={setForwardTo}
            options={[{ value: '', label: 'Provider default' }, ...selectedProvider.destinations.map((destination) => ({ value: destination.email, label: destination.email }))]} />}
          <FormTextField label="Alias name (optional)" value={aliasName} placeholder="e.g. Shopping or newsletters" maxLength={180} disabled={busy} onChange={(event) => setAliasName(event.target.value)} />
          <p className="email-section-empty">The name helps you recognize this alias. {selectedProvider?.label || 'Your provider'} generates the email address.</p>
          {aliasError && <p role="alert" className="email-provider-error">{aliasError}</p>}
          <div className="email-dialog-footer"><Button type="button" size="2" variant="soft" color="gray" disabled={busy} onClick={() => setAliasDialog(false)}>Cancel</Button>
            <Button type="submit" size="2" disabled={busy || !selectedProvider}>Create alias</Button></div>
        </form>
      </PanelDialogContent>
    </Dialog.Root>
  </section>;
}

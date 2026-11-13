import { personalDataMatching } from '../../../browser/personalDataMatching';
/* Radix TextField and Switch render native labeled controls. */
/* eslint-disable jsx-a11y/label-has-associated-control, react/require-default-props */
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Button,
  IconButton,
  TextField,
  TextArea,
  Switch,
  Dialog,
  SegmentedControl,
  Popover,
} from '@radix-ui/themes';
import {
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Plus,
  Search,
  Settings2,
  Pencil,
  EyeOff,
  RotateCcw,
  UserRound,
  FileText,
  CreditCard,
  Globe,
  Download,
  Trash2,
  X,
} from 'lucide-react';
import { StorageRecoveryAction } from '../../UI/StorageRecoveryAction';
import { isStorageRecoveryError } from '../../../browser/storageRecovery';
import { PanelPopoverContent, PanelDialogHeader } from '../../UI/PanelDialog';
import { NotesPage } from '../../UI/NotesPage';
import { GroupIcon } from '../../UI/GroupIcon';
import type { IApp } from '../../../types';
import { personalDataScope } from '../../../utils/groups';
import {
  recordSource,
  entryForEditor,
  entryForSave,
  isProtectedField,
  generatePassword,
} from '../../../browser/passwordManager';
import type {
  VaultItem,
  VaultStatus,
  VaultRequest,
} from '../../../browser/passwordManager';

const empty = (): VaultItem => ({
  id: '',
  title: '',
  origin: '',
  kind: 'profile',
  username: '',
  password: '',
  fields: [{ name: '', value: '', secret: false }],
  allowAI: false,
});
function PersonalDataRecords({
  group,
  tabs = [],
}: {
  group?: IApp;
  tabs?: IApp[];
}) {
  const scope = group ? personalDataScope(group) : undefined;
  const requestData = useCallback(
    (request: VaultRequest) =>
      window.electron.passwordManager(scope ? { ...request, scope } : request),
    [scope]
  );
  const [status, setStatus] = useState<VaultStatus>();
  const [master, setMaster] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [authPrompt, setAuthPrompt] = useState(false);
  const [item, setItem] = useState<VaultItem>(empty);
  const [editing, setEditing] = useState(false);
  const [visibleFields, setVisibleFields] = useState<number[]>([]);
  const editorOpener = useRef<HTMLElement | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const editorRevision = useRef(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const closeEditor = () => {
    setEditing(false);
    setItem(empty());
    setError('');
  };
  const refresh = useCallback(async () => {
    const result = (await requestData({
      action: 'status',
    })) as VaultStatus;
    setStatus(result);
    if (result.locked) {
      setVisibleFields([]);
    }
  }, [requestData]);
  useEffect(() => {
    refresh().catch(() => setError('Personal Data is unavailable.'));
    const timer = setInterval(() => {
      refresh().catch(() => undefined);
    }, 10000);
    const stopLockListener = window.electron.onPasswordManagerLock?.(() => {
      editorRevision.current += 1;
      setVisibleFields([]);
      setItem(empty());
      setEditing(false);
      setMaster('');
      setConfirmation('');
      setStatus((current) =>
        current ? { ...current, locked: true } : current
      );
    });
    return () => {
      editorRevision.current += 1;
      clearInterval(timer);
      stopLockListener?.();
    };
  }, [refresh, requestData, scope]);
  const openNew = (opener: HTMLElement) => {
    editorOpener.current = opener;
    setItem(empty());
    setError('');
    setVisibleFields([]);
    setEditing(true);
  };
  const run = async (request: VaultRequest) => {
    setBusy(true);
    setError('');
    try {
      await requestData(request);
      if (request.action === 'save') {
        setItem(empty());
        setEditing(false);
      }
      if (
        ['unlock', 'authenticate', 'create', 'createOS', 'migrateOS'].includes(
          request.action
        )
      )
        setAuthPrompt(false);
      await refresh();
    } catch (failure) {
      if (failure instanceof Error && isStorageRecoveryError(failure.message))
        setError(
          failure.message.replace(
            /^Error invoking remote method '[^']+': (Error: )?/,
            ''
          )
        );
      else if (request.action === 'import' && failure instanceof Error)
        setError(`Couldn’t import document: ${failure.message.slice(0, 500)}`);
      else if (request.action === 'unlock')
        setError('Couldn’t unlock. Check your master password and try again.');
      else
        setError('Couldn’t save this change. Check the fields and try again.');
    } finally {
      setMaster('');
      setConfirmation('');
      setBusy(false);
    }
  };
  if (!status)
    return error ? (
      <div className="vault-error" role="alert">
        <p>{error}</p>
        <Button
          size="1"
          variant="soft"
          color="gray"
          onClick={() => {
            setError('');
            refresh().catch(() => setError('Personal Data is unavailable.'));
          }}
        >
          Try again
        </Button>
      </div>
    ) : (
      <p role="status">Loading Personal Data…</p>
    );
  const requireAuthentication = () => {
    if (status.locked && status.authentication !== 'os') {
      setAuthPrompt(true);
      return false;
    }
    return true;
  };
  const toggle = (key: 'enabled' | 'autofill' | 'ai', value: boolean) =>
    requireAuthentication() &&
    run({
      action: 'settings',
      enabled: status.enabled,
      autofill: status.autofill,
      ai: status.ai,
      [key]: value,
    });
  const savedItems = status.items.filter((saved) => saved.kind !== 'note');
  const matchingItems = savedItems.filter((saved) =>
    `${saved.title} ${saved.origin} ${saved.username} ${saved.preview || ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  const websiteLabel = (origin: string) => {
    try {
      return new URL(origin).host;
    } catch {
      return origin || 'All websites';
    }
  };
  const openSaved = async (
    saved: VaultStatus['items'][number],
    opener: HTMLElement
  ) => {
    editorOpener.current = opener;
    if (!requireAuthentication()) return;
    setBusy(true);
    setError('');
    const revision = editorRevision.current;
    try {
      const editable = await requestData({ action: 'edit', id: saved.id });
      await refresh();
      if (revision !== editorRevision.current) return;
      setItem(entryForEditor(editable as VaultItem));
      setVisibleFields([]);
      setEditing(true);
    } catch {
      setError('Authentication was cancelled.');
    } finally {
      setBusy(false);
    }
  };
  const unlockLabel = status.initialized ? 'Unlock' : 'Create Personal Data';
  const busyUnlockLabel = status.initialized ? 'Unlocking…' : 'Creating…';
  if (
    (!status.initialized && !status.canUseOS) ||
    (authPrompt && status.authentication !== 'os')
  )
    return (
      <div className="password-manager password-manager-locked">
        <div className="vault-setup">
          <div className="vault-emblem">
            <LockKeyhole size={24} strokeWidth={1.6} />
          </div>
          <h2>
            {status.initialized
              ? 'Unlock Personal Data'
              : 'Your information, in one place'}
          </h2>
          <p className="vault-intro">
            {status.initialized
              ? 'Enter your master password to access saved information.'
              : 'Save logins and fill forms securely in Kudium Browser.'}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!status.initialized && master !== confirmation) {
                setError('Your passwords don’t match.');
                return;
              }
              run({
                action: status.initialized ? 'unlock' : 'create',
                password: master,
              });
            }}
          >
            <div className="vault-field">
              <label htmlFor="vault-master">Master password</label>
              <TextField.Root
                id="vault-master"
                size="2"
                type="password"
                autoComplete={
                  status.initialized ? 'current-password' : 'new-password'
                }
                placeholder={
                  status.initialized
                    ? 'Enter your password'
                    : 'Create a strong password'
                }
                value={master}
                onChange={(event) => {
                  setMaster(event.target.value);
                  setError('');
                }}
                aria-describedby={
                  !status.initialized ? 'vault-password-hint' : undefined
                }
              />
              {!status.initialized && (
                <span id="vault-password-hint" className="vault-hint">
                  Use at least 12 characters.
                </span>
              )}
            </div>
            {!status.initialized && (
              <div className="vault-field">
                <label htmlFor="vault-confirm">Confirm password</label>
                <TextField.Root
                  id="vault-confirm"
                  size="2"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter it again"
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setError('');
                  }}
                />
              </div>
            )}
            {error && (
              <p className="vault-error" role="alert">
                {error}
                <StorageRecoveryAction message={error} />
              </p>
            )}
            <Button
              size="2"
              disabled={
                busy ||
                (status.initialized
                  ? !master
                  : master.length < 12 || !confirmation)
              }
              type="submit"
            >
              {busy ? busyUnlockLabel : unlockLabel}
            </Button>
            {status.initialized && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setMaster('');
                  setAuthPrompt(false);
                  setError('');
                }}
              >
                Back to saved items
              </Button>
            )}
          </form>
          <div className="vault-security-note">
            <ShieldCheck size={16} />
            <span>
              {status.initialized
                ? 'Locks when you lock your computer.'
                : 'Only you can unlock it. Keep your master password safe—it can’t be recovered.'}
            </span>
          </div>
        </div>
        <div className="vault-local-note">
          <LockKeyhole size={13} />
          Encrypted and stored on this device
        </div>
      </div>
    );
  return (
    <div className={`password-manager${group ? ' group-data-library' : ''}`}>
      {error && !editing && (
        <p className="vault-error" role="alert">
          {error}
          <StorageRecoveryAction message={error} />
        </p>
      )}
      <div className="vault-library-header">
        <div>
          <h2>
            {group && <GroupIcon item={group} tabs={tabs} compact />}{' '}
            {group ? `${group.sessionName || group.name}` : 'Personal Data'}
          </h2>
          <span>
            {savedItems.length} {savedItems.length === 1 ? 'item' : 'items'} ·{' '}
            {status.locked ? 'Locked' : 'Unlocked'}
          </span>
        </div>
        <div className="vault-header-actions">
          <Popover.Root>
            <Popover.Trigger>
              <IconButton
                variant="ghost"
                color="gray"
                size="1"
                aria-label="Autofill and access settings"
                title="Autofill and access"
              >
                <Settings2 size={16} />
              </IconButton>
            </Popover.Trigger>
            <PanelPopoverContent
              className="vault-access-popover"
              align="end"
              size="2"
            >
              <h3>Autofill & access</h3>
              <div className="password-manager-controls">
                <label>
                  <span>Personal Data</span>
                  <Switch
                    checked={status.enabled}
                    onCheckedChange={(value) => toggle('enabled', value)}
                    disabled={busy}
                  />
                </label>
                <label>
                  <span>Manual autofill</span>
                  <Switch
                    checked={status.autofill}
                    onCheckedChange={(value) => toggle('autofill', value)}
                    disabled={busy || !status.enabled}
                  />
                </label>
                <label>
                  <span>AI access</span>
                  <Switch
                    checked={status.ai}
                    onCheckedChange={(value) => toggle('ai', value)}
                    disabled={busy || !status.enabled}
                  />
                </label>
              </div>
            </PanelPopoverContent>
          </Popover.Root>
          <IconButton
            variant="soft"
            color="gray"
            size="1"
            disabled={busy}
            aria-label={
              status.locked ? 'Unlock Personal Data' : 'Lock Personal Data'
            }
            title={
              status.locked ? 'Unlock Personal Data' : 'Lock Personal Data'
            }
            onClick={() => {
              if (!status.locked) {
                run({ action: 'lock' });
                return;
              }
              if (status.authentication === 'os')
                run({ action: 'authenticate' });
              else setAuthPrompt(true);
            }}
          >
            <LockKeyhole size={14} />
          </IconButton>
        </div>
      </div>
      {status.locked && status.authentication !== 'os' && (
        <p className="vault-hint">
          Browse saved items freely. Authenticate to view private values.
        </p>
      )}
      {group && (
        <p className="vault-hint">
          Browser-wide items are available here. Add group-specific details or
          customize a shared item.
        </p>
      )}
      {status.locked && status.canUseOS && status.authentication !== 'os' && (
        <details className="vault-options">
          <summary>Switch to Mac authentication</summary>
          <p className="vault-hint">
            Enter your existing master password once to connect this vault to
            your Mac.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run({ action: 'migrateOS', password: master });
            }}
          >
            <TextField.Root
              type="password"
              aria-label="Existing master password"
              autoComplete="current-password"
              value={master}
              onChange={(event) => setMaster(event.target.value)}
            />
            <Button disabled={busy || !master}>Use Mac authentication</Button>
          </form>
        </details>
      )}
      <div className="vault-toolbar">
        <TextField.Root
          aria-label="Search saved items"
          placeholder="Search saved items"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        >
          <TextField.Slot>
            <Search size={15} />
          </TextField.Slot>
        </TextField.Root>
        <Button
          disabled={busy}
          onClick={(event) => openNew(event.currentTarget)}
        >
          <Plus size={15} />
          Add item
        </Button>
        <Button
          variant="ghost"
          color="gray"
          disabled={busy}
          onClick={() => run({ action: 'import', allowAI: false })}
        >
          <Download size={15} />
          Import
        </Button>
      </div>
      <div
        className="vault-record-list"
        role="list"
        aria-label="Saved Personal Data"
      >
        {matchingItems.map((saved) => (
          <div key={saved.id} className="vault-record" role="listitem">
            <div className="vault-record-icon" aria-hidden="true">
              {saved.kind === 'login' ? (
                <KeyRound size={18} />
              ) : saved.kind === 'knowledge' ? (
                <FileText size={18} />
              ) : saved.kind === 'payment' ? (
                <CreditCard size={18} />
              ) : (
                <UserRound size={18} />
              )}
            </div>
            <div className="vault-record-body">
              <button
                className="vault-record-name"
                disabled={busy}
                onClick={(event) => openSaved(saved, event.currentTarget)}
              >
                {saved.title}
              </button>
              {saved.preview && (
                <p className="vault-record-preview" title={saved.preview}>
                  {saved.preview}
                </p>
              )}
              <div className="vault-record-meta">
                <span>
                  {saved.kind === 'login'
                    ? 'Login'
                    : saved.kind === 'knowledge'
                    ? 'Document'
                    : saved.fieldCount
                    ? `${saved.fieldCount} ${
                        saved.fieldCount === 1 ? 'value' : 'values'
                      }`
                    : 'Saved details'}
                </span>
                <span className="vault-record-site">
                  <Globe size={11} aria-hidden="true" />
                  {websiteLabel(saved.origin)}
                </span>
                {group && <span>{recordSource(saved)}</span>}
              </div>
            </div>
            <div className="vault-record-actions">
              <IconButton
                variant="ghost"
                color="gray"
                size="1"
                disabled={busy}
                aria-label={
                  saved.inherited ? 'Customize for this group' : 'Edit'
                }
                title={saved.inherited ? 'Customize for this group' : 'Edit'}
                onClick={(event) => openSaved(saved, event.currentTarget)}
              >
                <Pencil size={15} />
              </IconButton>
              {saved.overridden && (
                <IconButton
                  variant="ghost"
                  color="gray"
                  size="1"
                  disabled={busy}
                  aria-label="Reset override"
                  title="Reset override"
                  onClick={() => run({ action: 'reset', id: saved.id })}
                >
                  <RotateCcw size={15} />
                </IconButton>
              )}
              <IconButton
                variant="ghost"
                color="gray"
                size="1"
                disabled={busy}
                aria-label={saved.inherited ? 'Hide in this group' : 'Delete'}
                title={saved.inherited ? 'Hide in this group' : 'Delete'}
                onClick={async (event) => {
                  editorOpener.current = event.currentTarget;
                  if (!requireAuthentication()) return;
                  if (
                    await window.electron.browser.confirm({
                      message: saved.inherited
                        ? `Hide “${saved.title}” in this group?`
                        : `Delete “${saved.title}”?`,
                      detail: saved.inherited
                        ? 'The browser-wide original stays available to other groups.'
                        : 'This permanently removes the saved item.',
                      confirm: saved.inherited ? 'Hide' : 'Delete',
                    })
                  )
                    await run({
                      action: saved.inherited ? 'hide' : 'delete',
                      id: saved.id,
                    });
                }}
              >
                {saved.inherited ? <EyeOff size={15} /> : <Trash2 size={15} />}
              </IconButton>
            </div>
          </div>
        ))}
        {!matchingItems.length && (
          <div className="vault-empty">
            <UserRound size={28} />
            <h3>{query.trim() ? 'No matching items' : 'No saved items yet'}</h3>
            <p>
              {query.trim()
                ? 'Try another search.'
                : 'Add an item or save a filled form from a website.'}
            </p>
          </div>
        )}
      </div>

      {!!status.hidden?.length && (
        <details className="vault-options">
          <summary>Hidden inherited records</summary>
          {status.hidden.map((saved) => (
            <div key={saved.id} className="vault-toolbar">
              <span>{saved.title}</span>
              <Button
                size="1"
                variant="ghost"
                onClick={() => run({ action: 'reset', id: saved.id })}
              >
                Restore
              </Button>
            </div>
          ))}
        </details>
      )}
      {status.authentication !== 'os' && !status.locked && (
        <details className="vault-options vault-password-options">
          <summary>Change master password</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run({ action: 'changePassword', password: master });
            }}
          >
            <label htmlFor="vault-new-master">New master password</label>
            <TextField.Root
              id="vault-new-master"
              type="password"
              autoComplete="new-password"
              value={master}
              onChange={(event) => setMaster(event.target.value)}
            />
            <Button disabled={busy || master.length < 12} type="submit">
              Update master password
            </Button>
          </form>
        </details>
      )}
      {status.metadataReady === false && (
        <p className="vault-hint">
          Authenticate once to update your existing vault and make its item list
          available.
        </p>
      )}
      <Dialog.Root
        open={editing}
        onOpenChange={(open) => {
          if (!open && !busy) closeEditor();
        }}
      >
        {editing && (
          <Dialog.Content
            className="vault-editor-dialog"
            maxWidth="520px"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              titleInput.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              editorOpener.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <PanelDialogHeader
              title={item.id ? 'Edit saved item' : 'Add saved item'}
              actions={
                <IconButton
                  type="button"
                  variant="ghost"
                  color="gray"
                  disabled={busy}
                  aria-label="Close saved item"
                  onClick={closeEditor}
                >
                  <X size={17} />
                </IconButton>
              }
            />
            <Dialog.Description size="2" color="gray">
              Keep related values together. Each fills its matching website
              field.
            </Dialog.Description>
            <form
              className="password-manager-editor"
              onSubmit={(event) => {
                event.preventDefault();
                run({ action: 'save', item: entryForSave(item) });
              }}
            >
              {status.locked && status.authentication === 'master' && (
                <div className="vault-options">
                  <label htmlFor="personal-encryption-key">
                    Master password
                  </label>
                  <TextField.Root
                    id="personal-encryption-key"
                    type="password"
                    autoComplete="current-password"
                    value={master}
                    onChange={(event) => setMaster(event.target.value)}
                  />
                  <p className="vault-hint">
                    Unlock the encryption key to save this item. Your draft
                    stays here.
                  </p>
                  <Button
                    type="button"
                    disabled={busy || !master}
                    onClick={() => run({ action: 'unlock', password: master })}
                  >
                    Unlock to save
                  </Button>
                </div>
              )}
              <div className="vault-editor-scroll">
                <fieldset className="vault-editor-fields" disabled={busy}>
                  <label htmlFor="vault-item-name">Item name (optional)</label>
                  <TextField.Root
                    id="vault-item-name"
                    placeholder="e.g. Personal profile"
                    value={item.title}
                    onChange={(event) =>
                      setItem({ ...item, title: event.target.value })
                    }
                  />
                  <div className="personal-entry-values">
                    <div className="personal-entry-labels">
                      <span>Field</span>
                      <span>Value</span>
                    </div>
                    {item.fields.map((field, index) => (
                      <div className="personal-entry-field" key={index}>
                        <TextField.Root
                          ref={index === 0 ? titleInput : undefined}
                          aria-label={`Key ${index + 1}`}
                          placeholder="e.g. Email"
                          required
                          value={field.name}
                          onChange={(event) =>
                            setItem({
                              ...item,
                              fields: item.fields.map((current, position) =>
                                position === index
                                  ? { ...current, name: event.target.value }
                                  : current
                              ),
                            })
                          }
                        />
                        {isProtectedField(field) ? (
                          <TextField.Root
                            aria-label={`Value ${index + 1}`}
                            type={
                              isProtectedField(field) &&
                              !visibleFields.includes(index)
                                ? 'password'
                                : 'text'
                            }
                            placeholder="Enter a value"
                            value={field.value}
                            onChange={(event) =>
                              setItem({
                                ...item,
                                fields: item.fields.map((current, position) =>
                                  position === index
                                    ? { ...current, value: event.target.value }
                                    : current
                                ),
                              })
                            }
                          >
                            {isProtectedField(field) && (
                              <TextField.Slot side="right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="1"
                                  onClick={() =>
                                    setVisibleFields(
                                      visibleFields.includes(index)
                                        ? visibleFields.filter(
                                            (position) => position !== index
                                          )
                                        : [...visibleFields, index]
                                    )
                                  }
                                >
                                  {visibleFields.includes(index)
                                    ? 'Hide'
                                    : 'Show'}
                                </Button>
                              </TextField.Slot>
                            )}
                          </TextField.Root>
                        ) : (
                          <TextArea
                            aria-label={`Value ${index + 1}`}
                            className="personal-entry-value"
                            rows={1}
                            placeholder="Enter a value"
                            value={field.value}
                            onChange={(event) =>
                              setItem({
                                ...item,
                                fields: item.fields.map((current, position) =>
                                  position === index
                                    ? { ...current, value: event.target.value }
                                    : current
                                ),
                              })
                            }
                          />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          color="gray"
                          aria-label={`Remove value ${index + 1}`}
                          onClick={() => {
                            setItem({
                              ...item,
                              fields: item.fields.filter(
                                (_, position) => position !== index
                              ),
                            });
                            setVisibleFields([]);
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                        <div className="personal-entry-matching">
                          <label>
                            <span>Fill as</span>
                            <select
                              aria-label={`Fill as for value ${index + 1}`}
                              value={
                                personalDataMatching.types.find((type) =>
                                  (field.aliases || []).includes(type.value)
                                )?.value || ''
                              }
                              onChange={(event) => {
                                const mapping = event.target.value;
                                setItem({
                                  ...item,
                                  fields: item.fields.map((current, position) =>
                                    position === index
                                      ? {
                                          ...current,
                                          aliases: [
                                            ...(current.aliases || []).filter(
                                              (alias) =>
                                                !personalDataMatching.types.some(
                                                  (type) => type.value === alias
                                                )
                                            ),
                                            ...(mapping ? [mapping] : []),
                                          ],
                                        }
                                      : current
                                  ),
                                });
                              }}
                            >
                              <option value="">
                                {personalDataMatching.types.find(
                                  (type) =>
                                    type.value ===
                                    personalDataMatching.aliases(field.name)[0]
                                )?.label || 'Field name'}{' '}
                                (auto)
                              </option>
                              {personalDataMatching.types.map((type) => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <details className="personal-entry-field-options">
                            <summary>Value options</summary>
                            <div className="personal-entry-options-content">
                              {/password/i.test(field.name) && (
                                <Button
                                  type="button"
                                  size="1"
                                  variant="soft"
                                  onClick={() =>
                                    setItem({
                                      ...item,
                                      fields: item.fields.map(
                                        (current, position) =>
                                          position === index
                                            ? {
                                                ...current,
                                                value: generatePassword(
                                                  window.crypto
                                                ),
                                              }
                                            : current
                                      ),
                                    })
                                  }
                                >
                                  Generate password
                                </Button>
                              )}
                              <label>
                                <Switch
                                  checked={isProtectedField(field)}
                                  disabled={isProtectedField({
                                    ...field,
                                    secret: false,
                                  })}
                                  onCheckedChange={(secret) =>
                                    setItem({
                                      ...item,
                                      fields: item.fields.map(
                                        (current, position) =>
                                          position === index
                                            ? { ...current, secret }
                                            : current
                                      ),
                                    })
                                  }
                                />
                                <span>Private value</span>
                              </label>
                              <TextField.Root
                                aria-label={`Other names for key ${index + 1}`}
                                placeholder="Other names, comma separated"
                                value={(field.aliases || []).join(', ')}
                                onChange={(event) =>
                                  setItem({
                                    ...item,
                                    fields: item.fields.map(
                                      (current, position) =>
                                        position === index
                                          ? {
                                              ...current,
                                              aliases: event.target.value
                                                .split(',')
                                                .map((value) => value.trim())
                                                .filter(Boolean),
                                            }
                                          : current
                                    ),
                                  })
                                }
                              />
                            </div>
                          </details>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="1"
                      disabled={item.fields.length >= 30}
                      onClick={() =>
                        setItem({
                          ...item,
                          fields: [
                            ...item.fields,
                            { name: '', value: '', secret: false },
                          ],
                        })
                      }
                    >
                      <Plus size={14} /> Add another value
                    </Button>
                  </div>
                  <label htmlFor="vault-origin">Website (optional)</label>
                  <TextField.Root
                    id="vault-origin"
                    placeholder="example.com"
                    value={item.origin}
                    onChange={(event) =>
                      setItem({ ...item, origin: event.target.value })
                    }
                  />
                  <p className="vault-hint personal-entry-website-help">
                    Leave blank to use this information across websites.
                  </p>
                  <label className="vault-switch">
                    <Switch
                      checked={item.allowAI === true}
                      onCheckedChange={(allowAI) =>
                        setItem({ ...item, allowAI })
                      }
                    />
                    <span>Allow AI to use this item</span>
                  </label>
                  <p className="vault-hint">
                    Shared fields, notes and documents may be sent to your AI
                    provider. Private values stay local and require approval
                    before use.
                  </p>
                  <details className="personal-entry-notes">
                    <summary>Notes {item.document && '& document'}</summary>
                    <textarea
                      id="personal-notes"
                      aria-label="Notes"
                      className="personal-data-notes"
                      placeholder="Extra context, if needed"
                      value={item.notes || ''}
                      maxLength={100000}
                      onChange={(event) =>
                        setItem({ ...item, notes: event.target.value })
                      }
                    />
                    {item.document && (
                      <pre className="personal-data-document">
                        {item.document.text}
                      </pre>
                    )}
                  </details>
                </fieldset>
              </div>
              {error && (
                <p className="vault-error" role="alert">
                  {error}
                  <StorageRecoveryAction message={error} />
                </p>
              )}
              <div className="vault-editor-actions">
                <Button
                  type="button"
                  variant="surface"
                  color="gray"
                  disabled={busy}
                  onClick={closeEditor}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    item.fields.some(
                      (field) => field.value.trim() && !field.name.trim()
                    ) ||
                    (!item.document &&
                      !item.notes?.trim() &&
                      !item.fields.some((field) => field.value.trim()))
                  }
                >
                  {busy ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        )}
      </Dialog.Root>
    </div>
  );
}

/** Compatibility export; all entry points share the same manager. */
export function PersonalData({ group, tabs }: { group?: IApp; tabs?: IApp[] }) {
  const [page, setPage] = useState('data');
  const [notesMounted, setNotesMounted] = useState(false);
  return (
    <>
      <div className="personal-page-tabs">
        <SegmentedControl.Root
          value={page}
          onValueChange={(value) => {
            if (value === 'notes') setNotesMounted(true);
            setPage(value);
          }}
          aria-label="Personal data navigation"
        >
          <SegmentedControl.Item value="data">
            Personal Data
          </SegmentedControl.Item>
          <SegmentedControl.Item value="notes">Notes</SegmentedControl.Item>
        </SegmentedControl.Root>
      </div>
      <div hidden={page !== 'data'}>
        <PersonalDataRecords group={group} tabs={tabs} />
      </div>
      {notesMounted && (
        <div className="personal-page-body" hidden={page !== 'notes'}>
          <NotesPage
            tabs={tabs}
            initialScope={group ? personalDataScope(group) : undefined}
          />
        </div>
      )}
    </>
  );
}

export const PasswordManager = PersonalData;

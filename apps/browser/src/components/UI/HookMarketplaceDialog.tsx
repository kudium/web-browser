/* Shared portable source contract; both apps build this module directly. */
/* eslint-disable import/no-relative-packages */
/* Controls use native associated labels; optional launch fields have explicit defaults. */
/* eslint-disable jsx-a11y/label-has-associated-control, react/require-default-props */
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DropdownMenu, Switch } from '@radix-ui/themes';
import {
  ArrowLeft,
  MoreHorizontal,
  X,
  Store,
  ArrowUpRight,
  Globe2,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { HookTestWebsiteField } from './HookTestWebsiteField';
import { GroupPicker, type GroupOption } from './GroupPicker';
import { useAppList } from '../../utils/hooks/useAppList';
import { hookLicenses } from '../../../../../packages/hooks/package';
import type {
  HookDestination,
  HookImportPreview,
  HookMarketplaceState,
  HookUpdate,
  GlobalHook,
  HookMarketplaceRequest,
} from '../../browser/hookMarketplace';

type Mode = 'import' | 'global' | 'publish' | 'updates';
const modeTitles: Record<Mode, string> = {
  import: 'Install a hook',
  global: 'Global hooks',
  publish: 'Publish a hook',
  updates: 'Hook updates',
};
const modeDescriptions: Record<Mode, string> = {
  import: 'Add something useful to your websites.',
  global: 'Choose where your hooks run.',
  publish: 'Share a saved hook with the Kudium community.',
  updates: 'Review changes before updating your installed hooks.',
};
export const OPEN_HOOK_MARKETPLACE = 'kudium-hooks-dialog';
export const HOOKS_CHANGED = 'kudium-hooks-changed';
export function HookMarketplaceDialog() {
  const { appList } = useAppList();
  const [open, setOpen] = useState(false);
  const [launchToken, setLaunchToken] = useState(0);
  const [mode, setMode] = useState<Mode>('import');
  const [destinations, setDestinations] = useState<HookDestination[]>([]);
  const [id, setId] = useState('');
  const [state, setState] = useState<HookMarketplaceState>();
  const [savedGlobals, setSavedGlobals] = useState<GlobalHook[]>([]);
  const [url, setURL] = useState('');
  const [preview, setPreview] = useState<HookImportPreview>();
  const [installation, setInstallation] = useState<{
    id: string; name: string; global: boolean; enabled?: boolean; scopeEnabled?: boolean; destinationId: string; allGroups: boolean; location: string; updated: boolean;
  }>();
  const [allGroups, setAllGroups] = useState(false);
  const [updates, setUpdates] = useState<HookUpdate[]>([]);
  const [updatesChecked, setUpdatesChecked] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<HookUpdate>();
  const [hookId, setHookId] = useState('');
  const [fixedPublishHook, setFixedPublishHook] = useState(false);
  const editorWindow =
    new URL(window.location.href).searchParams.get('view') ===
    'global-hook-editor';
  const [publishName, setPublishName] = useState('');
  const [publishTestURL, setPublishTestURL] = useState('');
  const [account, setAccount] = useState<{
    signedIn: boolean;
    email?: string;
  }>();
  const [publication, setPublication] = useState<{
    id: string;
    version: number;
  }>();
  const [description, setDescription] = useState('');
  const [license, setLicense] = useState<(typeof hookLicenses)[number]>('MIT');
  const [general, setGeneral] = useState(false);
  const [listingId, setListingId] = useState('');
  const [expectedVersion, setExpectedVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const allGroupsRef = useRef(false);
  allGroupsRef.current = allGroups;
  const invoke = async (input: HookMarketplaceRequest) => {
    const currentGeneration = generation.current;
    const result = await window.electron.hookMarketplace.request({
      ...input,
      allGroups: input.allGroups ?? allGroupsRef.current,
    });
    if (currentGeneration !== generation.current)
      throw new Error('Installer context changed.');
    return result;
  };
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    const { current } = generation;
    try {
      await operation();
    } catch (error) {
      if (generation.current === current)
        setMessage(String(error).replace(/^Error: /, ''));
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };
  useEffect(() => {
    const launch = async (
      detail: {
        mode?: Mode;
        origin?: string;
        hookId?: string;
        url?: string;
        allGroups?: boolean;
      } = {}
    ) => {
      generation.current += 1;
      setLaunchToken(generation.current);
      const { current } = generation;
      setOpen(true);
      setMode(detail.mode || 'import');
      setURL(detail.url || '');
      setPreview(undefined);
      setInstallation(undefined);
      setSelectedUpdate(undefined);
      setUpdates([]);
      setUpdatesChecked(false);
      setId('');
      setState(undefined);
      setMessage('');
      setHookId(detail.hookId || '');
      setFixedPublishHook(detail.mode === 'publish' && !!detail.hookId);
      setDescription('');
      setPublishName('');
      setAccount(undefined);
      setPublication(undefined);
      setListingId('');
      setExpectedVersion('');
      setAllGroups(detail.allGroups === true);
      setBusy(true);
      try {
        const targets: HookDestination[] = await invoke({
          action: 'destinations',
          allGroups: false,
        });
        if (generation.current !== current) return;
        setDestinations(targets);
        const target =
          targets.find(
            (item) =>
              detail.origin &&
              new URL(item.url).origin === new URL(detail.origin).origin
          ) || targets[0];
        setId(detail.allGroups ? '@all-groups' : target?.id || '');
        setState(undefined);
        if (detail.url) {
          const loaded = await invoke({ action: 'preview', url: detail.url });
          if (generation.current === current) setPreview(loaded);
        }
      } catch (error) {
        if (generation.current === current) setMessage(String(error));
      } finally {
        if (generation.current === current) setBusy(false);
      }
    };
    const listener = (event: Event) => {
      launch((event as CustomEvent).detail).catch(() => {});
    };
    window.addEventListener(OPEN_HOOK_MARKETPLACE, listener);
    const view = new URL(window.location.href).searchParams.get('view');
    const off =
      (view === 'main' || view === 'settings')
        ? window.electron.hookMarketplace.onInstall((urlValue) => {
            launch({ url: urlValue }).catch(() => {});
          })
        : () => {};
    if (view === 'main' || view === 'settings') window.electron.hookMarketplace.ready();
    return () => {
      generation.current += 1;
      off();
      window.removeEventListener(OPEN_HOOK_MARKETPLACE, listener);
    };
  }, []);
  useEffect(() => {
    if (!open || !id) return undefined;
    let live = true;
    const loadState = async () => {
      if (mode === 'updates') {
        setBusy(true);
        setUpdatesChecked(false);
      }
      try {
        const result = await invoke({ action: 'state', id, allGroups });
        if (!live) return;
        setState(result);
        setSavedGlobals(result.global.hooks);
        if (mode === 'updates') {
          const items = await invoke({ action: 'updates', id, allGroups });
          if (live) {
            setUpdates(items);
            setUpdatesChecked(true);
          }
        }
      } catch (error) {
        if (live) setMessage(String(error));
      } finally {
        if (live && mode === 'updates') setBusy(false);
      }
    };
    loadState().catch(() => {});
    return () => {
      live = false;
    };
  }, [id, open, launchToken, allGroups, mode]);
  useEffect(() => {
    if (!open || mode !== 'publish') return undefined;
    let live = true;
    const refresh = () => {
      invoke({ action: 'account-status' })
        .then((result) => {
          if (live) setAccount(result);
          return undefined;
        })
        .catch((error) => {
          if (live) setMessage(String(error));
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
    };
  }, [open, mode, launchToken]);
  const close = (value: boolean) => {
    if (busy) return;
    setOpen(value);
    if (!value) generation.current += 1;
  };
  const loadPreview = (value = url) =>
    run(async () => {
      const loaded = await invoke({ action: 'preview', url: value });
      setPreview(loaded);
      setSelectedUpdate(undefined);
    });
  const saveGlobals = (config = state?.global) =>
    run(async () => {
      if (!state || !config) return;
      const result = await invoke({
        action: 'global-save',
        id,
        config,
        expectedHash: state.globalHash,
      });
      setState(result);
      setSavedGlobals(result.global.hooks);
      setMessage(
        'Global hook settings saved. Reload affected pages to start enabled hooks.'
      );
    });
  const openGlobalEditor = (selectedId?: string) =>
    run(async () => {
      if (!state) return;
      const result = await invoke({
        action: 'global-save',
        id,
        config: state.global,
        expectedHash: state.globalHash,
      });
      setState(result);
      setSavedGlobals(result.global.hooks);
      await invoke({
        action: 'global-editor-open',
        id,
        ...(selectedId ? { hookId: selectedId } : {}),
      });
      setOpen(false);
    });
  const install = (replace = false) =>
    run(async () => {
      if (!preview) return;
      const result = await invoke({
        action: 'install',
        id,
        receipt: preview.receipt,
        global: selectedUpdate ? selectedUpdate.global : allGroups,
        ...(replace && selectedUpdate
          ? {
              replaceId: selectedUpdate.hookId,
              expectedHash: selectedUpdate.localHash,
            }
          : {}),
      });
      setState(result);
      setSavedGlobals(result.global.hooks);
      if (!result.installedHook) throw new Error('Could not confirm installation. Check your hooks list before trying again.');
      setInstallation({
        ...result.installedHook, destinationId: id, allGroups,
        location: allGroups ? 'All groups' : result.installedHook.global ? result.destination.groupName : new URL(result.destination.url).host,
        updated: replace,
      });
      window.dispatchEvent(new Event(HOOKS_CHANGED));
      setPreview(undefined);
      setSelectedUpdate(undefined);
      setUpdates([]);
      setMessage('');
    });
  const alreadyInstalled =
    !selectedUpdate &&
    !!preview &&
    (allGroups ? state?.global.hooks : state?.siteHooks)?.some(
      (hook) =>
        hook.installed?.url === preview.source ||
        (preview.publication &&
          hook.installed?.packageId === preview.publication.id)
    );
  const saveLabel = alreadyInstalled ? 'Install another copy' : 'Install hook';
  const savedHook = hookId
    ? state?.siteHooks.find((hook) => hook.id === hookId) ||
      savedGlobals.find((hook) => `global:${hook.id}` === hookId)
    : state?.defaultHook;
  useEffect(() => {
    setPublishName(savedHook?.name || '');
    setPublishTestURL(savedHook?.testUrl || '');
    setDescription(savedHook?.publication?.description || '');
    setListingId(savedHook?.publication?.id || '');
    setExpectedVersion(
      savedHook?.publication ? String(savedHook.publication.version) : ''
    );
    if (savedHook?.publication) setLicense(savedHook.publication.license);
    if (hookId.startsWith('global:')) setGeneral(true);
    setPublication(undefined);
    setMessage('');
  }, [
    savedHook?.id,
    savedHook?.name,
    savedHook?.testUrl,
    savedHook?.publication,
    hookId,
  ]);
  const changeMode = (value: Mode) => {
    setMode(value);
    setInstallation(undefined);
    setPreview(undefined);
    setSelectedUpdate(undefined);
    setPublication(undefined);
    setMessage('');
  };
  const globalScope = allGroups || mode === 'global' || selectedUpdate?.global;
  const currentTarget = destinations.find((target) => target.id === id);
  const groupOptions: GroupOption[] = [];
  const seenGroups = new Set<string>();
  destinations.forEach((target) => {
    if (seenGroups.has(target.groupId)) return;
    seenGroups.add(target.groupId);
    groupOptions.push({
      id: target.groupId,
      name: target.groupName,
      group: appList.find((tab) => tab.id === target.id),
    });
  });
  groupOptions.unshift({
    id: '@all-groups',
    name: 'All groups',
    detail: 'Every group in the app',
    leadingIcon: <Globe2 size={16} />,
  });
  const websiteTargets = new Map<string, HookDestination>();
  destinations
    .filter((target) => target.groupId === currentTarget?.groupId)
    .forEach((target) => {
      const { origin } = new URL(target.url);
      if (!websiteTargets.has(origin) || target.id === id)
        websiteTargets.set(origin, target);
    });
  const groupTargets = [...websiteTargets.values()];
  const sharedGroups = [
    ...new Set(
      destinations
        .filter(
          (target) =>
            target.profile === currentTarget?.profile &&
            target.groupId !== currentTarget?.groupId
        )
        .map((target) => target.groupName)
    ),
  ];
  const chooseDestination = (targetId: string) => {
    setPublication(undefined);
    setMessage('');
    setId(targetId);
    setState(undefined);
    setUpdates([]);
  };
  let scopeDescription =
    'Applies to this group and any groups sharing its browser session.';
  if (allGroups)
    scopeDescription =
      'Applies to every group in the app, including groups added later.';
  else if (sharedGroups.length)
    scopeDescription = `Also applies to ${sharedGroups.join(
      ', '
    )} because these groups share the same browser session.`;
  const destination = (
    <div className="hook-marketplace-destination">
      <div className="hook-destination-group">
        <span>Group</span>
        <GroupPicker
          options={groupOptions}
          value={allGroups ? '@all-groups' : currentTarget?.groupId || ''}
          onChange={(groupId) => {
            setAllGroups(groupId === '@all-groups');
            setState(undefined);
            setUpdates([]);
            if (groupId === '@all-groups') return;
            const target = destinations.find(
              (item) => item.groupId === groupId
            );
            if (target) chooseDestination(target.id);
          }}
          label="Hook group"
          disabled={busy || !!selectedUpdate || !groupOptions.length}
        />
      </div>
      {!globalScope && groupTargets.length > 1 && (
        <label>
          Website
          <select
            value={id}
            disabled={busy || !!selectedUpdate}
            onChange={(event) => chooseDestination(event.target.value)}
          >
            {groupTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {new URL(target.url).host}
              </option>
            ))}
          </select>
        </label>
      )}
      {!globalScope && currentTarget && groupTargets.length === 1 && (
        <small>Website: {new URL(currentTarget.url).host}</small>
      )}
      {globalScope && <small>{scopeDescription}</small>}
    </div>
  );
  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Content
        className="hook-marketplace-dialog"
        maxWidth={selectedUpdate ? '840px' : '620px'}
      >
        <div className="hook-marketplace-header">
          <div>
            <Dialog.Title mb="1">
              {installation ? (installation.updated ? 'Hook updated' : 'Hook installed') : mode === 'publish' && listingId
                ? 'Republish hook'
                : modeTitles[mode]}
            </Dialog.Title>
            <Dialog.Description size="2">
              {installation ? `${installation.name} is ready in ${installation.location}.` : mode === 'publish'
                ? listingId
                  ? `Update ${publishName || 'your hook'} with a new version.`
                  : 'Share your hook with the community.'
                : preview && mode === 'import'
                  ? 'Choose where to install this hook.'
                  : modeDescriptions[mode]}
            </Dialog.Description>
          </div>
          <div className="hook-header-actions">
            {!editorWindow && !preview && !installation && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Button
                    variant="ghost"
                    color="gray"
                    disabled={busy}
                    aria-label="More hook actions"
                  >
                    <MoreHorizontal size={18} />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  {(Object.keys(modeTitles) as Mode[]).map((value) => (
                    <DropdownMenu.Item
                      key={value}
                      onSelect={() => changeMode(value)}
                    >
                      {modeTitles[value]}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            )}
            <Dialog.Close>
              <Button
                variant="ghost"
                color="gray"
                aria-label="Close marketplace"
                disabled={busy}
              >
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
        </div>
        {!installation && mode !== 'import' &&
          !preview &&
          !(mode === 'publish' && fixedPublishHook) &&
          destination}
        {installation && (
          <section className="hook-install-success" aria-label="Installation complete">
            <CheckCircle2 size={32} aria-hidden="true" />
            <p role="status">{installation.updated ? 'Updated successfully.' : 'Installed successfully.'} {installation.enabled === false ? 'This hook remains disabled.' : 'This hook is enabled.'}</p>
            <p>Open Hook Editor to customize it or run it on the current page. Enabled hooks also run when matching pages load.</p>
            {installation.scopeEnabled === false && <p>Hooks are also off for {installation.location}. Turn them on in the editor to let this hook run.</p>}
            <div className="hook-dialog-actions">
              <Button variant="soft" color="gray" disabled={busy} onClick={() => close(false)}>Done</Button>
              <Button disabled={busy} onClick={() => run(async () => {
                await invoke(installation.global
                  ? { action: 'global-editor-open', id: installation.destinationId, allGroups: installation.allGroups, hookId: installation.id }
                  : { action: 'site-editor-open', id: installation.destinationId, allGroups: false, hookId: installation.id });
                setOpen(false);
              })}>Open Hook Editor</Button>
            </div>
          </section>
        )}
        {!installation && <div className="hook-marketplace-body">
          {mode === 'import' && !preview && (
            <>
              <button
                type="button"
                className="hook-marketplace-browse"
                onClick={() =>
                  run(async () => {
                    await invoke({ action: 'browse' });
                    setOpen(false);
                  })
                }
                disabled={busy}
              >
                <span className="hook-browse-icon">
                  <Store size={22} />
                </span>
                <span>
                  <strong>Explore the marketplace</strong>
                  <span>Find hooks made by the community</span>
                </span>
                <ArrowUpRight size={18} />
              </button>
              <div className="hook-import-divider">
                <span>or install from a link</span>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  loadPreview();
                }}
                className="hook-url-form"
              >
                <label htmlFor="hook-package-url">Hook link</label>
                <div>
                  <input
                    id="hook-package-url"
                    value={url}
                    onChange={(event) => setURL(event.target.value)}
                    placeholder="Paste a hook link…"
                    required
                    disabled={busy}
                  />
                  <Button type="submit" disabled={busy || !url.trim()}>
                    Preview
                  </Button>
                </div>
              </form>
            </>
          )}
          {mode === 'global' && state && (
            <div className="hook-global-manager">
              <div className="hook-global-switch">
                <label htmlFor="hook-global-enabled">Hooks enabled</label>
                <Switch
                  id="hook-global-enabled"
                  checked={state.global.enabled}
                  disabled={busy}
                  onCheckedChange={(enabled) =>
                    saveGlobals({ ...state.global, enabled })
                  }
                />
              </div>
              <p>
                Enabled hooks run on websites in the selected scope, except
                excluded domains. Site hooks run afterward.
              </p>
              {state.global.hooks.map((hook) => (
                <section className="hook-global-item" key={hook.id}>
                  <div>
                    <label className="hook-checkbox">
                      <input
                        type="checkbox"
                        checked={hook.enabled}
                        disabled={busy}
                        onChange={(event) =>
                          saveGlobals({ ...state.global, hooks: state.global.hooks.map(item => item.id === hook.id ? { ...item, enabled: event.target.checked } : item) })
                        }
                      />
                      {hook.name}
                    </label>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => openGlobalEditor(hook.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      color="red"
                      disabled={busy}
                      onClick={() => {
                        // eslint-disable-next-line no-alert
                        if (window.confirm(`Remove ${hook.name}?`))
                          setState({
                            ...state,
                            global: {
                              ...state.global,
                              hooks: state.global.hooks.filter(
                                (item) => item.id !== hook.id
                              ),
                            },
                          });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </section>
              ))}
              {!state.global.hooks.length && (
                <p className="hook-dialog-empty">
                  No global hooks yet. Install a general hook or create one
                  below.
                </p>
              )}
              <div className="hook-dialog-actions">
                <Button
                  variant="soft"
                  disabled={busy || state.global.hooks.length >= 20}
                  onClick={() => openGlobalEditor()}
                >
                  New global hook
                </Button>
                <Button disabled={busy} onClick={() => saveGlobals()}>
                  Save global settings
                </Button>
              </div>
            </div>
          )}
          {mode === 'publish' && (
            <form
              className="hook-publish-browser"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  const result = await invoke({
                    action: 'publish',
                    id,
                    hookId,
                    description,
                    name: publishName,
                    testUrl: publishTestURL.trim(),
                    license,
                    general,
                    ...(listingId
                      ? {
                          listingId,
                          expectedVersion: Number(expectedVersion),
                        }
                      : {}),
                  });
                  window.dispatchEvent(new Event('kudium-hook-published'));
                  setPublication(result);
                  setListingId(result.id);
                  setExpectedVersion(String(result.version));
                  setMessage(`Version ${result.version} published.`);
                });
              }}
            >
              <div className="hook-publish-account">
                <span>
                  {account?.signedIn
                    ? `Publishing as ${account.email || 'your Kudium account'}`
                    : 'Sign in to Kudium to publish.'}
                </span>
                {!account?.signedIn && (
                  <Button
                    type="button"
                    variant="soft"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await invoke({ action: 'account-preferences' });
                      })
                    }
                  >
                    Sign in
                  </Button>
                )}
              </div>
              {!fixedPublishHook && (
                <label>
                  Saved hook
                  <select
                    value={hookId}
                    onChange={(event) => {
                      setHookId(event.target.value);
                      if (event.target.value.startsWith('global:'))
                        setGeneral(true);
                    }}
                  >
                    <option value="">
                      {state?.defaultHook
                        ? 'Default hook'
                        : 'Select a saved hook'}
                    </option>
                    {state?.siteHooks.map((hook) => (
                      <option key={hook.id} value={hook.id}>
                        {hook.name}
                      </option>
                    ))}
                    {state?.global.hooks.map((hook) => (
                      <option key={hook.id} value={`global:${hook.id}`}>
                        {hook.name} · global
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Public name
                <input
                  required
                  maxLength={120}
                  value={publishName}
                  onChange={(event) => setPublishName(event.target.value)}
                  placeholder="Name your hook"
                />
              </label>
              <label>
                Description
                <textarea
                  required
                  rows={3}
                  maxLength={4000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              {savedHook && (
                <p className="hook-publish-scope">
                  Works on{' '}
                  {savedHook.sites?.length
                    ? savedHook.sites
                        .map(
                          (site) =>
                            `${site.includeSubdomains ? '*.' : ''}${site.host}`
                        )
                        .join(', ')
                    : general
                    ? 'any website'
                    : currentTarget
                    ? new URL(currentTarget.url).host
                    : 'this website'}
                  {savedHook.path !== '/*' && ` · ${savedHook.path}`}
                </p>
              )}
              <details className="hook-publish-options">
                <summary>Publishing options</summary>
                <div className="hook-publish-options-body">
                  <HookTestWebsiteField
                    value={publishTestURL}
                    onChange={setPublishTestURL}
                    disabled={busy}
                  />
                  <div className="hook-dialog-columns">
                    <label>
                      License
                      <select
                        value={license}
                        onChange={(event) =>
                          setLicense(event.target.value as typeof license)
                        }
                      >
                        {hookLicenses.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Applicability
                      <select
                        value={
                          savedHook?.sites?.length
                            ? 'restricted'
                            : general
                            ? 'general'
                            : 'site'
                        }
                        disabled={hookId.startsWith('global:')}
                        onChange={(event) =>
                          setGeneral(event.target.value === 'general')
                        }
                      >
                        {savedHook?.sites?.length ? (
                          <option value="restricted">
                            {savedHook.sites
                              .map(
                                (site) =>
                                  `${site.includeSubdomains ? '*.' : ''}${
                                    site.host
                                  }`
                              )
                              .join(', ')}
                          </option>
                        ) : null}
                        <option value="site">This website</option>
                        <option value="general">General / any website</option>
                      </select>
                    </label>
                  </div>
                  <details>
                    <summary>Update an existing publication</summary>
                    <label>
                      Marketplace hook ID
                      <input
                        value={listingId}
                        onChange={(event) => setListingId(event.target.value)}
                      />
                    </label>
                    <label>
                      Current published version
                      <input
                        type="number"
                        min={1}
                        required={!!listingId}
                        value={expectedVersion}
                        onChange={(event) =>
                          setExpectedVersion(event.target.value)
                        }
                      />
                    </label>
                  </details>
                  {savedHook && (
                    <div className="hook-publish-source">
                      {savedHook.actions?.map(action => <details key={action.id}><summary>{action.name} · context menu</summary><pre>{action.source}</pre></details>)}
                      {(['before', 'after', 'css'] as const)
                        .filter((phase) => savedHook[phase].trim())
                        .map((phase) => (
                          <details key={phase}>
                            <summary>{phase} source</summary>
                            <pre>{savedHook[phase]}</pre>
                          </details>
                        ))}
                    </div>
                  )}
                </div>
              </details>
              {!savedHook && (
                <p role="status">
                  Add code and save a hook in the editor first, then select it
                  here.
                </p>
              )}
              {publication && (
                <a
                  href={`https://browser.kudium.com/hooks/${publication.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View published hook
                </a>
              )}
              <div className="hook-publish-footer">
                {message && (
                  <p className="hook-dialog-message" role={preview || installation || message.includes("Fix these code errors") ? "alert" : "status"} style={{ whiteSpace: "pre-line" }}>
                    {message}
                  </p>
                )}
                <label className="hook-checkbox">
                  <input type="checkbox" required /> I can share this code under
                  the {license} license.
                </label>
                <Button
                  type="submit"
                  disabled={
                    busy || !savedHook || !account?.signedIn || !!publication
                  }
                >
                  {publication
                    ? 'Published'
                    : listingId
                    ? 'Republish hook'
                    : 'Publish hook'}
                </Button>
              </div>
            </form>
          )}
          {mode === 'updates' && !preview && (
            <div className="hook-updates">
              <div className="hook-update-heading">
                <strong>Installed hooks</strong>
                <Button
                  size="1"
                  variant="ghost"
                  color="gray"
                  disabled={busy || !state}
                  onClick={() =>
                    run(async () => {
                      setUpdates(await invoke({ action: 'updates', id }));
                      setUpdatesChecked(true);
                    })
                  }
                >
                  <RefreshCw size={14} /> Check again
                </Button>
              </div>
              {updatesChecked && !updates.length && (
                <p>No imported hooks to check in this scope.</p>
              )}
              {updates.map((update) => (
                <div
                  className="hook-update-row"
                  key={`${update.global}:${update.hookId}`}
                >
                  <div>
                    <strong>{update.current.package.name}</strong>
                    <small>
                      {update.error ||
                        (update.preview
                          ? 'New version available'
                          : 'Up to date')}
                      {update.modified ? ' · You have local edits' : ''}
                    </small>
                  </div>
                  {update.preview && (
                    <Button
                      disabled={busy}
                      variant="soft"
                      onClick={() => {
                        setSelectedUpdate(update);
                        setPreview(update.preview);
                      }}
                    >
                      Review update
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>}
        {preview && (
          <section className="hook-package-preview">
            <Button
              variant="ghost"
              color="gray"
              size="1"
              disabled={busy}
              onClick={() => {
                setPreview(undefined);
                setSelectedUpdate(undefined);
              }}
            >
              <ArrowLeft size={14} />{' '}
              {selectedUpdate ? 'Back to updates' : 'Use another link'}
            </Button>
            <div className="hook-preview-heading">
              <h3>{preview.package.name}</h3>
              <span>
                {preview.verified
                  ? `By ${preview.publication?.publisher.name}${preview.publication?.publisher.username ? ` · @${preview.publication.publisher.username}` : ''} · v${preview.publication?.version}`
                  : 'External source · publisher unverified'}
              </span>
            </div>
            <p>{preview.package.description}</p>
            {alreadyInstalled && (
              <p className="hook-update-notice">
                This hook is already installed here. Saving adds a separate
                disabled copy.
              </p>
            )}
            {selectedUpdate && (
              <p className="hook-update-notice">
                {selectedUpdate.modified
                  ? 'You have local edits. Applying this version overwrites them. You can save a separate disabled copy instead.'
                  : 'Review the changes below. The updated hook will be saved disabled.'}
              </p>
            )}
            <details className="hook-source-review" open={!!selectedUpdate}>
              <summary>
                {selectedUpdate ? 'Review code changes' : 'Details and source code'}
              </summary>
            {preview.package.testUrl && (
              <p>
                Test website:{' '}
                <a
                  href={preview.package.testUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {preview.package.testUrl}
                </a>
              </p>
            )}

            <div className="hook-preview-facts">
              <span>{preview.package.license}</span>
              {preview.package.path !== '/*' && <span>Path: {preview.package.path}</span>}
              <span>
                {preview.package.applicability === 'general'
                  ? 'General hook'
                  : preview.package.sites
                      .map(
                        (site) =>
                          `${site.host}${
                            site.includeSubdomains ? ' + subdomains' : ''
                          }`
                      )
                      .join(', ')}
              </span>
            </div>
              <p className="hook-preview-source">Source: {preview.source}</p>
              {!!preview.package.actions?.length && <p>Actions ask for permission when run. Updates do not carry permission grants.</p>}
              {preview.package.actions?.map(action => <details key={action.id}><summary>{action.name} · {action.contexts.join(', ')}</summary><pre>{action.source}</pre></details>)}
              {(['before', 'after', 'css'] as const)
                .filter(
                  (phase) =>
                    preview.package.lifecycle[phase].trim() ||
                    selectedUpdate?.localPackage.lifecycle[phase].trim()
                )
                .map((phase) => (
                  <details key={phase} open>
                    <summary>
                      {phase === 'css' ? 'CSS' : `${phase} load`}
                      {selectedUpdate &&
                      selectedUpdate.localPackage.lifecycle[phase] !==
                        preview.package.lifecycle[phase]
                        ? ' · changed'
                        : ''}
                    </summary>
                    <div
                      className={selectedUpdate ? 'hook-code-comparison' : ''}
                    >
                      {selectedUpdate && (
                        <div>
                          <small>Your installed code</small>
                          <pre>
                            {selectedUpdate.localPackage.lifecycle[phase] ||
                              '(empty)'}
                          </pre>
                        </div>
                      )}
                      <div>
                        {selectedUpdate && <small>New package</small>}
                        <pre>
                          {preview.package.lifecycle[phase] || '(empty)'}
                        </pre>
                      </div>
                    </div>
                  </details>
                ))}
            </details>
            {selectedUpdate && (
              <p>
                Previous rules: {selectedUpdate.current.package.applicability} ·{' '}
                {selectedUpdate.current.package.sites
                  .map((site) => site.host)
                  .join(', ')}{' '}
                · {selectedUpdate.current.package.path}
              </p>
            )}
            {destination}
            <div className="hook-install-footer">
              <p>Installs disabled. Enable it in Hook Editor when ready.</p>
              <div className="hook-dialog-actions">
                <Button
                  disabled={busy || !state}
                  onClick={() => install(!!selectedUpdate)}
                >
                  {selectedUpdate ? 'Apply update' : saveLabel}
                </Button>
                {selectedUpdate && (
                  <Button
                    disabled={busy || !state}
                    variant="soft"
                    onClick={() => install(false)}
                  >
                    Save separate copy
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}
        {message && mode !== 'publish' && (
          <p className="hook-dialog-message" role={preview || installation || message.includes("Fix these code errors") ? "alert" : "status"} style={{ whiteSpace: "pre-line" }}>
            {message}
          </p>
        )}
        {busy && <p role="status">Working…</p>}
      </Dialog.Content>
    </Dialog.Root>
  );
}

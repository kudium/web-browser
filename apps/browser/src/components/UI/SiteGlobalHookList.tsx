import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertDialog,
  Button,
  DropdownMenu,
  IconButton,
  Popover,
  Switch,
} from '@radix-ui/themes';
import { MoreHorizontal } from 'lucide-react';
import { OPEN_HOOK_MARKETPLACE } from './HookMarketplaceDialog';
import { PreferenceHint } from './PreferenceHint';
import {
  globalHookEnabledOnWebsite,
  type GlobalHook,
  type HookMarketplaceState,
} from '../../browser/hookMarketplace';
import {
  hookMatchesPath,
  hookMatchesWebsite,
  hookWebsiteExclusions,
} from '../../browser/siteDeveloper';
/* eslint-disable react/require-default-props */
export function SiteGlobalHookList({
  url,
  disabled,
}: {
  url?: string;
  disabled: boolean;
}) {
  const [scopes, setScopes] = useState<
    Array<{ allGroups: boolean; state: HookMarketplaceState }>
  >([]);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState('');
  const [blockedTip, setBlockedTip] = useState('');
  const [deletion, setDeletion] = useState<{
    allGroups: boolean;
    hook: GlobalHook;
  }>();
  useEffect(() => {
    setBlockedTip('');
    let live = true;
    let refreshing = false;
    const refresh = async () => {
      if (
        !url ||
        !window.electron?.hookMarketplace ||
        refreshing ||
        saving.current
      )
        return;
      refreshing = true;
      const version = requestVersion.current;
      try {
        const results = await Promise.all(
          [true, false].map(async (allGroups) => ({
            allGroups,
            state: (await window.electron.hookMarketplace.request({
              action: 'state',
              allGroups,
            })) as HookMarketplaceState,
          })),
        );
        if (live && version === requestVersion.current) {
          setScopes((previous) =>
            previous.length === results.length &&
            previous.every(
              (scope, index) =>
                scope.allGroups === results[index].allGroups &&
                scope.state.globalHash === results[index].state.globalHash,
            )
              ? previous
              : results,
          );
        }
      } catch (reason) {
        if (live && version === requestVersion.current)
          setError(String(reason).replace(/^Error: /, ''));
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
    };
  }, [url]);
  const save = async (
    allGroups: boolean,
    hook: GlobalHook,
    patch?: Partial<Pick<GlobalHook, 'enabled' | 'exclusions' | 'enabledSites'>>,
  ) => {
    const scope = scopes.find((item) => item.allGroups === allGroups);
    if (!scope || saving.current) return;
    saving.current = true;
    requestVersion.current += 1;
    setBusy(true);
    setError('');
    try {
      const state = (await window.electron.hookMarketplace.request({
        action: 'global-save',
        allGroups,
        expectedHash: scope.state.globalHash,
        config: {
          ...scope.state.global,
          hooks:
            patch === undefined
              ? scope.state.global.hooks.filter((item) => item.id !== hook.id)
              : scope.state.global.hooks.map((item) =>
                  item.id === hook.id ? { ...item, ...patch } : item,
                ),
        },
      })) as HookMarketplaceState;
      setScopes((previous) =>
        previous.map((item) =>
          item.allGroups === allGroups ? { ...item, state } : item,
        ),
      );
    } catch (reason) {
      setError(String(reason).replace(/^Error: /, ''));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const matching = useMemo(
    () =>
      scopes.flatMap((scope) =>
        (scope.state?.global?.hooks || [])
          .filter((hook) => {
            if (!url) return false;
            try {
              return (
                ['http:', 'https:'].includes(new URL(url).protocol) &&
                hookMatchesPath(hook.path, url) &&
                hookMatchesWebsite(hook, url)
              );
            } catch {
              return false;
            }
          })
          .map((hook) => ({ ...scope, hook,
            excluded: !globalHookEnabledOnWebsite(hook, url!),
            wildcardExcluded: hookWebsiteExclusions(hook.exclusions, url!).some(
              (rule) => rule.startsWith('*.'),
            ),
          })),
      ),
    [scopes, url],
  );
  return (
    <>
      {matching.length > 0 && (
        <div className="site-hook-list-section site-global-hook-heading">
          <span>Global hooks</span>
          <PreferenceHint label="global hooks">
            <p>Switches apply only to this website. Global disable and delete apply everywhere in the hook’s scope.</p>
          </PreferenceHint>
        </div>
      )}
      {matching.map(({ allGroups, state, hook, excluded, wildcardExcluded }) => (
        <div className="site-hook-list-row" key={`${allGroups}:${hook.id}`}>
          <button
            type="button"
            className="site-hooks-list-item"
            title={hook.name || 'Untitled hook'}
            disabled={disabled || busy}
            onClick={() => {
              if (opening) return;
              setOpening(`${allGroups}:${hook.id}`);
              setError('');
              void window.electron.hookMarketplace
                .request({
                  action: 'global-editor-open',
                  allGroups,
                  hookId: hook.id,
                })
                .catch((reason) => setError(String(reason)))
                .finally(() => setOpening(''));
            }}
          >
            <strong>{hook.name || 'Untitled hook'}</strong>
            {opening === `${allGroups}:${hook.id}` && (
              <small role="status">Opening editor…</small>
            )}
          </button>
          <div className="site-hook-list-controls">
            <span className="site-hook-list-meta">
              {allGroups ? 'All groups' : 'This session'}
            </span>
            <span className="site-hook-list-status">
              {!state.global.enabled || !hook.enabled ? 'Disabled everywhere' : excluded ? 'Disabled here' : 'Active'}
            </span>
            <Popover.Root open={blockedTip === `${allGroups}:${hook.id}`} onOpenChange={(open) => { if (!open) setBlockedTip(''); }}>
            <Popover.Trigger>
            <Switch
              size="1"
              aria-label={`Enable ${hook.name} on this website`}
              checked={state.global.enabled && hook.enabled && !excluded}
              disabled={disabled || busy || (wildcardExcluded && state.global.enabled && hook.enabled)}
              onCheckedChange={(enabled) => {
                if (!state.global.enabled || !hook.enabled) {
                  setBlockedTip(`${allGroups}:${hook.id}`);
                  return;
                }
                const host = new URL(url!).hostname;
                void save(allGroups, hook, hook.autoMode ? {
                  enabledSites: enabled ? [...new Set([...(hook.enabledSites || []), host])] : (hook.enabledSites || []).filter(item => item !== host),
                  ...(enabled ? { exclusions: hook.exclusions.filter(rule => rule !== host) } : {}),
                } : { exclusions: enabled ? hook.exclusions.filter(rule => rule !== host) : [...new Set([...hook.exclusions, host])] });
              }}
            />
            </Popover.Trigger>
            <Popover.Content maxWidth="300px" className="preference-hint-content">
              <p>{!state.global.enabled
                ? 'Global hooks are disabled. Enable them in Preferences → Hooks first, then enable this hook for the website.'
                : 'This hook is disabled globally. Choose Enable everywhere in its options first, then enable it for this website.'}</p>
            </Popover.Content>
            </Popover.Root>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  disabled={disabled || busy}
                  aria-label={`Global options for ${hook.name}`}
                >
                  <MoreHorizontal size={15} />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                  {hook.installed && (
                    <DropdownMenu.Item
                      onSelect={() =>
                        window.dispatchEvent(
                          new CustomEvent(OPEN_HOOK_MARKETPLACE, {
                            detail: {
                              mode: 'updates',
                              origin: url,
                              hookId: `global:${hook.id}`,
                              allGroups,
                            },
                          }),
                        )
                      }
                    >
                      Check for updates
                    </DropdownMenu.Item>
                  )}

                  <DropdownMenu.Item
                  onSelect={() => {
                    void window.electron.hookMarketplace
                      .request({
                        action: 'global-editor-open',
                        allGroups,
                        hookId: hook.id,
                      })
                      .catch((reason) => setError(String(reason)));
                  }}
                >
                  Edit / Rename
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => { void save(allGroups, hook, { enabled: !hook.enabled }); }}>
                  {hook.enabled ? 'Disable everywhere' : 'Enable everywhere'}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  color="red"
                  onSelect={() => setDeletion({ allGroups, hook })}
                >
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
        </div>
      ),
      )}
      {matching.some((item) => item.wildcardExcluded) && (
        <small className="site-hook-list-note">This website is covered by a domain exclusion. Use Edit / Rename to manage excluded websites.</small>
      )}
      {matching.some((item) => !item.state.global.enabled) && (
        <small className="site-hook-list-note">
          Global hooks are paused in Preferences.
        </small>
      )}
      {error && <p role="alert">{error}</p>}
      <AlertDialog.Root
        open={!!deletion}
        onOpenChange={(open) => {
          if (!open) setDeletion(undefined);
        }}
      >
        <AlertDialog.Content size="2" maxWidth="360px">
          <AlertDialog.Title>Delete global hook?</AlertDialog.Title>
          <AlertDialog.Description>
            Remove {deletion?.hook.name} from every website where it applies?
          </AlertDialog.Description>
          <div className="site-hook-enable-actions">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                color="red"
                onClick={() => {
                  if (deletion) void save(deletion.allGroups, deletion.hook);
                  setDeletion(undefined);
                }}
              >
                Delete
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}

import { HookIcon } from '../../UI/HookIcon';
/* Controls have associated labels and explicit accessible names. */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useState } from 'react';
import { Button, IconButton, Switch, TextField } from '@radix-ui/themes';
import { Download, Plus, Search, Trash2 } from 'lucide-react';
import {
  HOOKS_CHANGED,
  OPEN_HOOK_MARKETPLACE,
} from '../../UI/HookMarketplaceDialog';
import type {
  GlobalHookConfig,
  HookMarketplaceState,
} from '../../../browser/hookMarketplace';
import { ALL_GROUPS_HOOK_SCOPE } from '../../../browser/hookMarketplace';

export function HooksSettings() {
  const [state, setState] = useState<HookMarketplaceState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    let live = true;
    const refresh = () =>
      window.electron.hookMarketplace
        .request({
          action: 'state',
          id: ALL_GROUPS_HOOK_SCOPE,
          allGroups: true,
        })
        .then((result) => {
          if (live) setState(result);
        })
        .catch((reason) => {
          if (live) setError(String(reason).replace(/^Error: /, ''));
        });
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(HOOKS_CHANGED, refresh);
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener(HOOKS_CHANGED, refresh);
    };
  }, []);
  const openEditor = async (hookId?: string) => {
    setError('');
    try {
      await window.electron.hookMarketplace.request({
        action: 'global-editor-open',
        id: ALL_GROUPS_HOOK_SCOPE,
        allGroups: true,
        ...(hookId ? { hookId } : {}),
      });
    } catch (reason) {
      setError(String(reason).replace(/^Error: /, ''));
    }
  };
  const save = async (config: GlobalHookConfig) => {
    if (!state || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.electron.hookMarketplace.request({
        action: 'global-save',
        id: ALL_GROUPS_HOOK_SCOPE,
        allGroups: true,
        config,
        expectedHash: state.globalHash,
      });
      setState(result);
    } catch (reason) {
      setError(String(reason).replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  };
  const search = query.trim().toLocaleLowerCase();
  const hooks =
    state?.global.hooks.filter((hook) =>
      [
        hook.name,
        hook.path,
        hook.testUrl || '',
        ...(hook.sites || []).map((site) => site.host),
        ...hook.exclusions,
      ].some((value) => value.toLocaleLowerCase().includes(search))
    ) || [];
  return (
    <div className="hooks-settings">
      {error && <p role="alert">{error}</p>}
      {!state && !error && <p role="status">Loading hooks…</p>}
      {state && (
        <>
          <div className="hooks-settings-search-row">
            <TextField.Root
              placeholder="Search hooks…"
              aria-label="Search global hooks"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            >
              <TextField.Slot>
                <Search size={16} />
              </TextField.Slot>
            </TextField.Root>
            <label className="hooks-settings-enable">
              <span>Enabled</span>
              <Switch
                aria-label="Enable global hooks"
                checked={state.global.enabled}
                disabled={busy}
                onCheckedChange={(enabled) => {
                  void save({ ...state.global, enabled });
                }}
              />
            </label>
            <Button
              variant="soft"
              disabled={busy}
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent(OPEN_HOOK_MARKETPLACE, {
                    detail: { mode: 'import', allGroups: true },
                  })
                )
              }
            >
              <Download size={16} aria-hidden="true" />
              Install hooks
            </Button>
            <Button
              aria-label="Create global hook"
              disabled={busy || state.global.hooks.length >= 20}
              onClick={() => {
                void openEditor();
              }}
            >
              <Plus size={16} />
              Create hook
            </Button>
          </div>
          {!state.global.hooks.length && (
            <div className="hooks-settings-empty">
              <HookIcon size={28} />
              <strong>No global hooks yet</strong>
              <p>Add a hook to customize your websites.</p>
            </div>
          )}
          {state.global.hooks.length > 0 && !hooks.length && (
            <div className="hooks-settings-empty">
              <strong>No matching hooks</strong>
              <p>Try another name, pathname or website.</p>
            </div>
          )}
          <div className="hooks-settings-grid">
            {hooks.map((hook) => (
              <section
                className="preference-card hooks-settings-card"
                key={hook.id}
              >
                <div className="hooks-settings-card-title">
                  <HookIcon size={20} />
                  <strong>{hook.name || 'Untitled hook'}</strong>
                  <Switch
                    aria-label={`Enable ${hook.name}`}
                    checked={hook.enabled}
                    disabled={busy}
                    onCheckedChange={(enabled) => {
                      void save({
                        ...state.global,
                        hooks: state.global.hooks.map((item) =>
                          item.id === hook.id ? { ...item, enabled } : item
                        ),
                      });
                    }}
                  />
                </div>
                <div className="hooks-settings-card-details">
                  <p>
                    {hook.sites?.length
                      ? hook.sites
                          .map(
                            (site) =>
                              `${site.includeSubdomains ? '*.' : ''}${
                                site.host
                              }`
                          )
                          .join(', ')
                      : 'All websites'}
                    {hook.path !== '/*' && ` · ${hook.path}`}
                    {hook.exclusions.length > 0 &&
                      ` · ${hook.exclusions.length} excluded domains`}
                  </p>
                  <div className="hooks-settings-card-actions">
                    <Button
                      className="hooks-settings-hover-action"
                      size="1"
                      variant="soft"
                      disabled={busy}
                      onClick={() => {
                        void openEditor(hook.id);
                      }}
                      aria-label={`Edit ${hook.name}`}
                    >
                      Edit
                    </Button>
                    <IconButton
                      className="hooks-settings-hover-action"
                      title="Delete hook"
                      size="1"
                      variant="soft"
                      color="red"
                      disabled={busy}
                      onClick={() => {
                        // eslint-disable-next-line no-alert
                        if (window.confirm(`Remove ${hook.name}?`))
                          void save({
                            ...state.global,
                            hooks: state.global.hooks.filter(
                              (item) => item.id !== hook.id
                            ),
                          });
                      }}
                      aria-label={`Remove ${hook.name}`}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </>
      )}

    </div>
  );
}

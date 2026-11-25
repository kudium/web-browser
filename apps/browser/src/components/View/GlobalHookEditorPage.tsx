import { hookSourceValidator } from '../../browser/hookValidation';
import { OPEN_HOOK_MARKETPLACE } from '../UI/HookMarketplaceDialog';
import { FormDisclosure } from '../UI/FormDisclosure';
import { FormTextField } from '../UI/FormTextField';
import {
  EditorWindowHeader,
  EditorWindowFooter,
} from '../UI/EditorWindowChrome';
import { HookWebsiteField } from '../UI/HookWebsiteField';
/* Native form controls are associated by nesting. */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect, useState } from 'react';
import { Button, IconButton } from '@radix-ui/themes';
import { Maximize2 } from 'lucide-react';
import { HookTestWebsiteField } from '../UI/HookTestWebsiteField';
import { HookEditor } from '../UI/HookEditor';
import type {
  GlobalHook,
  HookMarketplaceState,
  HookTestState,
} from '../../browser/hookMarketplace';

export function GlobalHookEditorPage() {
  const [state, setState] = useState<HookMarketplaceState>();
  const [draft, setDraft] = useState<GlobalHook>();
  const [busy, setBusy] = useState(false);
  const [codeReady, setCodeReady] = useState(false);
  const [error, setError] = useState('');
  const [testURL, setTestURL] = useState('https://example.com');
  const [testState, setTestState] = useState<HookTestState>();
  const [testing, setTesting] = useState(false);
  useEffect(
    () => window.electron.hookMarketplace.onTestState(setTestState),
    [],
  );
  useEffect(() => {
    let live = true;
    window.electron.hookMarketplace
      .request({ action: 'state' })
      .then((result: HookMarketplaceState) => {
        if (live) {
          setState(result);
          setDraft(result.editorHook);
          setTestURL(result.editorHook?.testUrl || 'https://example.com');
        }
      })
      .catch((reason) => {
        if (live) setError(String(reason).replace(/^Error: /, ''));
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const refresh = () => {
      window.electron.hookMarketplace
        .request({ action: 'state' })
        .then((result: HookMarketplaceState) => {
          setState(result);
          setDraft(result.editorHook);
        })
        .catch((reason) => setError(String(reason).replace(/^Error: /, '')));
    };
    window.addEventListener('kudium-hook-published', refresh);
    window.addEventListener('kudium-hooks-changed', refresh);
    return () => {
      window.removeEventListener('kudium-hook-published', refresh);
      window.removeEventListener('kudium-hooks-changed', refresh);
    };
  }, []);
  useEffect(() => {
    // Let the native window paint its lightweight form before CodeMirror mounts.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => setCodeReady(true), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  const dirty =
    !!draft &&
    JSON.stringify(draft) !==
      JSON.stringify(state?.global.hooks.find((hook) => hook.id === draft.id));
  const save = async () => {
    if (!state || !draft) return;
    setBusy(true);
    setError('');
    try {
      const hook = {
        ...draft,
        sites: draft.sites?.filter((site) => site.host),
        exclusions: draft.exclusions.filter(Boolean),
      };
      hookSourceValidator.assert(hook);
      const exists = state.global.hooks.some((item) => item.id === hook.id);
      const result = await window.electron.hookMarketplace.request({
        action: 'global-save',
        config: {
          ...state.global,
          hooks: exists
            ? state.global.hooks.map((item) =>
                item.id === hook.id ? hook : item,
              )
            : [...state.global.hooks, hook],
        },
        expectedHash: state.globalHash,
      });
      setState(result);
      setDraft(result.editorHook);
    } catch (reason) {
      setError(String(reason).replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  };
  const test = async (stop = false) => {
    if (!draft) return;
    setTesting(true);
    setError('');
    try {
      await window.electron.hookMarketplace.request(
        stop
          ? { action: 'global-test-stop' }
          : {
              action: 'global-test-run',
              url: testURL.trim(),
              hook: {
                ...draft,
                sites: draft.sites?.filter((site) => site.host),
                exclusions: draft.exclusions.filter(Boolean),
              },
            },
      );
    } catch (reason) {
      setError(String(reason).replace(/^Error: /, ''));
    } finally {
      setTesting(false);
    }
  };
  return (
    <main className="site-developer-page global-hook-editor-page">
      <EditorWindowHeader
        title="Hook Editor"
        subtitle={<span className="global-hook-editor-kind">Global</span>}
      >
        <IconButton
          variant="ghost"
          color="gray"
          aria-label="Expand or restore editor"
          onClick={() => window.electron.siteDeveloper.command('expand')}
        >
          <Maximize2 size={17} />
        </IconButton>
      </EditorWindowHeader>
      {error && (
        <p role="alert" className="site-hook-import-error" style={{ whiteSpace: 'pre-line' }}>
          {error}
        </p>
      )}
      {!draft && !error && (
        <div className="hook-editor-loading" role="status">
          Loading hook…
        </div>
      )}
      {draft && (
        <div className="global-hook-editor-content">
          <div className="global-hook-editor-name">
            <FormTextField
              label="Name"
              value={draft.name}
              maxLength={120}
              disabled={busy}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </div>
          <FormDisclosure
            title="Where it runs"
            summary={[
              draft.sites
                ?.filter((site) => site.host)
                .map(
                  (site) => `${site.includeSubdomains ? '*.' : ''}${site.host}`,
                )
                .join(', ') || 'All websites',
              draft.path !== '/*' ? draft.path : '',
              draft.exclusions.filter(Boolean).length
                ? `${draft.exclusions.filter(Boolean).length} excluded`
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <div className="global-hook-editor-fields">
              <FormTextField
                label="Page pathname"
                value={draft.path}
                maxLength={500}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...draft, path: event.target.value })
                }
              />
              <HookWebsiteField
                sites={draft.sites}
                disabled={busy}
                onChange={(sites) => setDraft({ ...draft, sites })}
              />
              <FormTextField
                label="Excluded domains"
                value={draft.exclusions.join(', ')}
                disabled={busy}
                placeholder="example.com, *.example.org"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    exclusions: event.target.value
                      .split(',')
                      .map((value) => value.trim().toLowerCase()),
                  })
                }
              />
            </div>
          </FormDisclosure>
          {codeReady ? (
            <HookEditor
              selectionKey={draft.id}
              code={draft}
              disabled={busy}
              maxLength={20000}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
            />
          ) : (
            <div className="hook-editor-loading" role="status">
              Loading editor…
            </div>
          )}
          <FormDisclosure title="Test hook">
            {!!draft.actions?.length && (
              <p className="hook-actions-hint">Open the test website, then right-click a matching selection or field to try an action. Notes and activity are previewed.</p>
            )}
            <div className="global-hook-test-controls">
              <HookTestWebsiteField
                value={testURL}
                disabled={testing}
                onChange={(value) => {
                  setTestURL(value);
                  setDraft({ ...draft, testUrl: value.trim() || undefined });
                }}
              />
              <Button
                disabled={
                  busy ||
                  testing ||
                  !testURL.trim() ||
                  (![draft.before, draft.after, draft.css].some((source) =>
                    source.trim(),
                  ) && !draft.actions?.some((action) => action.source.trim()))
                }
                onClick={() => {
                  void test();
                }}
              >
                Run test
              </Button>
              {testState && testState.status !== 'stopped' && (
                <Button
                  variant="soft"
                  disabled={testing}
                  onClick={() => {
                    void test(true);
                  }}
                >
                  Stop
                </Button>
              )}
            </div>
            {testState && (
              <section
                className="global-hook-test-output"
                aria-label="Test output"
              >
                <strong role="status">
                  {
                    {
                      loading: 'Loading test website…',
                      waiting: 'Waiting for matching page',
                      running: 'Running test…',
                      success: 'Test completed',
                      error: 'Test failed',
                      stopped: 'Test stopped',
                    }[testState.status]
                  }
                </strong>
                <div role="log" aria-label="Test logs" aria-live="polite">
                  {testState.logs.map((entry, index) => (
                    <p key={`${entry.time}-${index}`} data-level={entry.level}>
                      {entry.message}
                    </p>
                  ))}
                </div>
              </section>
            )}
          </FormDisclosure>
        </div>
      )}
      <EditorWindowFooter status={dirty ? 'Unsaved changes' : 'Saved'}>
        <Button
          variant="soft"
          color="gray"
          disabled={busy}
          onClick={() => window.electron.siteDeveloper.command('close')}
        >
          Close
        </Button>
        <Button
          variant="soft"
          color="gray"
          disabled={
            busy ||
            !draft ||
            dirty ||
            (![draft.before, draft.after, draft.css].some((source) =>
              source.trim(),
            ) && !draft.actions?.some((action) => action.source.trim()))
          }
          title={dirty ? 'Save changes before publishing' : undefined}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(OPEN_HOOK_MARKETPLACE, {
                detail: {
                  mode: 'publish',
                  hookId: `global:${draft!.id}`,
                  allGroups: true,
                },
              }),
            )
          }
        >
          {draft?.publication ? 'Republish' : 'Publish'}
        </Button>
        {draft?.installed && (
          <Button
            variant="soft"
            disabled={busy || dirty}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent(OPEN_HOOK_MARKETPLACE, {
                  detail: {
                    mode: 'updates',
                    hookId: `global:${draft.id}`,
                    allGroups: true,
                  },
                }),
              )
            }
          >
            Check for updates
          </Button>
        )}
        <Button
          disabled={
            busy ||
            !draft ||
            !dirty ||
            !draft.name.trim() ||
            !draft.path.startsWith('/') ||
            [draft.before, draft.after, draft.css].some(
              (source) => source.length > 20000,
            )
          }
          onClick={() => {
            void save();
          }}
        >
          Save hook
        </Button>
      </EditorWindowFooter>
    </main>
  );
}

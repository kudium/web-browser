import { StorageRecoveryAction } from '../../UI/StorageRecoveryAction';
/* eslint jsx-a11y/label-has-associated-control: ["error", { "assert": "htmlFor" }] */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Callout, Switch } from '@radix-ui/themes';
import { AISkillsSettings } from './AISkillsSettings';
import { ExternalAISettings } from './ExternalAISettings';
import {
  AI_PROVIDERS,
  AI_MODEL_EXAMPLES,
  providerFor,
} from '../../../browser/aiProviders';
import { AI_DEFAULTS, AISettings } from '../../../browser/ai';
import { useAIPagePreference } from '../../../utils/useAIPagePreference';

const providers = AI_PROVIDERS;
const errorText = (reason: Error) =>
  reason.message.replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  );

export function AISettingsPage({ children }: { children?: ReactNode }) {
  const [showStats, setShowStats] = useAIPagePreference('showStats', true);
  const [tab, setTab] = useState<'model' | 'external' | 'skills'>('model');
  const [saved, setSaved] = useState<AISettings>({
    ...AI_DEFAULTS,
    hasKey: false,
    remembered: false,
  });
  const [provider, setProvider] = useState('openai');
  const [endpoint, setEndpoint] = useState(AI_DEFAULTS.endpoint);
  const [model, setModel] = useState(AI_DEFAULTS.model);
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [customModel, setCustomModel] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState('');
  const [modelError, setModelError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setError('');
    window.electron.ai
      .settings()
      .then((value) => {
        if (alive) {
          setSaved(value);
          setEndpoint(value.endpoint);
          setModel(value.model);
          setProvider(providerFor(value.endpoint));
          setRemember(!value.hasKey || value.remembered);
          setReady(true);
        }
        return undefined;
      })
      .catch((reason) => {
        if (alive) setError(errorText(reason));
      });
    return () => {
      alive = false;
    };
  }, [retry]);
  const save = async (clear = false) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await window.electron.ai.settings(
        clear
          ? { endpoint: saved.endpoint, model: saved.model, clear: true }
          : { endpoint, model, key, remember }
      );
      setSaved(value);
      setKey('');
      setRemember(!value.hasKey || value.remembered);
      setNotice(clear ? 'API key removed.' : 'Saved.');
    } catch (reason) {
      setError(errorText(reason as Error));
    } finally {
      setBusy(false);
    }
  };
  const loadModels = async () => {
    setLoadingModels(true);
    setModelError('');
    try {
      const available = await window.electron.ai.models({ endpoint, key });
      setModels(available);
      if (!available.length)
        setModelError('No models were returned. Enter a model ID manually.');
    } catch (reason) {
      setModelError(errorText(reason as Error));
    } finally {
      setLoadingModels(false);
    }
  };
  return (
    <div className="ai-preferences">
      <div
        className="ai-settings-tabs"
        role="tablist"
        tabIndex={-1}
        aria-label="AI settings"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
            return;
          event.preventDefault();
          const tabs = ['model', 'external', 'skills'] as const;
          let next =
            tabs[
              (tabs.indexOf(tab) + (event.key === 'ArrowLeft' ? 2 : 1)) %
                tabs.length
            ];
          if (event.key === 'Home') next = 'model';
          if (event.key === 'End') next = 'skills';
          setTab(next);
          document.getElementById(`ai-${next}-tab`)?.focus();
        }}
      >
        <button
          type="button"
          role="tab"
          id="ai-model-tab"
          aria-controls="ai-model-panel"
          aria-selected={tab === 'model'}
          tabIndex={tab === 'model' ? 0 : -1}
          onClick={() => setTab('model')}
        >
          Model settings
        </button>
        <button
          type="button"
          role="tab"
          id="ai-external-tab"
          aria-controls="ai-external-panel"
          aria-selected={tab === 'external'}
          tabIndex={tab === 'external' ? 0 : -1}
          onClick={() => setTab('external')}
        >
          External AI
        </button>
        <button
          type="button"
          role="tab"
          id="ai-skills-tab"
          aria-controls="ai-skills-panel"
          aria-selected={tab === 'skills'}
          tabIndex={tab === 'skills' ? 0 : -1}
          onClick={() => setTab('skills')}
        >
          Skills
        </button>
      </div>
      <div
        role="tabpanel"
        id="ai-skills-panel"
        aria-labelledby="ai-skills-tab"
        hidden={tab !== 'skills'}
      >
        {tab === 'skills' && <AISkillsSettings />}
      </div>
      <div
        role="tabpanel"
        id="ai-external-panel"
        aria-labelledby="ai-external-tab"
        hidden={tab !== 'external'}
      >
        <ExternalAISettings />
      </div>
      <div
        role="tabpanel"
        id="ai-model-panel"
        aria-labelledby="ai-model-tab"
        hidden={tab !== 'model'}
      >
        {error && (
          <Callout.Root color="red" role="alert">
            <Callout.Text>
              {error}
              <StorageRecoveryAction message={error} />
              {!ready && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry loading settings
                </Button>
              )}
            </Callout.Text>
          </Callout.Root>
        )}
        {notice && (
          <Callout.Root color="green" role="status">
            <Callout.Text>{notice}</Callout.Text>
          </Callout.Root>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <fieldset
            disabled={!ready || busy || loadingModels}
            className="ai-preferences-fields"
          >
            <div className="preference-card">
              <div className="preference-row">
                <div>
                  <label htmlFor="ai-provider">Provider</label>
                </div>
                <select
                  id="ai-provider"
                  value={provider}
                  onChange={(event) => {
                    const selected = providers.find(
                      (item) => item.id === event.target.value
                    )!;
                    setProvider(selected.id);
                    setEndpoint(selected.endpoint);
                    setModel(selected.model);
                    setKey('');
                    setModels([]);
                    setModelError('');
                    setCustomModel(selected.id === 'custom');
                    setNotice('');
                  }}
                >
                  {providers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="preference-row">
                <label htmlFor="ai-endpoint">API endpoint</label>
                <input
                  id="ai-endpoint"
                  required
                  type="url"
                  value={endpoint}
                  onChange={(event) => {
                    setEndpoint(event.target.value);
                    setProvider('custom');
                    setModels([]);
                    setModelError('');
                  }}
                />
              </div>
              <div className="preference-row">
                <div>
                  <label htmlFor="ai-key">API key</label>
                </div>
                <input
                  id="ai-key"
                  type="password"
                  autoComplete="off"
                  value={key}
                  placeholder={
                    saved.hasKey
                      ? '••••••••  Key configured'
                      : 'Enter your API key'
                  }
                  onChange={(event) => setKey(event.target.value)}
                />
              </div>
              <div className="preference-row ai-model-row">
                <div>
                  <label htmlFor="ai-model">Model</label>
                </div>
                <div className="ai-model-controls">
                  <select
                    id="ai-model"
                    value={customModel ? '__custom__' : model}
                    onChange={(event) => {
                      setCustomModel(event.target.value === '__custom__');
                      if (event.target.value !== '__custom__')
                        setModel(event.target.value);
                    }}
                  >
                    {[
                      ...new Set([
                        model,
                        ...(AI_MODEL_EXAMPLES[provider] || []),
                        ...models,
                      ]),
                    ]
                      .filter(Boolean)
                      .map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    <option value="__custom__">Enter model ID manually…</option>
                  </select>
                  {customModel && (
                    <input
                      aria-label="Custom model ID"
                      value={model}
                      required
                      maxLength={120}
                      placeholder="Provider’s exact model ID"
                      onChange={(event) => setModel(event.target.value)}
                    />
                  )}
                  <Button
                    type="button"
                    variant="soft"
                    size="1"
                    onClick={loadModels}
                    disabled={
                      !key.trim() &&
                      (!saved.hasKey ||
                        endpoint.replace(/\/$/, '') !== saved.endpoint)
                    }
                  >
                    Refresh models
                  </Button>
                  {modelError && (
                    <p className="ai-model-help" role="status">
                      {modelError}
                    </p>
                  )}
                </div>
              </div>
              <div className="preference-row">
                <div>
                  <label htmlFor="ai-remember">Remember API key</label>
                </div>
                <Switch
                  id="ai-remember"
                  checked={remember}
                  onCheckedChange={setRemember}
                />
              </div>
            </div>
            <div className="ai-preferences-actions">
              <Button
                type="submit"
                disabled={
                  !model.trim() ||
                  ((!saved.hasKey ||
                    endpoint.replace(/\/$/, '') !== saved.endpoint) &&
                    !key.trim())
                }
              >
                {busy ? 'Saving…' : 'Save AI settings'}
              </Button>
              {saved.hasKey && (
                <Button
                  type="button"
                  variant="soft"
                  color="red"
                  onClick={() => save(true)}
                >
                  Remove API key
                </Button>
              )}
            </div>
          </fieldset>
          {loadingModels && (
            <p role="status" className="ai-model-help">
              Loading models…
            </p>
          )}
        </form>
      </div>
      <div className="preference-card ai-display-preferences">
        <div className="preference-row">
          <div>
            <strong id="ai-show-stats-label">Show stats</strong>
            <p>Usage and actions in chat.</p>
          </div>
          <Switch
            id="ai-show-stats"
            aria-labelledby="ai-show-stats-label"
            checked={showStats}
            onCheckedChange={setShowStats}
          />
        </div>
        {children}
      </div>
    </div>
  );
}

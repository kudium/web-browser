import { useCallback, useEffect, useId, useState } from 'react';
import { Button, Callout, Text } from '@radix-ui/themes';
import type {
  LocalModelProgress,
  LocalModelStatus,
} from '../../../main/aiLocalModels';
import type { LocalModelId } from '../../../browser/aiModelTiers';

/**
 * Preferences → Assistant → Provider → Ollama setup (spec 4.10.1). Every step
 * is a click, the command that will run is shown first, and the Gemma licence
 * is acknowledged once before a pull. Nothing leaves the machine.
 */
export function LocalModelInstaller({
  disabled,
  onInstalled,
}: {
  disabled?: boolean;
  onInstalled: (installed: { endpoint: string; model: string }) => void;
}) {
  const [status, setStatus] = useState<LocalModelStatus | undefined>();
  const [choice, setChoice] = useState<LocalModelId>('gemma3n');
  const [progress, setProgress] = useState<LocalModelProgress | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const guideId = useId();
  const refresh = useCallback(async () => {
    try {
      setStatus((await window.electron.ai.localModels({ action: 'status' })) as LocalModelStatus);
      setError('');
    } catch (reason) {
      setError(String((reason as Error).message || reason));
    }
  }, []);
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);
  useEffect(
    () =>
      // Older preloads (and renderer tests) may not expose progress events.
      window.electron.ai.onLocalModelProgress?.((value) => {
        setProgress(value);
        if (value.done) refresh();
      }),
    [refresh]
  );
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await refresh();
    } catch (reason) {
      setError(String((reason as Error).message || reason));
    } finally {
      setBusy(false);
    }
  };
  const selected = status?.choices.find((item) => item.id === choice);
  const acknowledged = !!status?.licenceAcknowledged[choice];
  const installed = status?.models.some((name) => name.split(':')[0] === choice);
  const percent =
    progress?.total && progress.completed !== undefined
      ? Math.round((progress.completed / progress.total) * 100)
      : undefined;
  return (
    <section className="local-model-card" aria-label="Ollama setup">
      <div className="local-model-toggle">
        <Button
          type="button"
          variant="ghost"
          color="gray"
          size="1"
          disabled={disabled}
          aria-expanded={open}
          aria-controls={guideId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide Ollama setup' : 'Optional: Set up Ollama'}
        </Button>
      </div>
      {open && (
        <div id={guideId} className="local-model-steps">
          <p className="preference-note">
            Install Ollama, choose a model, then download it to this Mac.
            Local models run on device without an API key.
          </p>
          {error && (
            <Callout.Root color="red" role="alert">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
          <div className="preference-row">
            <div>
              <Text as="div" size="2">
                1. Ollama{' '}
                {status
                  ? status.installed
                    ? `installed${status.version ? ` (${status.version})` : ''}${status.running ? ', running' : ', not running'}`
                    : 'not installed'
                  : 'checking…'}
              </Text>
              {status && !status.installed && (
                <Text as="div" size="1" color="gray">
                  {status.brew ? (
                    <>
                      Runs <code>brew install ollama</code> in the background, or opens the download page.
                    </>
                  ) : (
                    'Opens the Ollama download page; install it, then come back.'
                  )}
                </Text>
              )}
            </div>
            {status && !status.installed && (
              <span className="local-model-actions">
                {status.brew && status.platform === 'darwin' && (
                  <Button type="button" disabled={disabled || busy} onClick={() => act(() => window.electron.ai.localModels({ action: 'install', method: 'brew' }))}>
                    Install with Homebrew
                  </Button>
                )}
                <Button type="button" variant="soft" disabled={disabled || busy} onClick={() => act(() => window.electron.ai.localModels({ action: 'install', method: 'download' }))}>
                  Open download page
                </Button>
              </span>
            )}
            {status?.installed && !status.running && (
              <Button type="button" disabled={disabled || busy} onClick={() => act(() => window.electron.ai.localModels({ action: 'start' }))}>
                Start Ollama
              </Button>
            )}
          </div>
          <div className="preference-row">
            <div>
              <label htmlFor="local-model-choice">
                <Text as="span" size="2">2. Model</Text>
              </label>
            </div>
            <select
              id="local-model-choice"
              value={choice}
              disabled={disabled || busy}
              onChange={(event) => setChoice(event.target.value as LocalModelId)}
            >
              {(status?.choices ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          {selected && !acknowledged && (
            <Callout.Root color="gray" role="note">
              <Callout.Text>
                {selected.name} is released under the{' '}
                <a href={selected.licence.url} target="_blank" rel="noreferrer">
                  {selected.licence.name}
                </a>
                {'summary' in selected.licence ? `. ${selected.licence.summary}` : '.'}{' '}
                <Button type="button" variant="ghost" disabled={disabled || busy} onClick={() => act(() => window.electron.ai.localModels({ action: 'acknowledge-licence', model: choice }))}>
                  I have read the licence
                </Button>
              </Callout.Text>
            </Callout.Root>
          )}
          <div className="preference-row">
            <div>
              <Text as="div" size="2">
                3. {installed ? `${choice} is installed` : `Pull ${choice}`}
              </Text>
              {progress && progress.model === choice && !progress.done && (
                <>
                  <Text as="div" size="1" color="gray">
                    {progress.status}
                    {percent !== undefined ? ` ${percent}%` : ''}
                  </Text>
                  {percent !== undefined && (
                    <div className="local-model-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  )}
                </>
              )}
            </div>
            <Button
              type="button"
              disabled={disabled || busy || !status?.running || !acknowledged}
              onClick={() =>
                act(async () => {
                  const result = (await window.electron.ai.localModels({ action: 'pull', model: choice })) as {
                    endpoint: string;
                    model: string;
                  };
                  onInstalled(result);
                })
              }
            >
              {installed ? 'Use this model' : 'Pull and use'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

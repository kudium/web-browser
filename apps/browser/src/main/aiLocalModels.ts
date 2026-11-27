import { shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { LOCAL_MODEL_CHOICES, LocalModelId } from '../browser/aiModelTiers';

/**
 * One-click local model install (spec 4.10.1). Nothing runs without a click
 * in Preferences; every command is shown before it runs; the Gemma licence is
 * shown once. Ollama's local server is the only endpoint touched.
 */
export const OLLAMA_API = 'http://127.0.0.1:11434';
export const OLLAMA_ENDPOINT = 'http://localhost:11434/v1';
const EXTRA_PATH = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];

export interface LocalModelStatus {
  installed: boolean;
  version?: string;
  running: boolean;
  models: string[];
  brew: boolean;
  licenceAcknowledged: Record<string, boolean>;
  choices: typeof LOCAL_MODEL_CHOICES;
  platform: NodeJS.Platform;
}
export interface LocalModelProgress {
  model: string;
  status: string;
  completed?: number;
  total?: number;
  done?: boolean;
  error?: string;
}
export type LocalModelRequest =
  | { action: 'status' }
  | { action: 'install'; method: 'brew' | 'download' }
  | { action: 'start' }
  | { action: 'acknowledge-licence'; model: LocalModelId }
  | { action: 'pull'; model: LocalModelId }
  | { action: 'warm'; model: string };

const withPath = () => ({
  ...process.env,
  PATH: [...EXTRA_PATH, process.env.PATH || ''].join(path.delimiter),
});

function run(command: string, args: string[], timeoutMs = 5000): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { env: withPath(), timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout || ''}${stderr || ''}`.trim() });
    });
  });
}

/** Parse one NDJSON line of `ollama pull` progress. */
export function parseOllamaProgress(model: string, line: string): LocalModelProgress | undefined {
  if (!line.trim()) return undefined;
  try {
    const value = JSON.parse(line);
    if (typeof value.error === 'string') return { model, status: 'error', error: value.error };
    return {
      model,
      status: String(value.status || ''),
      ...(typeof value.completed === 'number' ? { completed: value.completed } : {}),
      ...(typeof value.total === 'number' ? { total: value.total } : {}),
      ...(value.status === 'success' ? { done: true } : {}),
    };
  } catch {
    return undefined;
  }
}

export class LocalModels {
  private acknowledged: Record<string, boolean> = {};

  constructor(
    private readonly options: {
      stateFile: string;
      fetch?: typeof fetch;
      send?: (progress: LocalModelProgress) => void;
    }
  ) {
    try {
      const saved = JSON.parse(fs.readFileSync(options.stateFile, 'utf8'));
      if (saved && typeof saved === 'object') this.acknowledged = saved.licenceAcknowledged || {};
    } catch {
      /* First run. */
    }
  }

  private persist() {
    fs.mkdirSync(path.dirname(this.options.stateFile), { recursive: true });
    fs.writeFileSync(
      this.options.stateFile,
      JSON.stringify({ licenceAcknowledged: this.acknowledged }),
      { mode: 0o600 }
    );
  }

  private get fetcher() {
    return this.options.fetch ?? fetch;
  }

  async status(): Promise<LocalModelStatus> {
    const [version, brew] = await Promise.all([run('ollama', ['--version']), run('brew', ['--version'])]);
    let running = false;
    let models: string[] = [];
    try {
      const response = await this.fetcher(`${OLLAMA_API}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        running = true;
        const data = (await response.json()) as { models?: { name?: string }[] };
        models = (data.models ?? []).map((item) => String(item.name || '')).filter(Boolean);
      }
    } catch {
      running = false;
    }
    return {
      installed: version.ok || running,
      ...(version.ok ? { version: version.output.replace(/^ollama version\s*/i, '') } : {}),
      running,
      models,
      brew: brew.ok,
      licenceAcknowledged: { ...this.acknowledged },
      choices: LOCAL_MODEL_CHOICES,
      platform: process.platform,
    };
  }

  /** Shown before anything runs; the UI displays it verbatim. */
  static installCommand(method: 'brew' | 'download') {
    return method === 'brew' ? 'brew install ollama' : 'open https://ollama.com/download';
  }

  async install(method: 'brew' | 'download'): Promise<{ started: boolean; command: string }> {
    const command = LocalModels.installCommand(method);
    if (method === 'download') {
      await shell.openExternal('https://ollama.com/download');
      return { started: true, command };
    }
    if (process.platform !== 'darwin') throw new Error('Homebrew install is available on macOS only.');
    const brew = await run('brew', ['--version']);
    if (!brew.ok) throw new Error('Homebrew is not installed. Use the download page instead.');
    const child = spawn('brew', ['install', 'ollama'], { env: withPath(), stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (data) => this.options.send?.({ model: 'ollama', status: String(data).trim().slice(0, 200) }));
    child.stderr?.on('data', (data) => this.options.send?.({ model: 'ollama', status: String(data).trim().slice(0, 200) }));
    child.on('exit', (code) =>
      this.options.send?.(
        code === 0
          ? { model: 'ollama', status: 'installed', done: true }
          : { model: 'ollama', status: 'error', error: `brew install ollama exited with ${code}.` }
      )
    );
    return { started: true, command };
  }

  async start(): Promise<{ started: boolean }> {
    const current = await this.status();
    if (current.running) return { started: false };
    if (process.platform === 'darwin' && fs.existsSync('/Applications/Ollama.app')) {
      await run('open', ['-a', 'Ollama'], 10000);
    } else {
      const child = spawn('ollama', ['serve'], { env: withPath(), detached: true, stdio: 'ignore' });
      child.unref();
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if ((await this.status()).running) return { started: true };
    }
    throw new Error('Ollama did not start. Open the Ollama app, then try again.');
  }

  acknowledgeLicence(model: LocalModelId) {
    const choice = LOCAL_MODEL_CHOICES.find((item) => item.id === model);
    if (!choice) throw new Error('Choose a supported local model.');
    this.acknowledged[model] = true;
    this.persist();
    return { acknowledged: true };
  }

  async pull(model: LocalModelId, signal?: AbortSignal): Promise<{ model: string; endpoint: string }> {
    const choice = LOCAL_MODEL_CHOICES.find((item) => item.id === model);
    if (!choice) throw new Error('Choose a supported local model.');
    if (!this.acknowledged[model])
      throw new Error(`Read and acknowledge the ${choice.licence.name} before pulling ${choice.name}.`);
    const response = await this.fetcher(`${OLLAMA_API}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: choice.id, stream: true }),
      signal,
    });
    if (!response.ok || !response.body) throw new Error(`Ollama refused the pull (${response.status}). Start Ollama and retry.`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let failure: string | undefined;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split('\n');
      buffered = lines.pop() || '';
      lines.forEach((line) => {
        const progress = parseOllamaProgress(choice.id, line);
        if (!progress) return;
        if (progress.error) failure = progress.error;
        this.options.send?.(progress);
      });
    }
    if (failure) throw new Error(failure);
    this.options.send?.({ model: choice.id, status: 'success', done: true });
    return { model: choice.id, endpoint: OLLAMA_ENDPOINT };
  }

  /** Keep the control-tier model loaded so the first token of a run excludes model load. */
  async warm(model: string): Promise<void> {
    if (!model) return;
    await this.fetcher(`${OLLAMA_API}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: '30m' }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => undefined);
  }

  handle(request: LocalModelRequest, signal?: AbortSignal) {
    switch (request.action) {
      case 'status':
        return this.status();
      case 'install':
        return this.install(request.method);
      case 'start':
        return this.start();
      case 'acknowledge-licence':
        return this.acknowledgeLicence(request.model);
      case 'pull':
        return this.pull(request.model, signal);
      case 'warm':
        return this.warm(request.model).then(() => ({ warmed: true }));
      default:
        throw new Error('Choose a local model action.');
    }
  }
}

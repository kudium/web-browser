import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import readline from 'readline';

/**
 * One helper process per browser (spec 4.14) instead of one per turn. It
 * keeps a LanguageModelSession per conversation, so a step pays a short
 * incremental prefill, not a process spawn plus a full transcript rebuild.
 */
export interface AppleStepFrame {
  instructions: string;
  goal: string;
  state: string;
  observation: string;
  choices: { action: string; description: string }[];
}
export interface AppleStep {
  action: string;
  target?: string;
  text?: string;
  done?: boolean;
}
export class AppleDaemonError extends Error {
  constructor(
    message: string,
    readonly code: 'context_limit' | 'inference_failed' | 'invalid' | 'unavailable'
  ) {
    super(message);
    this.name = 'AppleDaemonError';
  }
}

export function appleHelperPath() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64')
    throw new AppleDaemonError(
      'Apple local AI requires an Apple Silicon Mac with macOS 26 or later.',
      'unavailable'
    );
  const relative = 'assets/native/kudiumbrowser-apple-ai';
  const candidates = [
    path.join(process.resourcesPath, relative),
    path.join(app.getAppPath(), relative),
    ...(!app.isPackaged ? [path.resolve(app.getAppPath(), '../../', relative)] : []),
  ];
  const helper = candidates.find((candidate) => fs.existsSync(candidate));
  if (!helper)
    throw new AppleDaemonError(
      'Apple local AI helper is missing. Rebuild or update Kudium Browser.',
      'unavailable'
    );
  return helper;
}

interface Pending {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class AppleAIDaemon {
  private child: ChildProcess | undefined;

  private ready: Promise<void> | undefined;

  private pending = new Map<string, Pending>();

  private counter = 0;

  constructor(
    private readonly options: {
      spawnHelper?: () => ChildProcess;
      stepTimeoutMs?: number;
    } = {}
  ) {}

  private start(): Promise<void> {
    if (this.ready && this.child && this.child.exitCode === null) return this.ready;
    const child = this.options.spawnHelper
      ? this.options.spawnHelper()
      : spawn(appleHelperPath(), ['--serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.stderr?.resume(); // Never log conversation contents.
    const lines = readline.createInterface({ input: child.stdout! });
    this.ready = new Promise<void>((resolve, reject) => {
      let started = false;
      lines.on('line', (line) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line);
        } catch {
          return;
        }
        if (!started) {
          started = true;
          if (message.ready === true) resolve();
          else reject(new AppleDaemonError(String(message.error || 'Apple local AI is unavailable.'), 'unavailable'));
          return;
        }
        const id = String(message.id || '');
        const waiting = this.pending.get(id);
        if (!waiting) return;
        if (typeof message.error === 'string')
          waiting.reject(
            new AppleDaemonError(
              message.error,
              message.code === 'context_limit' || message.code === 'invalid'
                ? message.code
                : 'inference_failed'
            )
          );
        else waiting.resolve(message);
      });
      const gone = () => {
        if (!started) reject(new AppleDaemonError('Unable to start Apple local AI. macOS 26 or later is required.', 'unavailable'));
        this.pending.forEach((waiting) => {
          clearTimeout(waiting.timer);
          waiting.reject(new AppleDaemonError('Apple local AI helper exited.', 'inference_failed'));
        });
        this.pending.clear();
        if (this.child === child) {
          this.child = undefined;
          this.ready = undefined;
        }
      };
      child.once('error', gone);
      child.once('exit', gone);
    });
    return this.ready;
  }

  private async request(
    body: Record<string, unknown>,
    signal?: AbortSignal,
    timeoutMs = this.options.stepTimeoutMs ?? 20000
  ): Promise<Record<string, unknown>> {
    signal?.throwIfAborted();
    await this.start();
    const child = this.child!;
    this.counter += 1;
    const id = `r${this.counter}`;
    return new Promise((resolve, reject) => {
      // One settle path for replies, timeouts, aborts and helper exits.
      let settled = false;
      const finish = (error?: Error, value?: Record<string, unknown>) => {
        if (settled) return;
        settled = true;
        this.pending.delete(id);
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(value!);
      };
      const abort = () =>
        finish(signal?.reason instanceof Error ? signal.reason : new Error('Apple AI request cancelled.'));
      const timer = setTimeout(
        () => finish(new AppleDaemonError('Apple AI step timed out.', 'inference_failed')),
        timeoutMs
      );
      this.pending.set(id, {
        resolve: (value) => finish(undefined, value),
        reject: (error) => finish(error),
        timer,
      });
      signal?.addEventListener('abort', abort, { once: true });
      child.stdin!.write(`${JSON.stringify({ id, ...body })}\n`, (error) => {
        if (error) finish(new AppleDaemonError('Apple local AI helper is not accepting requests.', 'inference_failed'));
      });
    });
  }

  check(signal?: AbortSignal) {
    return this.request({ type: 'check' }, signal, 10000);
  }

  prewarm(conversation: string, instructions: string, signal?: AbortSignal) {
    return this.request({ type: 'prewarm', conversation, instructions }, signal, 30000);
  }

  async step(conversation: string, frame: AppleStepFrame, signal?: AbortSignal): Promise<AppleStep> {
    const reply = await this.request({ type: 'step', conversation, frame }, signal);
    const step = reply.step as Record<string, unknown> | undefined;
    if (!step || typeof step.action !== 'string')
      throw new AppleDaemonError('Apple AI returned no step.', 'inference_failed');
    if (!frame.choices.some((choice) => choice.action === step.action))
      throw new AppleDaemonError('Apple AI chose an action outside the frame.', 'invalid');
    return {
      action: step.action,
      ...(typeof step.target === 'string' ? { target: step.target } : {}),
      ...(typeof step.text === 'string' ? { text: step.text } : {}),
      ...(typeof step.done === 'boolean' ? { done: step.done } : {}),
    };
  }

  end(conversation: string) {
    return this.request({ type: 'end', conversation }, undefined, 5000).catch(() => undefined);
  }

  dispose() {
    const { child } = this;
    this.child = undefined;
    this.ready = undefined;
    child?.kill();
  }
}

let shared: AppleAIDaemon | undefined;
export function appleDaemon() {
  shared ||= new AppleAIDaemon();
  return shared;
}

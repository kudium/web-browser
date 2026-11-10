import { randomUUID } from 'crypto';
import type { AIQueueState } from '../browser/aiComposer';

/** Holds follow-ups until the current controller releases the chat. */
export class AIMessageQueue<T> {
  private pending: Array<{ id: string; prompt: string; input: T }> = [];
  private paused = false;
  private disposed = false;

  constructor(
    private canStart: () => boolean,
    private start: (input: T) => void,
    private changed: (state: AIQueueState) => void,
    private failed: (error: Error) => void
  ) {}

  snapshot(): AIQueueState {
    return {
      messages: this.pending.map(({ id, prompt }) => ({ id, prompt })),
      paused: this.paused,
    };
  }

  get hasPending() {
    return this.pending.length > 0;
  }

  add(prompt: string, input: T) {
    if (this.disposed) throw new Error('The AI chat has closed.');
    if (this.pending.length >= 20)
      throw new Error('Up to 20 messages can be queued.');
    this.pending.push({ id: randomUUID(), prompt, input });
    this.changed(this.snapshot());
    this.pump();
  }

  pause() {
    this.paused = this.hasPending;
    if (this.hasPending) this.changed(this.snapshot());
  }

  resume() {
    this.paused = false;
    this.changed(this.snapshot());
    this.pump();
  }

  remove(id: string) {
    this.pending = this.pending.filter((message) => message.id !== id);
    if (!this.hasPending) this.paused = false;
    this.changed(this.snapshot());
  }

  pump() {
    if (this.disposed || this.paused || !this.hasPending || !this.canStart())
      return;
    const next = this.pending.shift()!;
    try {
      this.start(next.input);
    } catch (reason) {
      this.pending.unshift(next);
      this.paused = true;
      this.failed(reason instanceof Error ? reason : new Error(String(reason)));
    }
    this.changed(this.snapshot());
  }

  dispose() {
    this.disposed = true;
    this.pending = [];
  }
}

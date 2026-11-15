import { createHash } from 'crypto';
import type { SyncedLogin } from './passwords';

/** Reads only an already-unlocked vault; background work never prompts. */
export class PasswordSyncScheduler<T = SyncedLogin> {
  private busy = false;
  private digest?: string;
  private generation = 0;
  private revision?: number;
  private failures = 0;
  private retryAt = 0;

  reset() {
    this.generation += 1;
    this.digest = undefined;
    this.revision = undefined;
    this.failures = 0;
    this.retryAt = 0;
  }

  async tick(options: {
    read: () => T[] | undefined;
    upload: (items: T[], current: () => boolean) => Promise<void>;
    current: () => boolean;
    revision?: number;
  }) {
    if (this.busy || Date.now() < this.retryAt || !options.current()) return;
    if (options.revision !== undefined && options.revision === this.revision)
      return;
    const items = options.read();
    if (!items) return;
    const digest = createHash('sha256')
      .update(JSON.stringify(items))
      .digest('hex');
    if (digest === this.digest) {
      this.revision = options.revision;
      return;
    }
    const generation = this.generation;
    const current = () => generation === this.generation && options.current();
    this.busy = true;
    try {
      await options.upload(items, current);
      if (current()) {
        this.digest = digest;
        this.revision = options.revision;
        this.failures = 0;
        this.retryAt = 0;
      }
    } catch (error) {
      if (current()) {
        this.failures += 1;
        this.retryAt =
          Date.now() +
          Math.min(60000 * 2 ** Math.min(this.failures - 1, 4), 900000);
      }
      throw error;
    } finally {
      this.busy = false;
    }
  }
}

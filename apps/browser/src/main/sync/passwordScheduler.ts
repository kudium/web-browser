import { createHash } from 'crypto';
import type { SyncedLogin } from './passwords';

/** Reads only an already-unlocked vault; background work never prompts. */
export class PasswordSyncScheduler {
  private busy = false;
  private digest?: string;
  private generation = 0;

  reset() {
    this.generation += 1;
    this.digest = undefined;
  }

  async tick(options: {
    read: () => SyncedLogin[] | undefined;
    upload: (items: SyncedLogin[], current: () => boolean) => Promise<void>;
    current: () => boolean;
  }) {
    if (this.busy || !options.current()) return;
    const items = options.read();
    if (!items) return;
    const digest = createHash('sha256')
      .update(JSON.stringify(items))
      .digest('hex');
    if (digest === this.digest) return;
    const generation = this.generation;
    const current = () => generation === this.generation && options.current();
    this.busy = true;
    try {
      await options.upload(items, current);
      if (current()) this.digest = digest;
    } finally {
      this.busy = false;
    }
  }
}

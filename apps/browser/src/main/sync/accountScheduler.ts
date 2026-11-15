/** Change-driven uploads with a slower remote-discovery fallback. */
export class AccountSyncScheduler {
  private lastAttempt = 0;
  private dirtyAt?: number;
  private revision = 0;
  private firstDirtyAt?: number;

  changed(now = Date.now()) {
    this.revision += 1;
    this.firstDirtyAt ??= now;
    this.dirtyAt = Math.min(now + 2000, this.firstDirtyAt + 10000);
  }

  wake(now = Date.now()) {
    // Repeated focus events should not turn into repeated network requests.
    if (now - this.lastAttempt >= 60000) this.dirtyAt = now;
  }

  due(now: number, idle: boolean, retryAt = 0) {
    if (now < retryAt) return false;
    return (
      (this.dirtyAt !== undefined && now >= this.dirtyAt) ||
      now - this.lastAttempt >= (idle ? 600000 : 120000)
    );
  }

  start(now = Date.now()) {
    this.lastAttempt = now;
    return this.revision;
  }

  finished(revision: number, success: boolean) {
    if (success && revision === this.revision) {
      this.dirtyAt = undefined;
      this.firstDirtyAt = undefined;
    }
  }
}

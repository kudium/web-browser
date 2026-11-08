/** Bounded LRU cache; invalidated in-flight work cannot repopulate it. */
export class ThumbnailCache {
  private values = new Map<string, string>();

  private pending = new Map<string, Promise<string | null>>();

  private capacity: number;

  private active = 0;

  private waiting: Array<() => void> = [];

  private async generate(
    load: () => Promise<string | null>,
    current: () => boolean
  ) {
    while (this.active >= 4) {
      if (!current() || this.waiting.length >= this.capacity) return null;
      // eslint-disable-next-line no-await-in-loop -- bounded decoder slots
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    }
    if (!current()) return null;
    this.active += 1;
    try {
      return await load();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }

  constructor(capacity = 128) {
    this.capacity = capacity;
  }

  get(id: string, load: () => Promise<string | null>): Promise<string | null> {
    const value = this.values.get(id);
    if (value !== undefined) {
      this.values.delete(id);
      this.values.set(id, value);
      return Promise.resolve(value);
    }
    const pending = this.pending.get(id);
    if (pending) return pending;
    if (this.pending.size >= this.capacity) return Promise.resolve(null);
    const request: Promise<string | null> = Promise.resolve()
      .then(() => this.generate(load, () => this.pending.get(id) === request))
      .catch(() => null)
      .then((data) => {
        if (data !== null && this.pending.get(id) === request) {
          this.values.set(id, data);
          if (this.values.size > this.capacity)
            this.values.delete(this.values.keys().next().value!);
        }
        return data;
      })
      .finally(() => {
        if (this.pending.get(id) === request) this.pending.delete(id);
      });
    this.pending.set(id, request);
    return request;
  }

  delete(id: string) {
    this.values.delete(id);
    this.pending.delete(id);
  }

  clear() {
    this.values.clear();
    this.pending.clear();
    this.waiting.splice(0).forEach((resume) => resume());
  }
}

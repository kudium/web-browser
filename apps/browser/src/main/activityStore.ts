/* The constructor stores injected persistence and clock services. */
/* eslint-disable no-useless-constructor, no-empty-function */
import { randomUUID } from 'crypto';
import { validateActivity, activityLink } from '../browser/activity';
import type { BrowserActivity, ActivityInput } from '../browser/activity';
/** Bounded, transactional timeline; source and scope are assigned by the host. */
export class ActivityStore {
  private entries: BrowserActivity[] | undefined;

  constructor(
    private persistence: {
      created?: (entry: BrowserActivity) => void;
      load: () => BrowserActivity[];
      save: (entries: BrowserActivity[]) => void;
    },
    private now = Date.now
  ) {}

  private all() {
    if (!this.entries) this.entries = this.persistence.load();
    return this.entries;
  }

  list() {
    return this.all().map((entry) => ({ ...entry }));
  }

  create(
    input: ActivityInput,
    context: Pick<BrowserActivity, 'source' | 'scope' | 'groupId' | 'trigger'>,
    asRead = false
  ) {
    const activity: BrowserActivity = {
      ...validateActivity(input),
      ...context,
      id: randomUUID(),
      createdAt: this.now(),
      asRead,
    };
    const next = [activity, ...this.all()].slice(0, 1000);
    this.persistence.save(next);
    this.entries = next;
    try {
      this.persistence.created?.(activity);
    } catch {
      /* Notification failures must not undo a saved activity. */
    }
    return { ...activity, deepLink: activityLink(activity.id) };
  }

  delete(id: string | string[]) {
    const ids = new Set(Array.isArray(id) ? id : [id]);
    const next = this.all().filter((entry) => !ids.has(entry.id));
    this.persistence.save(next);
    this.entries = next;
  }

  read(id?: string | string[]) {
    const next = this.all().map((entry) =>
      !id || (Array.isArray(id) ? id.includes(entry.id) : entry.id === id)
        ? { ...entry, asRead: true }
        : entry
    );
    this.persistence.save(next);
    this.entries = next;
  }
}

/* Constructor stores the shared Activity service. */
/* eslint-disable no-useless-constructor, no-empty-function */
import type { ActivityStore } from './activityStore';
import type { BrowserActivity } from '../browser/activity';

/** One alert per pending question; notification failures never block an answer. */
export class AIInputAttention {
  private pending?: { token: string; activityId?: string };

  constructor(private store: () => Pick<ActivityStore, 'create' | 'read'>) {}

  begin(token: string, context: Pick<BrowserActivity, 'scope' | 'groupId'>) {
    if (this.pending?.token === token) return;
    if (this.pending) this.finish(this.pending.token);
    this.pending = { token };
    try {
      const activity = this.store().create(
        {
          title: 'AI needs your reply',
          message:
            'The assistant is waiting for an answer. Open Chat to continue.',
        },
        { source: 'ai', ...context },
      );
      this.pending.activityId = activity.id;
    } catch {
      // The in-chat question remains usable if Activity storage is unavailable.
    }
  }

  finish(token: string) {
    if (this.pending?.token !== token) return;
    const { activityId } = this.pending;
    this.pending = undefined;
    if (activityId) {
      try {
        this.store().read(activityId);
      } catch {
        /* Answering must still resume. */
      }
    }
  }
}

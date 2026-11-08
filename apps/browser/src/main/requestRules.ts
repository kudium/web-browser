import type { OnBeforeRequestListenerDetails, Session } from 'electron';

export interface RequestRule {
  (details: OnBeforeRequestListenerDetails): boolean | Promise<boolean>;
  check?(details: OnBeforeRequestListenerDetails): void;
}

interface Registration {
  active: boolean;
  pending: Set<() => void>;
  rule: RequestRule;
}
const sessions = new WeakMap<Session, Set<Registration>>();

/** Electron has one native listener per event. Compose cancellation rules here. */
export function addRequestRule(target: Session, rule: RequestRule): () => void {
  let rules = sessions.get(target);
  if (!rules) {
    rules = new Set();
    sessions.set(target, rules);
    const registered = rules;
    target.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        const snapshot = [...registered];
        let finished = false;
        let cancelPending: () => void;
        const finish = (cancel: boolean) => {
          if (finished) return;
          finished = true;
          snapshot.forEach((entry) => entry.pending.delete(cancelPending));
          let denied = cancel;
          if (!denied) {
            try {
              // No await between these authority checks and Chromium dispatch.
              snapshot.forEach((entry) => {
                if (entry.active) entry.rule.check?.(details);
              });
            } catch {
              denied = true;
            }
          }
          callback({ cancel: denied });
        };
        cancelPending = () => finish(true);
        let waiting = 0;
        snapshot.forEach((entry) => {
          if (finished || !entry.active) return;
          try {
            const result = entry.rule(details);
            if (typeof result === 'boolean') {
              if (result) finish(true);
            } else {
              waiting += 1;
              entry.pending.add(cancelPending);
              result
                .then((cancel) => {
                  entry.pending.delete(cancelPending);
                  waiting -= 1;
                  if (cancel || !entry.active) finish(true);
                  else if (!waiting) finish(false);
                  return undefined;
                })
                .catch(() => finish(true));
            }
          } catch {
            finish(true);
          }
        });
        if (!waiting) finish(false);
      }
    );
  }
  const entry: Registration = { active: true, pending: new Set(), rule };
  rules.add(entry);
  return () => {
    entry.active = false;
    rules!.delete(entry);
    entry.pending.forEach((cancel) => cancel());
    entry.pending.clear();
  };
}

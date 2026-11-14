import type { OnBeforeSendHeadersListenerDetails, Session } from 'electron';

type HeaderRule = (
  details: OnBeforeSendHeadersListenerDetails,
  headers: Record<string, string>
) => void;
const sessions = new WeakMap<
  Session,
  Set<{ rule: HeaderRule; priority: number }>
>();

/** Compose synchronous edits: Electron supports one listener for this event. */
export function addRequestHeaderRule(
  target: Session,
  rule: HeaderRule,
  priority = 0
) {
  let rules = sessions.get(target);
  if (!rules) {
    rules = new Set();
    sessions.set(target, rules);
    const registered = rules;
    target.webRequest.onBeforeSendHeaders(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        const headers = { ...details.requestHeaders };
        try {
          [...registered]
            .sort((a, b) => a.priority - b.priority)
            .forEach((entry) => entry.rule(details, headers));
          callback({ requestHeaders: headers });
        } catch {
          callback({ cancel: true });
        }
      }
    );
  }
  const entry = { rule, priority };
  rules.add(entry);
  return () => rules!.delete(entry);
}

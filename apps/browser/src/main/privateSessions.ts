import type { Session } from 'electron';

const privateSessions = new WeakSet<Session>();
export function markPrivateSession(target: Session) {
  privateSessions.add(target);
}
export function isPrivateSession(target: Session) {
  return privateSessions.has(target);
}

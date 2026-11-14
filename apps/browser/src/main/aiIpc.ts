import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent, Session } from 'electron';
import { isPrivateSession } from './privateSessions';

type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => any;
const regular = Symbol('regular AI');
type Scope = Session | typeof regular;
const channels = new Map<string, Map<Scope, Handler>>();

/** A single native handler routes chrome requests to their own AI session. */
export function scopedAIIPC(target?: Session) {
  const scope: Scope = target || regular;
  const owned = new Map<string, Handler>();
  const removeHandler = (channel: string) => {
    const routes = channels.get(channel);
    if (routes?.get(scope) !== owned.get(channel)) return;
    routes?.delete(scope);
    owned.delete(channel);
    if (routes && !routes.size) {
      channels.delete(channel);
      ipcMain.removeHandler(channel);
    }
  };
  return {
    handle(channel: string, handler: Handler) {
      let routes = channels.get(channel);
      if (!routes) {
        routes = new Map();
        channels.set(channel, routes);
        ipcMain.handle(channel, (event, ...args) => {
          const senderScope = isPrivateSession(event.sender.session)
            ? event.sender.session
            : regular;
          const route = channels.get(channel)?.get(senderScope);
          if (!route) throw new Error('AI session is no longer available.');
          return route(event, ...args);
        });
      }
      if (routes.has(scope)) throw new Error(`AI handler already registered: ${channel}`);
      routes.set(scope, handler);
      owned.set(channel, handler);
    },
    removeHandler,
    dispose() {
      [...owned.keys()].forEach(removeHandler);
    },
  };
}

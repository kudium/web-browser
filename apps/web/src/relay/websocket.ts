import type { ServerWebSocket, WebSocketHandler } from 'bun';
import type { RelayService } from './service';

export interface RelaySocketData {
  service: RelayService;
  deviceId: string;
  urls: { host?: string; path: string };
  handlers?: { onFrame(text: string): void; onClose(): void };
}

/**
 * Bun WebSocket handlers for device sockets. They carry no state of their own:
 * the upgrade stores the service and device on `ws.data`, so index.ts can pass
 * this one object to `Bun.serve({ websocket })`.
 */
export const relayWebSocket: WebSocketHandler<RelaySocketData> = {
  maxPayloadLength: 2 * 1024 * 1024,
  idleTimeout: 120,
  open(ws: ServerWebSocket<RelaySocketData>) {
    const { service, deviceId, urls } = ws.data;
    ws.data.handlers = service.attach(
      deviceId,
      {
        send: (frame) => {
          ws.send(JSON.stringify(frame));
        },
        close: (code, reason) => {
          try {
            ws.close(code, reason);
          } catch {
            /* Already closed. */
          }
        },
      },
      urls
    );
  },
  message(ws: ServerWebSocket<RelaySocketData>, message) {
    const text = typeof message === 'string' ? message : Buffer.from(message).toString('utf8');
    ws.data.handlers?.onFrame(text);
  },
  close(ws: ServerWebSocket<RelaySocketData>) {
    ws.data.handlers?.onClose();
    ws.data.handlers = undefined;
  },
};

export interface UpgradeServer {
  upgrade(request: Request, options: { data: RelaySocketData }): boolean;
}

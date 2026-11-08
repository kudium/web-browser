import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

// jsdom's AbortSignal predates the API provided by the Electron/Node runtime.
if (typeof AbortSignal.prototype.throwIfAborted !== 'function') {
  Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
    configurable: true,
    writable: true,
    value(this: AbortSignal) {
      if (this.aborted)
        throw this.reason || new DOMException('Aborted', 'AbortError');
    },
  });
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });

  Object.defineProperty(window.crypto, 'randomUUID', {
    value: require('crypto').randomUUID,
  });
}

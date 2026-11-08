import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type { WebContents } from 'electron';
import { withAIProtocol } from './aiProtocol';

export interface AIDialogLifecycle {
  onChange(listener: (pending: boolean) => void): () => void;
  beginReview?(): () => void;
}

export interface AIDialog {
  id: string;
  type: string;
  message: string;
  url: string;
  defaultPrompt: string;
}
interface Owner {
  controller: AbortController;
  dialog?: AIDialog;
  reply?: (accept: boolean, promptText: string) => void;
  resume?: () => void;
  result: Promise<unknown>;
  notify?: (value: unknown) => void;
  cancel: () => Promise<void>;
}
const deferred = () => {
  let fulfill: (value: unknown) => void;
  let fail: (reason: unknown) => void;
  const promise = new Promise<unknown>((resolve, reject) => {
    fulfill = resolve;
    fail = reject;
  });
  return { promise, resolve: fulfill!, reject: fail! };
};

/** A bounded action lease can remain alive while its website dialog is pending. */
export class AIDialogs {
  private owners = new Map<WebContents, Owner>();

  private idle?: () => void;

  constructor(idle?: () => void) {
    this.idle = idle;
  }

  busy() {
    return this.owners.size > 0;
  }

  pending(contents: WebContents) {
    return this.owners.get(contents)?.dialog;
  }

  async perform(
    contents: WebContents,
    source: AbortSignal,
    action: (
      signal: AbortSignal,
      lifecycle: AIDialogLifecycle
    ) => Promise<unknown>,
    options: {
      actionTimeoutMs?: number;
      tabId?: string;
      beforeUnloadURL?: string;
      onCompletion?: (completion: Promise<unknown>) => void;
    } = {}
  ) {
    if (source.aborted) throw new Error('Stopped.');
    if (this.owners.has(contents))
      throw new Error(
        'Respond to the pending website dialog before another action.'
      );
    const first = deferred();
    const completed = deferred();
    completed.promise.catch(() => {});
    options.onCompletion?.(completed.promise);
    const controller = new AbortController();
    const actionTimeout = options.actionTimeoutMs ?? 15000;
    let reviews = 0;
    let reviewBudget = actionTimeout;
    let deadline = 0;
    const listeners = new Set<(pending: boolean) => void>();
    const changed = (pending: boolean) =>
      listeners.forEach((listener) => listener(pending));
    let timer: ReturnType<typeof setTimeout>;
    const owner: Owner = {
      controller,
      result: completed.promise,
      cancel: async () => {
        const { reply } = owner;
        owner.reply = undefined;
        owner.dialog = undefined;
        try {
          reply?.(false, '');
        } catch {
          /* The native frame may already be closed. */
        }
        controller.abort();
      },
    };
    const arm = (milliseconds: number) => {
      clearTimeout(timer);
      deadline = Date.now() + milliseconds;
      timer = setTimeout(() => {
        owner.cancel().catch(() => {});
      }, milliseconds);
    };
    const lifecycle: AIDialogLifecycle = {
      onChange: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      beginReview: () => {
        if (reviews === 0 && !owner.dialog) {
          reviewBudget = Math.max(0, deadline - Date.now());
          arm(120000);
          changed(true);
        }
        reviews += 1;
        let released = false;
        return () => {
          if (released) return;
          released = true;
          reviews -= 1;
          if (reviews === 0 && !owner.dialog && !controller.signal.aborted) {
            arm(reviewBudget);
            changed(false);
          }
        };
      },
    };
    owner.resume = () => {
      arm(reviews ? 120000 : actionTimeout);
      if (!reviews) changed(false);
    };
    const events = contents as unknown as EventEmitter;
    const abort = () => {
      owner.cancel().catch(() => {});
    };
    source.addEventListener('abort', abort, { once: true });
    // Electron 45's native callback is observed directly. Preserve its normal
    // handler outside this action lease, avoiding duplicate native prompts.
    type NativeHandler = (
      event: {
        dialogType: string;
        messageText: string;
        defaultPromptText: string;
        frame: { url: string };
      },
      reply: (accept: boolean, text: string) => void
    ) => void;
    const defaults = events.listeners('-run-dialog') as NativeHandler[];
    defaults.forEach((handler) =>
      events.removeListener('-run-dialog', handler)
    );
    const message: NativeHandler = (event, reply) => {
      owner.reply = reply;
      owner.dialog = {
        id: randomUUID(),
        type: event.dialogType,
        message: String(event.messageText || '').slice(0, 20000),
        url: event.frame.url,
        defaultPrompt: String(event.defaultPromptText || '').slice(0, 10000),
      };
      arm(120000);
      changed(true);
      const receipt = {
        dialog: owner.dialog,
        ...(options.tabId ? { tabId: options.tabId } : {}),
        pending: true,
        mayHaveEffects: true,
      };
      first.resolve(receipt);
      owner.notify?.(receipt);
      owner.notify = undefined;
    };
    this.owners.set(contents, owner);
    events.on('-run-dialog', message);
    const nativeCancel = () => {
      // Chromium also clears dialog state at ordinary navigation start.
      if (owner.dialog) abort();
    };
    events.on('-cancel-dialogs', nativeCancel);
    let departureUsed = false;
    const departure = (event: { preventDefault: () => void }) => {
      if (
        !departureUsed &&
        options.beforeUnloadURL !== undefined &&
        contents.getURL() === options.beforeUnloadURL &&
        !controller.signal.aborted &&
        !source.aborted
      ) {
        departureUsed = true;
        event.preventDefault();
      }
    };
    events.on('will-prevent-unload', departure);
    const cleanup = () => {
      // The outer protocol deadline can expire before the dialog phase timer.
      // Always release a native callback before restoring normal handlers.
      const { reply } = owner;
      owner.reply = undefined;
      owner.dialog = undefined;
      try {
        reply?.(false, '');
      } catch {
        /* The native frame may already be closed. */
      }
      clearTimeout(timer);
      source.removeEventListener('abort', abort);
      events.removeListener('-run-dialog', message);
      events.removeListener('-cancel-dialogs', nativeCancel);
      events.removeListener('will-prevent-unload', departure);
      defaults.forEach((handler) => {
        if (!events.listeners('-run-dialog').includes(handler))
          events.on('-run-dialog', handler);
      });
      if (this.owners.get(contents) === owner) this.owners.delete(contents);

      listeners.clear();
      this.idle?.();
    };
    withAIProtocol(
      contents,
      controller.signal,
      async () => {
        // The lease also shares native pointer/frame protocol operations.
        arm(actionTimeout);
        if (source.aborted) {
          await owner.cancel();
          throw new Error('Stopped.');
        }
        return action(controller.signal, lifecycle);
      },
      { timeoutMs: 120000 }
    )
      .then((value) => {
        cleanup();
        first.resolve(value);
        completed.resolve(value);
        return undefined;
      })
      .catch((error) => {
        cleanup();
        first.reject(error);
        completed.reject(error);
        owner.notify?.({ error: (error as Error).message });
      });
    return first.promise;
  }

  async respond(
    contents: WebContents,
    id: string,
    accept: boolean,
    promptText: string,
    signal: AbortSignal
  ) {
    const owner = this.owners.get(contents);
    if (!owner?.reply || owner.dialog?.id !== id)
      throw new Error('Website dialog changed or is no longer pending.');
    const next = deferred();
    owner.notify = next.resolve;
    const abort = () => {
      owner.cancel().catch(() => {});
      next.reject(new Error('Stopped.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) {
        abort();
        throw new Error('Stopped.');
      }
      const { reply } = owner;
      owner.reply = undefined;
      owner.dialog = undefined;
      owner.resume?.();
      try {
        reply(accept, promptText);
      } catch (error) {
        owner.controller.abort();
        throw error;
      }
      return await Promise.race([owner.result, next.promise]);
    } finally {
      signal.removeEventListener('abort', abort);
      if (owner.notify === next.resolve) owner.notify = undefined;
    }
  }

  async stop() {
    await Promise.all([...this.owners.values()].map((owner) => owner.cancel()));
  }
}

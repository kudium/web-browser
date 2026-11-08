import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * A separate process is needed because Electron caches the first OS key
 * identity.
 */
export function legacyStorageDecryptor(identity: string) {
  let child: ChildProcess | undefined;
  const pending = new Map<
    string,
    {
      resolve: (value: string) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const fail = () => {
    pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error('Legacy OS encryption recovery was unavailable.'));
    });
    pending.clear();
    child = undefined;
  };
  const dispose = () => {
    const processToStop = child;
    if (processToStop?.connected) processToStop.disconnect();
    fail();
  };
  return {
    dispose,
    decrypt(value: Buffer) {
      if (!child) {
        child = spawn(
          process.execPath,
          [path.join(__dirname, 'legacy-storage-decrypt.cjs'), identity],
          {
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
          }
        );
        child.on('error', fail);
        child.on('exit', fail);
        child.on('message', (message: unknown) => {
          if (
            !message ||
            typeof message !== 'object' ||
            !('id' in message) ||
            typeof message.id !== 'string'
          )
            return;
          const request = pending.get(message.id);
          if (!request) return;
          pending.delete(message.id);
          clearTimeout(request.timer);
          if ('result' in message && typeof message.result === 'string')
            request.resolve(message.result);
          else
            request.reject(
              new Error('Legacy OS ciphertext could not be decrypted.')
            );
        });
      }
      return new Promise<string>((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => {
          dispose();
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        child!.send({ id, ciphertext: value.toString('base64') }, (error) => {
          if (error) dispose();
        });
      });
    },
  };
}

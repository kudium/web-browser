import fs from 'fs';
import type { SynchronousSecureStorage } from './secureStorage';
import type { AIAccessMode } from '../browser/aiPermissions';

export const AI_RUN_STEP_LIMIT = 60;
export const AI_CHECKPOINT_TTL = 15 * 60 * 1000;
export const AI_CONTINUATION_TTL = 24 * 60 * 60 * 1000;

export interface AICheckpoint {
  pauseKind?: 'budget';
  roundLimit?: number;
  taskId?: string;
  accessMode?: AIAccessMode;
  privateData?: boolean;
  groupId?: string | null;
  messages: any[];
  step: number;
  endpoint: string;
  expires: number;
  reason?: string;
}

/** Legacy checkpoints start with the current default allowance. */
export const checkpointRoundLimit = (
  checkpoint: Pick<AICheckpoint, 'roundLimit'>
) => checkpoint.roundLimit ?? AI_RUN_STEP_LIMIT;

export const validCheckpointRoundLimit = (
  checkpoint: Pick<AICheckpoint, 'roundLimit'>
) =>
  checkpoint.roundLimit === undefined ||
  (Number.isSafeInteger(checkpoint.roundLimit) &&
    checkpoint.roundLimit >= AI_RUN_STEP_LIMIT);

/** Every explicit continuation starts a fresh, doubled segment. */
export function extendCheckpointBudget(checkpoint: AICheckpoint): AICheckpoint {
  return {
    ...checkpoint,
    step: 0,
    roundLimit: Math.min(
      Number.MAX_SAFE_INTEGER,
      checkpointRoundLimit(checkpoint) * 2
    ),
  };
}

/** Paused tasks are encrypted at rest; restoring never starts browser actions. */
export class AICheckpointStore {
  // Parameter properties initialize the store dependencies.
  // eslint-disable-next-line no-useless-constructor, no-empty-function
  constructor(
    private filename: string,
    private storage: SynchronousSecureStorage,
    private memoryOnly = false
  ) {
    // Dependencies remain synchronous after OS-key initialization.
  }

  private available() {
    return (
      this.storage.isEncryptionAvailable() &&
      this.storage.getSelectedStorageBackend?.() !== 'basic_text' &&
      this.storage.isFileAvailable?.(this.filename) !== false
    );
  }

  private checkpoint?: AICheckpoint;

  clear() {
    this.checkpoint = undefined;
    if (this.memoryOnly) return;
    if (this.storage.isFileAvailable?.(this.filename) === false) return;
    fs.rmSync(this.filename, { force: true });
  }

  save(checkpoint?: AICheckpoint) {
    if (this.memoryOnly) {
      this.checkpoint = checkpoint;
      return;
    }
    if (!checkpoint || !this.available()) {
      this.clear();
      return;
    }
    const value = JSON.stringify(checkpoint);
    if (Buffer.byteLength(value) > 8 * 1024 * 1024) {
      this.clear();
      return;
    }
    const temporary = `${this.filename}.tmp`;
    try {
      fs.writeFileSync(temporary, this.storage.encryptString(value), {
        mode: 0o600,
      });
      fs.renameSync(temporary, this.filename);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  load(): AICheckpoint | undefined {
    if (this.memoryOnly) return this.checkpoint;
    try {
      if (!this.available()) return undefined;
      if (fs.statSync(this.filename).size > 16 * 1024 * 1024)
        throw new Error('Too large');
      const value = JSON.parse(
        this.storage.decryptString(fs.readFileSync(this.filename))
      );
      if (
        (value.accessMode !== undefined &&
          !['ask', 'standard', 'full'].includes(value.accessMode)) ||
        (value.privateData !== undefined &&
          typeof value.privateData !== 'boolean') ||
        !Array.isArray(value.messages) ||
        value.messages.length > 1000 ||
        !Number.isInteger(value.step) ||
        value.step < 0 ||
        value.step >= checkpointRoundLimit(value) ||
        !validCheckpointRoundLimit(value) ||
        (value.groupId !== undefined &&
          value.groupId !== null &&
          (typeof value.groupId !== 'string' || value.groupId.length > 300)) ||
        typeof value.endpoint !== 'string' ||
        !/^https?:\/\//.test(value.endpoint) ||
        !Number.isFinite(value.expires) ||
        value.expires <= Date.now() ||
        value.expires >
          Date.now() +
            (value.pauseKind === 'budget'
              ? AI_CONTINUATION_TTL
              : AI_CHECKPOINT_TTL) ||
        (value.pauseKind !== undefined && value.pauseKind !== 'budget') ||
        (value.reason !== undefined && typeof value.reason !== 'string')
      )
        throw new Error('Invalid checkpoint');
      return value;
    } catch {
      this.clear();
      return undefined;
    }
  }
}

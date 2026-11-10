import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { storageRecoveryMessage } from '../browser/storageRecovery';
import {
  AI_CONTINUATION_TTL,
  AI_CHECKPOINT_TTL,
  checkpointRoundLimit,
  validCheckpointRoundLimit,
} from './aiCheckpoint';
import { AITaskMemory, validAITaskMemory } from '../browser/aiTaskMemory';
import type { SynchronousSecureStorage } from './secureStorage';
import type { AICheckpoint } from './aiCheckpoint';
import type {
  AIConversationEvent,
  AIConversationsState,
} from '../browser/aiConversations';

interface Conversation {
  taskMemory?: AITaskMemory;
  id: string;
  title: string;
  titleSource?: 'prompt' | 'ai' | 'user';
  updatedAt: number;
  history: AIConversationEvent[];
  draft: string;
  groupId?: string | null;
  checkpoint?: AICheckpoint;
  /** True only when saved personal information was disclosed through a tool. */
  privateData?: boolean;
  /** Recipient approved for this chat, stored only in encrypted history. */
  privateRecipient?: string;
  attachmentIds: string[];
}
export class AIConversationStore {
  private chats: Conversation[] = [];

  private selectedId = '';

  private pendingDeletion?: {
    chat: Conversation;
    index: number;
    selected: boolean;
    placeholderId?: string;
    expiresAt: number;
    timer: ReturnType<typeof setTimeout>;
    finalize: () => void;
  };

  private storageNotice: string | undefined;

  private preserveOriginal = false;

  constructor(private file: string, private storage: SynchronousSecureStorage) {
    try {
      if (this.available() && fs.existsSync(this.file)) {
        if (fs.statSync(file).size > 20 * 1024 * 1024)
          throw new Error('History is too large');
        const saved = JSON.parse(storage.decryptString(fs.readFileSync(file)));
        if (!Array.isArray(saved.chats) || saved.chats.length > 30)
          throw new Error('Invalid history');
        this.chats = saved.chats
          .filter(
            (chat: Conversation) =>
              chat &&
              Number.isFinite(chat.updatedAt) &&
              (chat.groupId === undefined ||
                chat.groupId === null ||
                (typeof chat.groupId === 'string' &&
                  chat.groupId.length <= 300)) &&
              typeof chat.id === 'string' &&
              typeof chat.title === 'string' &&
              typeof chat.draft === 'string' &&
              Array.isArray(chat.history) &&
              chat.history.every(
                (event) =>
                  event &&
                  typeof event.text === 'string' &&
                  ['user', 'message', 'error', 'handoff'].includes(event.type)
              )
          )
          .map((chat: Conversation) => ({
            ...chat,
            draft: chat.draft.slice(0, 12000),
            history:
              chat.history.length > 100
                ? [chat.history[0], ...chat.history.slice(-99)]
                : chat.history,
            taskMemory: validAITaskMemory(chat.taskMemory)
              ? chat.taskMemory
              : undefined,
            attachmentIds: [],
            privateRecipient:
              typeof chat.privateRecipient === 'string' &&
              chat.privateRecipient.length <= 4000
                ? chat.privateRecipient
                : undefined,
            privateData: chat.privateData === true,
            checkpoint:
              chat.checkpoint?.expires &&
              chat.checkpoint.expires > Date.now() &&
              chat.checkpoint.expires <=
                Date.now() +
                  (chat.checkpoint.pauseKind === 'budget'
                    ? AI_CONTINUATION_TTL
                    : AI_CHECKPOINT_TTL) &&
              (chat.checkpoint.pauseKind === undefined ||
                chat.checkpoint.pauseKind === 'budget') &&
              Array.isArray(chat.checkpoint.messages) &&
              chat.checkpoint.messages.length <= 1000 &&
              Number.isInteger(chat.checkpoint.step) &&
              chat.checkpoint.step >= 0 &&
              chat.checkpoint.step < checkpointRoundLimit(chat.checkpoint) &&
              validCheckpointRoundLimit(chat.checkpoint) &&
              typeof chat.checkpoint.endpoint === 'string' &&
              /^https?:\/\//.test(chat.checkpoint.endpoint) &&
              (chat.checkpoint.groupId === undefined ||
                chat.checkpoint.groupId === null ||
                typeof chat.checkpoint.groupId === 'string')
                ? chat.checkpoint
                : undefined,
          }));
        if (this.chats.length !== saved.chats.length)
          throw new Error('Some chats need recovery');
        this.selectedId = saved.selectedId;
      }
    } catch {
      this.preserveOriginal = true;
      try {
        fs.copyFileSync(file, `${file}.recovery`, fs.constants.COPYFILE_EXCL);
        this.preserveOriginal = false;
      } catch {
        /* Keep the original if recovery cannot be written. */
      }
      this.storageNotice =
        'Saved chats could not be restored. New chats remain available in this session.';
    }
    if (!this.available() && fs.existsSync(this.file))
      this.storageNotice = storageRecoveryMessage('your saved chats');
    if (!this.chats.length) this.chats.push(AIConversationStore.blank());
    if (!this.chats.some((chat) => chat.id === this.selectedId))
      this.selectedId = this.chats[0].id;
  }

  private available() {
    return (
      this.storage.isEncryptionAvailable() &&
      this.storage.getSelectedStorageBackend?.() !== 'basic_text' &&
      this.storage.isFileAvailable?.(this.file) !== false
    );
  }

  private static blank(groupId?: string | null): Conversation {
    return {
      id: randomUUID(),
      title: 'New chat',
      updatedAt: Date.now(),
      history: [],
      draft: '',
      groupId,
      attachmentIds: [],
      privateData: false,
    };
  }

  current() {
    return this.chats.find((chat) => chat.id === this.selectedId)!;
  }

  find(id: string) {
    return this.chats.find((chat) => chat.id === id);
  }

  save() {
    const chat = this.current();
    chat.updatedAt = Date.now();
    const first = chat.history.find((event) => event.type === 'user');
    if (first && !chat.titleSource)
      chat.title = first.text.replace(/\s+/g, ' ').slice(0, 70) || 'New chat';
    if (this.preserveOriginal) return;
    const temporary = `${this.file}.tmp`;
    try {
      if (!this.available()) {
        this.storageNotice =
          'Chats stay in this session because secure local storage is unavailable. Restart Kudium to retry access. Copy any new chats you want to keep before restarting.';
        return;
      }
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const data = JSON.stringify({
        selectedId: this.selectedId,
        chats: this.chats,
      });
      if (Buffer.byteLength(data) > 16 * 1024 * 1024)
        throw new Error('History storage is full');
      fs.writeFileSync(temporary, this.storage.encryptString(data), {
        mode: 0o600,
      });
      fs.renameSync(temporary, this.file);
      this.storageNotice = undefined;
    } catch {
      this.storageNotice =
        'Could not save chats locally. Your chats are kept in this session.';
    } finally {
      try {
        fs.rmSync(temporary, { force: true });
      } catch {
        /* A failed cleanup must not stop active AI work. */
      }
    }
  }

  rename(id: string, title: string, source: 'ai' | 'user' = 'user') {
    const chat = this.find(id);
    if (!chat) throw new Error('Chat is no longer available.');
    const clean = title.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > 70)
      throw new Error('Use a chat name between 1 and 70 characters.');
    if (source === 'ai' && chat.titleSource) return;
    chat.title = clean;
    chat.titleSource = source;
    this.save();
  }

  create(groupId?: string | null) {
    if (this.chats.length >= 30)
      throw new Error(
        'Delete an old chat before creating another (30 chat limit).'
      );
    const chat = AIConversationStore.blank(groupId);
    this.chats.push(chat);
    this.selectedId = chat.id;
    this.save();
  }

  reorder(id: string, beforeId: string | null) {
    if (!this.find(id) || (beforeId !== null && !this.find(beforeId)))
      throw new Error('Chat is no longer available.');
    if (id === beforeId) return;
    const ordered = [...this.chats].reverse();
    const moving = ordered.splice(
      ordered.findIndex((chat) => chat.id === id),
      1
    )[0];
    ordered.splice(
      beforeId === null
        ? ordered.length
        : ordered.findIndex((chat) => chat.id === beforeId),
      0,
      moving
    );
    this.chats = ordered.reverse();
    this.save();
  }

  select(id: string) {
    if (!this.find(id)) throw new Error('Chat is no longer available.');
    this.selectedId = id;
    this.save();
  }

  delete(id: string) {
    if (!this.find(id)) throw new Error('Chat is no longer available.');
    this.chats = this.chats.filter((chat) => chat.id !== id);
    if (!this.chats.length) this.chats.push(AIConversationStore.blank());
    if (this.selectedId === id) this.selectedId = this.chats[0].id;
    this.save();
  }

  deleteWithUndo(id: string, finalize: () => void) {
    const chat = this.find(id);
    if (!chat) throw new Error('Chat is no longer available.');
    this.finishDeletion();
    const index = this.chats.indexOf(chat);
    const selected = this.selectedId === id;
    const onlyChat = this.chats.length === 1;
    this.delete(id);
    const timer = setTimeout(() => this.finishDeletion(), 10000);
    timer.unref?.();
    this.pendingDeletion = {
      chat,
      index,
      selected,
      finalize,
      timer,
      placeholderId: onlyChat ? this.current().id : undefined,
      expiresAt: Date.now() + 10000,
    };
  }

  private finishDeletion() {
    const pending = this.pendingDeletion;
    if (!pending) return;
    this.pendingDeletion = undefined;
    clearTimeout(pending.timer);
    pending.finalize();
  }

  undoDelete(id: string) {
    const pending = this.pendingDeletion;
    if (!pending || pending.chat.id !== id || pending.expiresAt <= Date.now())
      throw new Error('The undo period has expired.');
    const placeholder =
      pending.placeholderId && this.find(pending.placeholderId);
    const removePlaceholder =
      placeholder &&
      !placeholder.history.length &&
      !placeholder.draft &&
      !placeholder.attachmentIds.length &&
      !placeholder.checkpoint &&
      !placeholder.taskMemory &&
      !placeholder.titleSource;
    if (this.chats.length >= 30 && !removePlaceholder)
      throw new Error(
        'Delete another chat before restoring this one (30 chat limit).'
      );
    clearTimeout(pending.timer);
    this.pendingDeletion = undefined;
    if (removePlaceholder)
      this.chats = this.chats.filter((chat) => chat.id !== placeholder.id);
    this.chats.splice(
      Math.min(pending.index, this.chats.length),
      0,
      pending.chat
    );
    if (pending.selected || !this.find(this.selectedId)) this.selectedId = id;
    this.save();
  }

  snapshot(): AIConversationsState {
    const chat = this.current();
    return {
      undoDeletion:
        this.pendingDeletion && this.pendingDeletion.expiresAt > Date.now()
          ? {
              id: this.pendingDeletion.chat.id,
              title: this.pendingDeletion.chat.title,
              expiresAt: this.pendingDeletion.expiresAt,
            }
          : undefined,
      selectedId: chat.id,
      conversations: this.chats
        .map((item) => ({
          id: item.id,
          title: item.title,
          updatedAt: item.updatedAt,
          paused: !!item.checkpoint && item.checkpoint.expires > Date.now(),
        }))
        .reverse(),
      history: chat.history.map((event) => ({ ...event })),
      draft: chat.draft,
      storageNotice: this.storageNotice,
      taskMemory: chat.taskMemory,
    };
  }
}

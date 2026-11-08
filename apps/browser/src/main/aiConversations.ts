import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { SynchronousSecureStorage } from './secureStorage';
import type { AICheckpoint } from './aiCheckpoint';
import type {
  AIConversationEvent,
  AIConversationsState,
} from '../browser/aiConversations';

interface Conversation {
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
            history: chat.history.slice(-100),
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
              chat.checkpoint.expires <= Date.now() + 15 * 60000 &&
              Array.isArray(chat.checkpoint.messages) &&
              chat.checkpoint.messages.length <= 1000 &&
              Number.isInteger(chat.checkpoint.step) &&
              chat.checkpoint.step >= 0 &&
              chat.checkpoint.step < 30 &&
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
      this.storageNotice =
        'Saved chats could not be restored. Their encrypted file has been preserved.';
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
          'Chats stay in this session because secure local storage is unavailable.';
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

  snapshot(): AIConversationsState {
    const chat = this.current();
    return {
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
    };
  }
}

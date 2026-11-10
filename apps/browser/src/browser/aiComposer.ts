import type { AIContextReference } from './aiContext';

export interface AIComposerAttachment {
  id: string;
  name: string;
  size: number;
  kind: 'image' | 'document';
  preview?: string;
}
export interface AIComposerTask {
  prompt: string;
  attachmentIds: string[];
  contextReferences?: AIContextReference[];
}
export const AI_ATTACHMENT_LIMIT = 8;
export const AI_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const AI_ATTACHMENT_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.txt,.md';

export interface AIQueueState {
  messages: Array<{ id: string; prompt: string }>;
  paused: boolean;
  started?: Extract<
    import('./aiConversations').AIConversationEvent,
    { type: 'user' }
  >;
}
export type AIQueueRequest =
  | { action: 'list' | 'resume' }
  | { action: 'remove'; id: string };

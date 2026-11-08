import type { AIEvent } from './ai';

export type AIConversationEvent =
  | AIEvent
  | {
      type: 'user';
      text: string;
      attachments?: Array<{
        id: string;
        name: string;
        kind: 'image' | 'document';
      }>;
      contexts?: Array<{ id: string; kind: 'tab' | 'group'; name: string }>;
    };
export interface AIConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  paused: boolean;
}
export interface AIConversationsState {
  selectedId: string;
  conversations: AIConversationSummary[];
  history: AIConversationEvent[];
  draft: string;
  storageNotice?: string;
}
export type AIConversationRequest =
  | { action: 'list' }
  | { action: 'reorder'; id: string; beforeId: string | null }
  | { action: 'rename'; id: string; title: string }
  | { action: 'create'; draft?: string }
  | { action: 'select' | 'delete'; id: string; draft?: string }
  | { action: 'draft'; id: string; draft: string };

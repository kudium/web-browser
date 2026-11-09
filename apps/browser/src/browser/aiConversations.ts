import type { AIEvent } from './ai';
import type { AITaskMemory } from './aiTaskMemory';

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
  undoDeletion?: { id: string; title: string; expiresAt: number };
  taskMemory?: AITaskMemory;
  selectedId: string;
  conversations: AIConversationSummary[];
  history: AIConversationEvent[];
  draft: string;
  storageNotice?: string;
}
export type AIConversationRequest =
  | { action: 'clear-memory'; id: string }
  | { action: 'list' }
  | { action: 'reorder'; id: string; beforeId: string | null }
  | { action: 'rename'; id: string; title: string }
  | { action: 'create'; draft?: string }
  | { action: 'select' | 'delete' | 'undo-delete'; id: string; draft?: string }
  | { action: 'draft'; id: string; draft: string };

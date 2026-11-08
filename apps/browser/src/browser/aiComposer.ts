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

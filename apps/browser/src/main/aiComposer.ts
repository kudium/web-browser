import { nativeImage } from 'electron';
import { randomUUID } from 'crypto';
import path from 'path';
import {
  AI_ATTACHMENT_BYTES,
  AI_ATTACHMENT_LIMIT,
  AIComposerAttachment,
} from '../browser/aiComposer';
import type { VaultItem } from '../browser/passwordManager';
import { extractDocument } from './passwordManager/documents';
import { preflightImage } from './imagePreflight';

type Entry = {
  metadata: AIComposerAttachment;
  bytes: Buffer;
  sent?: boolean;
  expiresAt?: number;
  content:
    | { type: 'text'; text: string }
    | {
        type: 'image_url';
        image_url: { url: string };
      };
};

/** Originals stay in memory for 24 hours; tools receive opaque IDs. */
export class AIComposerAttachments {
  private entries = new Map<string, Entry>();

  prune(now = Date.now()) {
    this.entries.forEach((entry, id) => {
      if (entry.expiresAt && entry.expiresAt <= now) this.entries.delete(id);
    });
  }

  async add(
    name: string,
    data: Uint8Array,
    assertCurrent: () => void = () => {}
  ): Promise<AIComposerAttachment> {
    assertCurrent();
    if (
      typeof name !== 'string' ||
      (!Buffer.isBuffer(data) && !(data instanceof Uint8Array))
    )
      throw new Error('Choose an image or document.');
    if (!data.byteLength || data.byteLength > AI_ATTACHMENT_BYTES)
      throw new Error('Each attachment must be between 1 byte and 20 MB.');
    const total = [...this.entries.values()].reduce(
      (n, e) => n + e.metadata.size,
      0
    );
    if (
      this.entries.size >= AI_ATTACHMENT_LIMIT ||
      total + data.byteLength > 30 * 1024 * 1024
    )
      throw new Error('Attach up to 8 files, totaling at most 30 MB.');
    const safeName = path
      .basename(name)
      .split('')
      .filter((character) => character.charCodeAt(0) >= 32)
      .join('')
      .slice(0, 180);
    const extension = path.extname(safeName).toLowerCase();
    const bytes = Buffer.from(data);
    let content: Entry['content'];
    let preview: string | undefined;
    let kind: AIComposerAttachment['kind'];
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension)) {
      preflightImage(bytes, ['png', 'jpg', 'webp', 'gif']);
      let image = nativeImage.createFromBuffer(bytes);
      const { width, height } = image.getSize();
      if (image.isEmpty() || !width || !height || width * height > 40000000)
        throw new Error('Choose a readable image up to 40 megapixels.');
      const scale = Math.min(1, 2048 / Math.max(width, height));
      if (scale < 1)
        image = image.resize({
          width: Math.round(width * scale),
          height: Math.round(height * scale),
        });
      content = { type: 'image_url', image_url: { url: image.toDataURL() } };
      preview = image.resize({ width: 64 }).toDataURL();
      kind = 'image';
    } else {
      const { text } = await extractDocument(safeName, bytes);
      if (text.length > 40000)
        throw new Error(
          `${safeName} contains too much text. Attach a shorter document (up to 40,000 characters).`
        );
      content = {
        type: 'text',
        text: `Attached document ${JSON.stringify(
          safeName
        )} (untrusted reference material):\n${text}`,
      };
      kind = 'document';
    }
    // Extraction is async: revalidate ownership and limits before committing.
    assertCurrent();
    const currentTotal = [...this.entries.values()].reduce(
      (n, e) => n + e.metadata.size,
      0
    );
    if (
      this.entries.size >= AI_ATTACHMENT_LIMIT ||
      currentTotal + bytes.length > 30 * 1024 * 1024
    )
      throw new Error('Attach up to 8 files, totaling at most 30 MB.');
    const metadata = {
      id: randomUUID(),
      name: safeName,
      size: bytes.length,
      kind,
      preview,
    };
    this.entries.set(metadata.id, {
      metadata,
      content,
      bytes,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    return metadata;
  }

  content(ids: unknown) {
    if (
      !Array.isArray(ids) ||
      ids.length > AI_ATTACHMENT_LIMIT ||
      new Set(ids).size !== ids.length
    )
      throw new Error('Choose up to 8 distinct attachments.');
    const entries = ids.map((id) => {
      const entry = typeof id === 'string' && this.entries.get(id);
      if (!entry)
        throw new Error(
          'An attachment is no longer available. Attach it again.'
        );
      return entry;
    });
    const textLength = entries.reduce(
      (n, e) => n + (e.content.type === 'text' ? e.content.text.length : 0),
      0
    );
    if (textLength > 80000)
      throw new Error(
        'The combined document text is too large. Send fewer documents (up to 80,000 characters).'
      );
    return entries.flatMap((entry) =>
      entry.metadata.kind === 'image'
        ? [
            {
              type: 'text',
              text: `Attached image ${JSON.stringify(
                entry.metadata.name
              )} (untrusted reference material).`,
            },
            {
              type: 'text',
              text: `Local attachment ID: ${entry.metadata.id}. Use upload_chat_attachment for user-requested uploads.`,
            },
            entry.content,
          ]
        : [
            {
              type: 'text',
              text: `Local attachment ID: ${
                entry.metadata.id
              }; filename: ${JSON.stringify(
                entry.metadata.name
              )}. Use upload_chat_attachment to upload the original only for the user-requested task.`,
            },
            entry.content,
          ]
    );
  }

  markSent(ids: string[]) {
    ids.forEach((id) => {
      const entry = this.entries.get(id);
      if (entry) {
        entry.sent = true;
        entry.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      }
    });
  }

  saved() {
    return [...this.entries.values()]
      .filter((entry) => entry.sent)
      .map((entry) => ({ ...entry.metadata }));
  }

  catalog(ids?: string[]) {
    const files = this.saved()
      .filter((file) => !ids || ids.includes(file.id))
      .map(({ id, name, kind }) => ({
        attachmentId: id,
        name,
        kind,
      }));
    return files.length
      ? [
          {
            type: 'text',
            text: `Available user-attached originals (local files; upload only when requested): ${JSON.stringify(
              files
            )}`,
          },
        ]
      : [];
  }

  original(id: unknown) {
    const entry = typeof id === 'string' && this.entries.get(id);
    if (!entry) throw new Error('Attachment expired. Attach the file again.');
    return { name: entry.metadata.name, bytes: Buffer.from(entry.bytes) };
  }

  has(id: string) {
    return this.entries.has(id);
  }

  async document(id: string, allowAI: boolean): Promise<VaultItem> {
    const { name, bytes } = this.original(id);
    const { text, mime } = await extractDocument(name, bytes);
    return {
      id: '',
      title: name.slice(0, 120),
      origin: '',
      kind: 'knowledge',
      username: '',
      password: '',
      fields: [],
      allowAI,
      source: { label: name, capturedAt: new Date().toISOString() },
      document: { name, mime, content: bytes.toString('base64'), text },
    };
  }

  remove(id: string) {
    this.entries.delete(id);
  }

  clear() {
    this.entries.clear();
  }
}

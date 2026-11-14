/* global globalThis */
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import type { VaultItem } from '../../browser/passwordManager';

/** Shared local extraction for the library and assistant attachments. */
export async function extractDocument(name: string, bytes: Buffer) {
  if (bytes.length > 20 * 1024 * 1024)
    throw new Error('Choose a document up to 20 MB.');
  const extension = path.extname(name).toLowerCase();
  let text: string;
  let mime: string;
  if (extension === '.txt' || extension === '.md') {
    text = bytes.toString('utf8');
    mime = extension === '.md' ? 'text/markdown' : 'text/plain';
  } else if (extension === '.docx') {
    text = (await mammoth.extractRawText({ buffer: bytes })).value;
    mime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (extension === '.pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker =
      worker;
    const loading = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    const document = await loading.promise;
    try {
      if (document.numPages > 1000)
        throw new Error('Choose a document with at most 1000 pages.');
      const pages = await Promise.all(
        Array.from({ length: document.numPages }, async (_, index) => {
          const page = await document.getPage(index + 1);
          const content = await page.getTextContent();
          return `[Page ${index + 1}]\n${content.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')}`;
        })
      );
      text = pages.join('\n\n');
    } finally {
      await loading.destroy();
    }
    mime = 'application/pdf';
  } else throw new Error('Choose PDF, DOCX, TXT, or Markdown.');
  if (
    !text.trim() ||
    (extension === '.pdf' && !text.replace(/\[Page \d+\]/g, '').trim())
  )
    throw new Error(
      'No readable text found. Scanned documents need a text version.'
    );
  if (text.length > 2000000)
    throw new Error(
      'Document text is too large. Split it into smaller documents.'
    );
  return { text, mime };
}

export async function importDocument(
  file: string,
  allowAI: boolean
): Promise<VaultItem> {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
    throw new Error('Choose a document up to 20 MB.');
  const bytes = fs.readFileSync(file);
  const { text, mime } = await extractDocument(path.basename(file), bytes);
  const name = path.basename(file);
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

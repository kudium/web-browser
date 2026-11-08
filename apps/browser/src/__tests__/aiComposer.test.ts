/* Sequential imports exercise the attachment count limit. */
/* eslint-disable no-await-in-loop */
/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AIComposerAttachments } from '../main/aiComposer';
import { AIComposerPreferences } from '../main/aiComposerPreferences';
import { appendProviderImages, providerRequest } from '../main/aiTransport';

jest.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: () => ({
      isEmpty: () => false,
      getSize: () => ({ width: 32, height: 32 }),
      toDataURL: () => 'data:image/png;base64,YQ==',
      resize() {
        return this;
      },
    }),
  },
}));

it('bounds imports and resolves only live opaque attachment IDs', async () => {
  const store = new AIComposerAttachments();
  const document = await store.add(
    'notes.md',
    Buffer.from('Favorite color: blue')
  );
  expect(document).toMatchObject({ name: 'notes.md', kind: 'document' });
  expect(document).not.toHaveProperty('text');
  expect(document).not.toHaveProperty('path');
  expect(store.content([document.id])).toEqual([
    expect.objectContaining({ text: expect.stringContaining(document.id) }),
    expect.objectContaining({
      text: expect.stringContaining('Favorite color: blue'),
    }),
  ]);
  expect(() => store.content([document.id, document.id])).toThrow('distinct');
  expect(() => store.content(['guessed-id'])).toThrow('no longer available');
  await expect(store.add('empty.txt', Buffer.alloc(0))).rejects.toThrow(
    '1 byte'
  );
  await expect(
    store.add('big.png', Buffer.alloc(20 * 1024 * 1024 + 1))
  ).rejects.toThrow('20 MB');
  await expect(store.add('program.exe', Buffer.from('hello'))).rejects.toThrow(
    'Choose PDF'
  );
  await expect(
    store.add('long.txt', Buffer.from('a'.repeat(40001)))
  ).rejects.toThrow('shorter');
  store.remove(document.id);
  expect(() => store.content([document.id])).toThrow('no longer available');
  for (let i = 0; i < 8; i += 1)
    await store.add(`${i}.txt`, Buffer.from('test'));
  await expect(store.add('ninth.txt', Buffer.from('test'))).rejects.toThrow(
    '8 files'
  );
});

it('keeps user images through screenshot tool turns and strips private transport metadata', async () => {
  const store = new AIComposerAttachments();
  const image = await store.add(
    'reference.png',
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
      'base64'
    )
  );
  const messages: any[] = [
    {
      role: 'user',
      retainImages: true,
      content: [
        { type: 'text', text: 'Compare this' },
        ...store.content([image.id]),
      ],
    },
  ];
  appendProviderImages(messages, [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,b2xk' } },
  ]);
  appendProviderImages(messages, [
    { type: 'image_url', image_url: { url: 'data:image/png;base64,bmV3' } },
  ]);
  expect(JSON.stringify(messages[0])).toContain('YQ==');
  const compatible = providerRequest(
    'https://api.openai.com/v1',
    'vision',
    messages,
    []
  );
  expect(compatible.messages[0]).not.toHaveProperty('retainImages');
  expect(compatible.messages[0].content).toEqual(messages[0].content);
  const claude = providerRequest(
    'https://api.anthropic.com/v1',
    'vision',
    messages,
    []
  );
  expect(claude.messages[0].content).toContainEqual({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'YQ==' },
  });
});

it('persists selected defaults atomically and recovers invalid preferences', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'touchbox-composer-test-')
  );
  try {
    const file = path.join(root, 'preferences.json');
    const prefs = new AIComposerPreferences(file);
    prefs.save({ accessMode: 'full', groupId: 'group-id' });
    expect(new AIComposerPreferences(file).value).toEqual({
      accessMode: 'full',
      groupId: 'group-id',
    });
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
    fs.writeFileSync(file, '{malformed');
    expect(new AIComposerPreferences(file).value).toEqual({
      accessMode: 'standard',
      groupId: null,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('retains byte-identical originals for uploads and encrypted document saving', async () => {
  const store = new AIComposerAttachments();
  const bytes = Buffer.from('Resume with original formatting\n');
  const file = await store.add('../resume.txt', bytes);
  expect(store.original(file.id)).toEqual({ name: 'resume.txt', bytes });
  const first = store.original(file.id);
  first.bytes.fill(0);
  expect(store.original(file.id).bytes).toEqual(bytes);
  const saved = await store.document(file.id, false);
  expect(saved.allowAI).toBe(false);
  expect(Buffer.from(saved.document!.content, 'base64')).toEqual(bytes);
  expect(saved.document!.text).toContain('Resume');
  expect(JSON.stringify(store.content([file.id]))).not.toContain('base64');
  store.clear();
  expect(() => store.original(file.id)).toThrow('expired');
});

it('limits the model attachment catalog to the selected chat originals', async () => {
  const store = new AIComposerAttachments();
  const alpha = await store.add('alpha.txt', Buffer.from('Alpha'));
  const beta = await store.add('beta.txt', Buffer.from('Beta'));
  store.markSent([alpha.id, beta.id]);
  const catalog = JSON.stringify(store.catalog([alpha.id]));
  expect(catalog).toContain(alpha.id);
  expect(catalog).not.toContain(beta.id);
  expect(store.catalog([])).toEqual([]);
  store.remove(alpha.id);
  expect(store.catalog([alpha.id])).toEqual([]);
  expect(JSON.stringify(store.catalog([beta.id]))).toContain(beta.id);
});

it('expires temporary originals after 24 hours while preserving newer files', async () => {
  const store = new AIComposerAttachments();
  const start = Date.now();
  const file = await store.add(
    'temporary.txt',
    Buffer.from('Temporary content')
  );
  store.markSent([file.id]);
  store.prune(start + 23 * 60 * 60 * 1000);
  expect(store.original(file.id).bytes.toString()).toBe('Temporary content');
  store.prune(start + 25 * 60 * 60 * 1000);
  expect(store.saved()).toEqual([]);
  expect(() => store.original(file.id)).toThrow('expired');
});

/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import type { WebContents } from 'electron';
import { AIOriginalUploads } from '../main/aiOriginalUploads';

it('keeps selected bytes readable after attachment and releases them on page replacement', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-original-test-'));
  const emitter = new EventEmitter();
  const page = Object.assign(emitter, {
    isDestroyed: () => false,
  }) as unknown as WebContents;
  const store = new AIOriginalUploads(directory);
  try {
    const file = await store.attach(
      page,
      'resume.txt',
      Buffer.from('Original resume'),
      async (filename) => filename
    );
    expect(fs.readFileSync(file, 'utf8')).toBe('Original resume');
    emitter.emit(
      'did-start-navigation',
      {},
      'https://example.com/#section',
      true,
      true
    );
    expect(fs.existsSync(file)).toBe(true);
    emitter.emit(
      'did-start-navigation',
      {},
      'https://example.com/next',
      false,
      true
    );
    expect(fs.existsSync(file)).toBe(true);
    emitter.emit('did-navigate', {}, 'https://example.com/next');
    expect(fs.existsSync(file)).toBe(false);
    expect(emitter.listenerCount('destroyed')).toBe(0);
    await expect(
      store.attach(page, 'resume.txt', Buffer.from('Original'), async () => {
        throw new Error('Cancelled');
      })
    ).rejects.toThrow('Cancelled');
    expect(fs.readdirSync(directory)).toEqual([]);
    const remaining = await store.attach(
      page,
      'resume.txt',
      Buffer.from('Original'),
      async (filename) => filename
    );
    store.clear();
    expect(fs.existsSync(remaining)).toBe(false);
  } finally {
    store.clear();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

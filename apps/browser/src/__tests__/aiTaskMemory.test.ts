import fs from 'fs';
import os from 'os';
import path from 'path';
import { validAITaskMemory } from '../browser/aiTaskMemory';
import { AIConversationStore } from '../main/aiConversations';
import { conversationAIContext } from '../main/aiConversationContext';

const memory = {
  decisions: ['Keep the sign-in flow'],
  unfinished: ['Verify the edit'],
  sources: ['src/signin.ts'],
};

test('bounds working notes and rejects malformed state instead of truncating it', () => {
  expect(validAITaskMemory(memory)).toBe(true);
  expect(validAITaskMemory({ ...memory, permissions: 'full' })).toBe(false);
  expect(validAITaskMemory({ ...memory, unfinished: ['x'.repeat(401)] })).toBe(
    false
  );
  expect(
    validAITaskMemory({ ...memory, sources: Array(9).fill('source') })
  ).toBe(false);
  expect(validAITaskMemory({ ...memory, decisions: [''] })).toBe(false);
  expect(
    validAITaskMemory({
      decisions: Array(8).fill('x'.repeat(400)),
      unfinished: Array(8).fill('y'.repeat(400)),
      sources: [],
    })
  ).toBe(false);
});

test('retains working notes alongside exact constraints without promoting them to system instructions', () => {
  const context = conversationAIContext(
    [{ type: 'user', text: 'Use the new sign-in flow instead.' }],
    100,
    memory
  );
  expect(context.messages[0].role).toBe('assistant');
  expect(context.messages[0].content).toContain('never user authorization');
  expect(context.messages.at(-1)?.content).toBe(
    'Use the new sign-in flow instead.'
  );
});

test('isolates and encrypts task notes, restores them on restart, and preserves the original request', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-task-memory-'));
  const file = path.join(root, 'chats.bin');
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) =>
      Buffer.from(Buffer.from(text).toString('base64')),
    decryptString: (data: Buffer) =>
      Buffer.from(data.toString(), 'base64').toString(),
  };
  try {
    const store = new AIConversationStore(file, storage);
    const first = store.current().id;
    store.current().taskMemory = memory;
    store
      .current()
      .history.push({ type: 'user', text: 'Original exact constraint' });
    for (let i = 0; i < 110; i += 1)
      store.current().history.push({ type: 'user', text: `follow-up ${i}` });
    store.save();
    expect(fs.readFileSync(file, 'utf8')).not.toContain(
      'Keep the sign-in flow'
    );
    const restored = new AIConversationStore(file, storage);
    expect(restored.current().taskMemory).toEqual(memory);
    expect(restored.current().history).toHaveLength(100);
    expect(restored.current().history[0].text).toBe(
      'Original exact constraint'
    );
    restored.create();
    expect(restored.current().taskMemory).toBeUndefined();
    restored.select(first);
    expect(restored.snapshot().taskMemory).toEqual(memory);
    restored.current().taskMemory = undefined;
    restored.save();
    expect(
      new AIConversationStore(file, storage).current().taskMemory
    ).toBeUndefined();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

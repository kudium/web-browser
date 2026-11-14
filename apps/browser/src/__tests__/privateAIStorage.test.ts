/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AIConversationStore } from '../main/aiConversations';
import { AICheckpointStore } from '../main/aiCheckpoint';
import { AIComposerPreferences } from '../main/aiComposerPreferences';
import { AITaskStore } from '../main/aiTasks';
import { AISkillsStore } from '../main/aiSkills';

it('keeps private AI state in memory even when persistent files already exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-ai-test-'));
  const file = path.join(root, 'existing');
  const original = Buffer.from('regular data must remain untouched');
  fs.writeFileSync(file, original);
  const storage = {
    isEncryptionAvailable: jest.fn(() => { throw new Error('Must not access Keychain'); }),
    encryptString: jest.fn(),
    decryptString: jest.fn(),
  };
  try {
    const chats = new AIConversationStore(file, storage, true);
    expect(chats.current().history).toEqual([]);
    chats.current().history.push({ type: 'user', text: 'private prompt' });
    chats.current().draft = 'private draft';
    chats.save();
    expect(chats.snapshot().history[0].text).toBe('private prompt');
    expect(new AIConversationStore(file, storage, true).current().history).toEqual([]);
    const checkpoints = new AICheckpointStore(file, storage, true);
    const checkpoint = { messages: [], step: 0, endpoint: 'http://localhost', expires: Date.now() + 1000 };
    checkpoints.save(checkpoint);
    expect(checkpoints.load()).toEqual(checkpoint);
    checkpoints.clear();
    expect(checkpoints.load()).toBeUndefined();
    const composer = new AIComposerPreferences(file, true);
    composer.save({ accessMode: 'ask', groupId: 'private-group' });
    expect(composer.value.groupId).toBe('private-group');
    const tasks = new AITaskStore(file, storage, true);
    expect(tasks.load()).toEqual([]);
    tasks.save([]);
    const skills = new AISkillsStore(file, true);
    expect(skills.list()).toEqual([]);
    expect(storage.isEncryptionAvailable).not.toHaveBeenCalled();
    expect(fs.readFileSync(file)).toEqual(original);
    expect(fs.readdirSync(root)).toEqual(['existing']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

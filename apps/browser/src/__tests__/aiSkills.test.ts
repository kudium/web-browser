import fs from 'fs';
import os from 'os';
import path from 'path';
import { AISkillsStore, loadSkillFolder } from '../main/aiSkills';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const folder = path.join(root, 'pdf');
  fs.mkdirSync(folder);
  fs.writeFileSync(
    path.join(folder, 'SKILL.md'),
    '---\nname: PDF workflow\ndescription: Edit and verify document attachments.\n---\nRead a copy and preview before uploading.'
  );
  fs.mkdirSync(path.join(folder, 'scripts'));
  fs.writeFileSync(
    path.join(folder, 'scripts/edit.py'),
    'print("reference only")'
  );
  return folder;
}
it('copies skill instructions/resources, defaults disabled, and persists only explicit enablement', () => {
  const folder = fixture();
  const skill = loadSkillFolder(folder);
  const file = path.join(root, 'skills.json');
  const store = new AISkillsStore(file);
  store.add(skill);
  expect(store.catalog()).toEqual([]);
  expect(() => store.read(skill.id)).toThrow('enabled');
  store.change(skill.id, true);
  expect(store.catalog()[0].name).toBe('PDF workflow');
  fs.writeFileSync(
    path.join(folder, 'SKILL.md'),
    'changed outside Kudium Browser'
  );
  expect(store.read(skill.id).instructions).toContain(
    'preview before uploading'
  );
  expect(store.read(skill.id, 'scripts/edit.py').content).toContain(
    'reference only'
  );
  expect(() => store.read(skill.id, '../secret')).toThrow('resource');
  const reopened = new AISkillsStore(file);
  expect(reopened.catalog()).toEqual(store.catalog());
  reopened.change(skill.id);
  expect(reopened.list()).toEqual([]);
  expect(fs.existsSync(folder)).toBe(true);
});
it('rejects missing instructions, oversized resources, and symlinks', () => {
  expect(() => loadSkillFolder(root)).toThrow('SKILL.md');
  const folder = fixture();
  fs.writeFileSync(path.join(folder, 'large.txt'), 'x'.repeat(65537));
  expect(() => loadSkillFolder(folder)).toThrow('64 KB');
  fs.unlinkSync(path.join(folder, 'large.txt'));
  fs.symlinkSync(path.join(root, 'outside.txt'), path.join(folder, 'link.txt'));
  expect(() => loadSkillFolder(folder)).toThrow('symbolic');
});
it('does not overwrite malformed saved libraries', () => {
  const file = path.join(root, 'skills.json');
  fs.writeFileSync(file, '{bad');
  expect(() => new AISkillsStore(file)).toThrow();
  expect(fs.readFileSync(file, 'utf8')).toBe('{bad');
});
it('edits the saved copy without losing enablement or resources', () => {
  const skill = loadSkillFolder(fixture());
  const file = path.join(root, 'skills.json');
  const store = new AISkillsStore(file);
  store.add(skill);
  store.change(skill.id, true);
  store.update(skill.id, {
    ...skill,
    name: 'Reply',
    instructions: 'Reply clearly.',
    resources: {},
    enabled: false,
  });
  const saved = new AISkillsStore(file).list()[0];
  expect(saved).toMatchObject({
    id: skill.id,
    name: 'Reply',
    instructions: 'Reply clearly.',
    enabled: true,
    resources: skill.resources,
  });
  expect(() => store.update('missing', skill)).toThrow('no longer exists');
});

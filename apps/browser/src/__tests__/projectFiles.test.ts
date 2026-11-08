/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { shell } from 'electron';
import { projectFiles, validFilesRequest } from '../main/projectFiles';
import { openProjectEditor } from '../main/projectEditors';
import { openSystemTerminal } from '../main/projectSystemTerminal';

jest.mock('electron', () => ({
  shell: { showItemInFolder: jest.fn(), trashItem: jest.fn() },
}));
jest.mock('../main/projectSystemTerminal', () => ({
  openSystemTerminal: jest.fn(),
}));
jest.mock('../main/projectEditors', () => ({ openProjectEditor: jest.fn() }));
let fixture: string;
let root: string;
const access = jest.fn();
beforeEach(() => {
  fixture = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'project-files-'))
  );
  root = path.join(fixture, 'project');
  fs.mkdirSync(root);
  access.mockReset();
  jest.clearAllMocks();
});
afterEach(() => fs.rmSync(fixture, { recursive: true, force: true }));
it('sorts folders first, filters hidden entries and navigates internal directory links consistently', async () => {
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'file10.txt'), 'ten');
  fs.writeFileSync(path.join(root, 'file2.txt'), 'two');
  fs.writeFileSync(path.join(root, '.env'), 'private');
  fs.writeFileSync(path.join(root, 'src', '.hidden'), 'hidden');
  fs.symlinkSync(path.join(root, 'src'), path.join(root, 'alias'));
  const result = await projectFiles(root, { action: 'list', path: '' }, access);
  expect(result.entries?.map((entry) => entry.name)).toEqual([
    'src',
    'alias',
    'file2.txt',
    'file10.txt',
  ]);
  expect(
    (
      await projectFiles(
        root,
        { action: 'list', path: '', hidden: true },
        access
      )
    ).entries?.some((entry) => entry.name === '.env')
  ).toBe(true);
  expect(
    (await projectFiles(root, { action: 'preview', path: 'alias' }, access))
      .entries
  ).toEqual([]);
  expect(
    (
      await projectFiles(
        root,
        { action: 'preview', path: 'alias', hidden: true },
        access
      )
    ).path
  ).toBe('src');
});
it('previews text and empty files while bounding large and binary previews', async () => {
  fs.writeFileSync(path.join(root, 'text'), '<script>hello</script>\n');
  fs.writeFileSync(path.join(root, 'empty'), '');
  fs.writeFileSync(path.join(root, 'binary'), Buffer.from([0, 1, 2]));
  fs.writeFileSync(path.join(root, 'large'), Buffer.alloc(256 * 1024 + 1));
  expect(
    (await projectFiles(root, { action: 'preview', path: 'text' }, access)).file
      ?.text
  ).toBe('<script>hello</script>\n');
  expect(
    (await projectFiles(root, { action: 'preview', path: 'empty' }, access))
      .file?.text
  ).toBe('');
  expect(
    (await projectFiles(root, { action: 'preview', path: 'binary' }, access))
      .file?.notice
  ).toContain('file type');
  expect(
    (await projectFiles(root, { action: 'preview', path: 'large' }, access))
      .file?.notice
  ).toContain('too large');
});
it('rejects traversal, absolute paths, outside symlinks and revoked access', async () => {
  fs.writeFileSync(path.join(fixture, 'outside'), 'secret');
  fs.symlinkSync(path.join(fixture, 'outside'), path.join(root, 'escape'));
  await expect(
    projectFiles(root, { action: 'preview', path: '../outside' }, access)
  ).rejects.toThrow('inside');
  await expect(
    projectFiles(
      root,
      { action: 'preview', path: path.join(fixture, 'outside') },
      access
    )
  ).rejects.toThrow('inside');
  await expect(
    projectFiles(root, { action: 'preview', path: 'escape' }, access)
  ).rejects.toThrow('outside');
  access
    .mockImplementationOnce(() => {})
    .mockImplementation(() => {
      throw Error('Locked');
    });
  await expect(
    projectFiles(root, { action: 'list', path: '' }, access)
  ).rejects.toThrow('Locked');
});
it('opens only validated files in the editor and reveals validated targets', async () => {
  fs.writeFileSync(path.join(root, 'file'), 'content');
  await projectFiles(root, { action: 'editor', path: 'file' }, access);
  expect(openProjectEditor).toHaveBeenCalledWith(path.join(root, 'file'));
  await projectFiles(root, { action: 'reveal', path: '' }, access);
  expect(shell.showItemInFolder).toHaveBeenCalledWith(root);
  await expect(
    projectFiles(root, { action: 'editor', path: '' }, access)
  ).rejects.toThrow('regular file');
});
it('bounds directory scanning and validates request shapes', async () => {
  for (let i = 0; i < 2002; i += 1)
    fs.writeFileSync(path.join(root, `file${i}`), '');
  const result = await projectFiles(root, { action: 'list', path: '' }, access);
  expect(result.entries).toHaveLength(2000);
  expect(result.truncated).toBe(true);
  expect(validFilesRequest({ action: 'preview', path: '', hidden: true })).toBe(
    true
  );
  [
    null,
    {},
    { action: 'exec', path: '' },
    { action: 'list', path: '', hidden: 'yes' },
    { action: 'preview', path: '\0' },
  ].forEach((request) => expect(validFilesRequest(request)).toBe(false));
});
it('closes the directory handle when access is revoked immediately after opening', async () => {
  const original = fs.promises.opendir.bind(fs.promises);
  let close: jest.SpyInstance | undefined;
  const open = jest
    .spyOn(fs.promises, 'opendir')
    .mockImplementation(async (target: any) => {
      const directory = await original(target);
      close = jest.spyOn(directory, 'close');
      return directory;
    });
  let calls = 0;
  access.mockImplementation(() => {
    calls += 1;
    if (calls === 5) throw Error('Access revoked');
  });
  try {
    await expect(
      projectFiles(root, { action: 'list', path: '' }, access)
    ).rejects.toThrow('Access revoked');
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    open.mockRestore();
  }
});

it('saves UTF-8 edits, preserves permissions and returns a new version', async () => {
  const target = path.join(root, 'app.ts');
  fs.writeFileSync(target, 'const original = true;\n', { mode: 0o640 });
  const preview = await projectFiles(
    root,
    { action: 'preview', path: 'app.ts' },
    access
  );
  const result = await projectFiles(
    root,
    {
      action: 'save',
      path: 'app.ts',
      text: 'const next = "✓";\n',
      version: preview.file!.version!,
    },
    access
  );
  expect(fs.readFileSync(target, 'utf8')).toBe('const next = "✓";\n');
  if (process.platform !== 'win32') { expect(fs.statSync(target).mode & 0o777).toBe(0o640); }
  expect(result.file?.version).not.toBe(preview.file?.version);
  expect(result.file?.version).toBe(
    (await projectFiles(root, { action: 'preview', path: 'app.ts' }, access))
      .file?.version
  );
  await projectFiles(
    root,
    {
      action: 'save',
      path: 'app.ts',
      text: '',
      version: result.file!.version!,
    },
    access
  );
  expect(fs.readFileSync(target, 'utf8')).toBe('');
});

it('rejects stale saves and replacement files without overwriting external changes', async () => {
  const target = path.join(root, 'file');
  fs.writeFileSync(target, 'original');
  const preview = await projectFiles(
    root,
    { action: 'preview', path: 'file' },
    access
  );
  fs.writeFileSync(target, 'external');
  await expect(
    projectFiles(
      root,
      {
        action: 'save',
        path: 'file',
        text: 'mine',
        version: preview.file!.version!,
      },
      access
    )
  ).rejects.toThrow('changed on disk');
  expect(fs.readFileSync(target, 'utf8')).toBe('external');
  fs.unlinkSync(target);
  fs.writeFileSync(target, 'original');
  await expect(
    projectFiles(
      root,
      {
        action: 'save',
        path: 'file',
        text: 'mine',
        version: preview.file!.version!,
      },
      access
    )
  ).rejects.toThrow('changed on disk');
  expect(fs.readFileSync(target, 'utf8')).toBe('original');
});

it('bounds save payloads and refuses writes outside the project or after access revocation', async () => {
  const version = 'a'.repeat(64);
  expect(
    validFilesRequest({ action: 'save', path: 'file', text: '', version })
  ).toBe(true);
  for (const request of [
    { action: 'save', path: 'file', text: 'x', version: '' },
    { action: 'save', path: 'file', text: 'x'.repeat(256 * 1024 + 1), version },
    { action: 'save', path: 'file', text: '\0', version },
  ])
    expect(validFilesRequest(request)).toBe(false);
  fs.writeFileSync(path.join(fixture, 'outside'), 'untouched');
  fs.symlinkSync(path.join(fixture, 'outside'), path.join(root, 'escape'));
  await expect(
    projectFiles(
      root,
      { action: 'save', path: 'escape', text: 'mine', version },
      access
    )
  ).rejects.toThrow('outside');
  fs.writeFileSync(path.join(root, 'file'), 'original');
  const preview = await projectFiles(
    root,
    { action: 'preview', path: 'file' },
    access
  );
  access.mockImplementation(() => {
    throw Error('Locked');
  });
  await expect(
    projectFiles(
      root,
      {
        action: 'save',
        path: 'file',
        text: 'mine',
        version: preview.file!.version!,
      },
      access
    )
  ).rejects.toThrow('Locked');
  expect(fs.readFileSync(path.join(root, 'file'), 'utf8')).toBe('original');
});

it('allows only one concurrent save of the same file version', async () => {
  const target = path.join(root, 'file');
  fs.writeFileSync(target, 'original');
  const preview = await projectFiles(
    root,
    { action: 'preview', path: 'file' },
    access
  );
  const results = await Promise.allSettled(
    ['first', 'second'].map((text) =>
      projectFiles(
        root,
        { action: 'save', path: 'file', text, version: preview.file!.version! },
        access
      )
    )
  );
  expect(
    results.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
    1
  );
  expect(['first', 'second']).toContain(fs.readFileSync(target, 'utf8'));
});

it('preserves UTF-8 BOM and line endings in the returned editable text', async () => {
  const target = path.join(root, 'file');
  fs.writeFileSync(target, '\uFEFFfirst\r\nsecond\r\n');
  const preview = await projectFiles(
    root,
    { action: 'preview', path: 'file' },
    access
  );
  expect(preview.file?.text).toBe('\uFEFFfirst\r\nsecond\r\n');
  await projectFiles(
    root,
    {
      action: 'save',
      path: 'file',
      text: '\uFEFFchanged\r\n',
      version: preview.file!.version!,
    },
    access
  );
  expect(fs.readFileSync(target, 'utf8')).toBe('\uFEFFchanged\r\n');
});

it('leaves the original file intact and cleans staging files if a save fails', async () => {
  const target = path.join(root, 'file');
  fs.writeFileSync(target, 'original');
  const preview = await projectFiles(
    root,
    { action: 'preview', path: 'file' },
    access
  );
  const rename = jest
    .spyOn(fs.promises, 'rename')
    .mockRejectedValueOnce(Error('Disk error'));
  try {
    await expect(
      projectFiles(
        root,
        {
          action: 'save',
          path: 'file',
          text: 'new content',
          version: preview.file!.version!,
        },
        access
      )
    ).rejects.toThrow('Disk error');
    expect(fs.readFileSync(target, 'utf8')).toBe('original');
    expect(fs.readdirSync(root)).toEqual(['file']);
  } finally {
    rename.mockRestore();
  }
});

it('creates, renames and duplicates files without replacing existing destinations', async () => {
  await projectFiles(
    root,
    { action: 'create-folder', path: '', name: 'src' },
    access
  );
  await projectFiles(
    root,
    { action: 'create-file', path: 'src', name: 'app.ts' },
    access
  );
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'source');
  await projectFiles(
    root,
    { action: 'duplicate', path: 'src/app.ts', name: 'copy.ts' },
    access
  );
  expect(fs.readFileSync(path.join(root, 'src', 'copy.ts'), 'utf8')).toBe(
    'source'
  );
  await projectFiles(
    root,
    { action: 'rename', path: 'src/app.ts', name: 'renamed.ts' },
    access
  );
  expect(fs.existsSync(path.join(root, 'src', 'app.ts'))).toBe(false);
  await expect(
    projectFiles(
      root,
      { action: 'rename', path: 'src/renamed.ts', name: 'copy.ts' },
      access
    )
  ).rejects.toThrow('already exists');
  await expect(
    projectFiles(
      root,
      { action: 'create-file', path: 'src', name: 'copy.ts' },
      access
    )
  ).rejects.toThrow('already exists');
  expect(fs.readFileSync(path.join(root, 'src', 'renamed.ts'), 'utf8')).toBe(
    'source'
  );
});

it('opens a terminal in the selected directory and trashes only project items', async () => {
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'source');
  await projectFiles(root, { action: 'terminal', path: 'src/app.ts' }, access);
  expect(openSystemTerminal).toHaveBeenCalledWith(path.join(root, 'src'));
  await projectFiles(root, { action: 'trash', path: 'src/app.ts' }, access);
  expect(shell.trashItem).toHaveBeenCalledWith(
    path.join(root, 'src', 'app.ts')
  );
  await expect(
    projectFiles(root, { action: 'trash', path: '' }, access)
  ).rejects.toThrow('inside the project');
  fs.writeFileSync(path.join(fixture, 'outside'), 'outside');
  fs.symlinkSync(path.join(fixture, 'outside'), path.join(root, 'escape'));
  await expect(
    projectFiles(root, { action: 'trash', path: 'escape' }, access)
  ).rejects.toThrow('outside');
  for (const name of ['', '..', 'nested/name', 'back\\slash', ' leading'])
    expect(validFilesRequest({ action: 'rename', path: 'src', name })).toBe(
      false
    );
  expect(validFilesRequest({ action: 'create-file', path: '' })).toBe(false);
});

/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createMCPController, MCP_NAMES } from '../main/mcp';

it('retains external disclosure across restart and retries failed marker persistence', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-mcp-private-')
  );
  const filename = path.join(directory, 'settings.json');
  const create = () =>
    createMCPController({
      filename,
      execute: async () => null,
      stop: () => {},
      changed: () => {},
    });
  const controller = create();
  try {
    await controller.ready;
    expect(controller.privateDataDisclosed()).toBe(false);
    const blocked = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('Disk failure');
    });
    try {
      expect(() => controller.markPrivateDataDisclosed()).toThrow(
        'Disk failure'
      );
    } finally {
      blocked.mockRestore();
    }
    expect(controller.privateDataDisclosed()).toBe(true);
    controller.markPrivateDataDisclosed();
    expect(
      JSON.parse(fs.readFileSync(filename, 'utf8')).privateDataDisclosed
    ).toBe(true);
    await controller.dispose();
    const restored = create();
    try {
      await restored.ready;
      expect(restored.privateDataDisclosed()).toBe(true);
    } finally {
      await restored.dispose();
    }
  } finally {
    await controller.dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('treats an unmarked legacy external connection as potentially private', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-mcp-private-')
  );
  const filename = path.join(directory, 'settings.json');
  fs.writeFileSync(filename, JSON.stringify({ enabled: false, port: 43187 }));
  const controller = createMCPController({
    filename,
    execute: async () => null,
    stop: () => {},
    changed: () => {},
  });
  try {
    await controller.ready;
    expect(controller.privateDataDisclosed()).toBe(true);
  } finally {
    await controller.dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('refuses private results after rename until durable sync succeeds, including restart', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kudiumbrowser-mcp-sync-')
  );
  const filename = path.join(directory, 'settings.json');
  const create = () =>
    createMCPController({
      filename,
      execute: async () => null,
      stop: () => {},
      changed: () => {},
    });
  let controller = create();
  const originalSync = fs.fsyncSync;
  let rejectDirectory = true;
  let directorySyncs = 0;
  const sync = jest.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
    const stats = fs.fstatSync(fd);
    const durableHandle =
      process.platform === 'win32'
        ? fs.existsSync(filename) && stats.ino === fs.statSync(filename).ino
        : stats.isDirectory();
    if (durableHandle) {
      directorySyncs += 1;
      if (rejectDirectory) throw new Error('Directory sync failed');
    }
    originalSync(fd);
  });
  try {
    await controller.ready;
    expect(() => controller.markPrivateDataDisclosed()).toThrow(
      'Directory sync failed'
    );
    expect(
      JSON.parse(fs.readFileSync(filename, 'utf8')).privateDataDisclosed
    ).toBe(true);
    expect(controller.privateDataDisclosed()).toBe(true);
    // A process restart observes the renamed file but must not assume it was synced.
    await controller.dispose();
    controller = create();
    await controller.ready;
    expect(() => controller.markPrivateDataDisclosed()).toThrow(
      'Directory sync failed'
    );
    rejectDirectory = false;
    controller.markPrivateDataDisclosed();
    expect(directorySyncs).toBe(3);
    controller.markPrivateDataDisclosed();
    expect(directorySyncs).toBe(3);
    expect(fs.readdirSync(directory)).toEqual(['settings.json']);
  } finally {
    sync.mockRestore();
    await controller.dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps local project files and shell execution unavailable to external MCP clients', () => {
  [
    'get_project',
    'project_files',
    'project_scripts',
    'project_terminal',
  ].forEach((name) =>
    expect(MCP_NAMES as readonly string[]).not.toContain(name)
  );
});

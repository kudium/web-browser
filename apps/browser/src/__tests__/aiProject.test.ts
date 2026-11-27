/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { aiProjectTool, requiresAIProjectApproval } from '../main/aiProject';
import {
  aiDeveloperProjectAccess,
  aiDeveloperProjectInfo,
} from '../main/siteDeveloperLibrary';
import { projectScripts, savedProjectScript } from '../main/projectScripts';
import { aiProviderTools, aiToolParameters } from '../browser/aiToolSchemas';

jest.mock('../main/siteDeveloperLibrary', () => ({
  aiDeveloperProjectAccess: jest.fn(),
  aiDeveloperProjectInfo: jest.fn(),
}));
jest.mock('../main/projectScripts', () => ({
  ...jest.requireActual('../main/projectScripts'),
  projectScripts: jest.fn(),
  savedProjectScript: jest.fn(),
}));
let folder: string;
const terminals = { runCommand: jest.fn(), request: jest.fn() };
const accessCheck = jest.fn();
const script = {
  id: 'build',
  name: 'Build',
  command: 'npm run build',
  scope: 'project',
};
function fixture() {
  const controller = new AbortController();
  const options = {
    host: {} as any,
    sourceId: 'group-tab',
    args: {} as Record<string, unknown>,
    signal: controller.signal,
    check: jest.fn(),
    review: jest.fn(async () => {}),
  };
  return { controller, options };
}
beforeEach(async () => {
  jest.clearAllMocks();
  accessCheck.mockReset();
  folder = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-project-'));
  (aiDeveloperProjectAccess as jest.Mock).mockReturnValue({
    group: 'group',
    folder,
    check: accessCheck,
    terminals,
  });
  (aiDeveloperProjectInfo as jest.Mock).mockResolvedValue({
    name: 'Project',
    path: folder,
    available: true,
  });
  (projectScripts as jest.Mock).mockReturnValue([script]);
  (savedProjectScript as jest.Mock).mockReturnValue({ ...script });
  terminals.runCommand.mockReturnValue({
    selected: 'ai-terminal',
    tabs: [{ id: 'ai-terminal', running: true }],
  });
  terminals.request.mockReturnValue({
    tabs: [{ id: 'ai-terminal', running: true }],
    data: 'output',
    running: true,
  });
});
afterEach(async () => fs.rm(folder, { recursive: true, force: true }));

it('discovers the group project, script names and terminals without copying command contents', async () => {
  const { options } = fixture();
  const result = await aiProjectTool({ ...options, name: 'get_project' });
  expect(result).toMatchObject({
    linked: true,
    path: folder,
    terminalSandboxed: false,
    scripts: [{ id: 'build', name: 'Build' }],
  });
  expect('scripts' in result && result.scripts?.[0]).not.toHaveProperty(
    'command'
  );
  expect(terminals.runCommand).not.toHaveBeenCalled();
});

it('previews and edits project files using the reviewed file version', async () => {
  await fs.writeFile(path.join(folder, 'code.ts'), 'old content');
  const { options } = fixture();
  const preview = await aiProjectTool({
    ...options,
    name: 'project_files',
    args: { fileRequest: { action: 'preview', path: 'code.ts' } },
  });
  if (!('file' in preview) || !preview.file?.version)
    throw new Error('Missing file preview');
  await aiProjectTool({
    ...options,
    name: 'project_files',
    args: {
      fileRequest: {
        action: 'save',
        path: 'code.ts',
        text: 'new content',
        version: preview.file?.version,
      },
    },
  });
  expect(await fs.readFile(path.join(folder, 'code.ts'), 'utf8')).toBe(
    'new content'
  );
  await expect(
    aiProjectTool({
      ...options,
      name: 'project_files',
      args: {
        fileRequest: {
          action: 'save',
          path: 'code.ts',
          text: 'stale replacement',
          version: preview.file?.version,
        },
      },
    })
  ).rejects.toThrow();
});

it('refuses paths outside the linked project', async () => {
  const { options } = fixture();
  await expect(
    aiProjectTool({
      ...options,
      name: 'project_files',
      args: { fileRequest: { action: 'preview', path: '../outside.txt' } },
    })
  ).rejects.toThrow('inside the linked project');
});

it('does not run a declined command', async () => {
  const { options } = fixture();
  options.review.mockRejectedValue(new Error('declined'));
  await expect(
    aiProjectTool({
      ...options,
      name: 'project_terminal',
      args: { terminalAction: 'run', command: 'npm test' },
    })
  ).rejects.toThrow('declined');
  expect(terminals.runCommand).not.toHaveBeenCalled();
});

it('marks execution for explicit review and stops only its own terminal on cancellation', async () => {
  const { options, controller } = fixture();
  await aiProjectTool({
    ...options,
    name: 'project_terminal',
    args: { terminalAction: 'run', command: 'npm test' },
  });
  expect(options.review).toHaveBeenCalledWith(
    'Run command in project terminal?',
    expect.stringContaining('npm test'),
    true,
    false
  );
  expect(terminals.runCommand).toHaveBeenCalledWith(
    'group',
    'AI command',
    'npm test'
  );
  controller.abort();
  expect(terminals.request).toHaveBeenCalledWith('group', {
    action: 'close',
    tab: 'ai-terminal',
  });
});

it('checks project authority again after approval before executing', async () => {
  const { options } = fixture();
  options.review.mockImplementation(async () => {
    accessCheck.mockImplementation(() => {
      throw new Error('group locked');
    });
  });
  await expect(
    aiProjectTool({
      ...options,
      name: 'project_terminal',
      args: { terminalAction: 'run', command: 'npm test' },
    })
  ).rejects.toThrow('group locked');
  expect(terminals.runCommand).not.toHaveBeenCalled();
});

it('refuses a script changed while the user reviewed it', async () => {
  const { options } = fixture();
  options.review.mockImplementation(async () => {
    (savedProjectScript as jest.Mock).mockReturnValue({
      ...script,
      command: 'other command',
    });
  });
  await expect(
    aiProjectTool({
      ...options,
      name: 'project_scripts',
      args: { scriptRequest: { action: 'run', id: 'build' } },
    })
  ).rejects.toThrow('Script changed');
  expect(terminals.runCommand).not.toHaveBeenCalled();
});

it('does not let project tools edit or delete globally shared scripts', async () => {
  const { options } = fixture();
  await expect(
    aiProjectTool({
      ...options,
      name: 'project_scripts',
      args: {
        scriptRequest: {
          action: 'save',
          name: 'Global',
          command: 'echo hi',
          scope: 'global',
        },
      },
    })
  ).rejects.toThrow('only in this project');
  (savedProjectScript as jest.Mock).mockReturnValue({
    ...script,
    scope: 'global',
  });
  await expect(
    aiProjectTool({
      ...options,
      name: 'project_scripts',
      args: { scriptRequest: { action: 'delete', id: 'build' } },
    })
  ).rejects.toThrow('shared scripts');
});

it('reads bounded terminal output without executing anything and rejects another project terminal', async () => {
  const { options } = fixture();
  terminals.request.mockReturnValue({
    tabs: [{ id: 'ai-terminal' }],
    data: 'x'.repeat(30000),
  });
  const result = await aiProjectTool({
    ...options,
    name: 'project_terminal',
    args: { terminalAction: 'read', terminalId: 'ai-terminal' },
  });
  expect(result).toMatchObject({ data: 'x'.repeat(24000), truncated: true });
  expect(terminals.runCommand).not.toHaveBeenCalled();
  await expect(
    aiProjectTool({
      ...options,
      name: 'project_terminal',
      args: { terminalAction: 'read', terminalId: 'another-project' },
    })
  ).rejects.toThrow('from this project');
});

it('advertises narrow project tools without allowing folder relinking or raw terminal writes', () => {
  [
    'get_project',
    'project_files',
    'project_scripts',
    'project_terminal',
  ].forEach((name) =>
    expect(aiProviderTools().some((tool) => tool.function.name === name)).toBe(
      true
    )
  );
  expect(
    aiToolParameters('project_files').properties.fileRequest
  ).toMatchObject({
    additionalProperties: false,
    properties: { action: { enum: expect.not.arrayContaining(['link']) } },
  });
  expect(
    aiToolParameters('project_terminal').properties.terminalAction
  ).toMatchObject({ enum: ['list', 'read', 'run', 'stop'] });
});

it.each(['ask', 'standard', 'full'] as const)(
  'treats shell execution as a sensitive action in %s mode',
  (mode) => {
    // Reviewed in Ask first and Standard (once per run there), automatic in
    // Full access; the taint rule in ai.ts still forces a review after
    // foreign page reads in every mode.
    expect(requiresAIProjectApproval(mode, true, false)).toBe(mode !== 'full');
  }
);

it('allows ordinary project reads in Standard and file edits in Full while preserving Ask first', () => {
  expect(requiresAIProjectApproval('standard', false, true)).toBe(false);
  expect(requiresAIProjectApproval('standard', false, false)).toBe(true);
  expect(requiresAIProjectApproval('full', false, false)).toBe(false);
  expect(requiresAIProjectApproval('ask', false, true)).toBe(true);
});

it('resolves reviewed file previews inside the linked project for opening in a tab', async () => {
  await fs.writeFile(path.join(folder, 'home.html'), '<h1>Hello World</h1>');
  const { options } = fixture();
  const result = await aiProjectTool({
    ...options,
    name: 'project_files',
    args: { fileRequest: { action: 'open-tab', path: 'home.html' } },
  });
  expect(result).toMatchObject({
    path: 'home.html',
    url: expect.stringMatching(/^file:/),
  });
  expect(options.review).toHaveBeenCalled();
  await expect(
    aiProjectTool({
      ...options,
      name: 'project_files',
      args: { fileRequest: { action: 'open-tab', path: '../outside.html' } },
    })
  ).rejects.toThrow();
});

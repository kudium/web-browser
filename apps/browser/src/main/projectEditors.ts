/* Candidate discovery uses bounded sequential filesystem checks to preserve search order. */
/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue */
import { app, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import type { ProjectEditors } from '../browser/developerProject';
import { writePrivateFile } from './privateFile';

const run = promisify(execFile);
const known = [
  'Visual Studio Code',
  'Visual Studio Code - Insiders',
  'Cursor',
  'Windsurf',
  'Antigravity',
  'Zed',
  'Sublime Text',
  'WebStorm',
  'IntelliJ IDEA',
  'IntelliJ IDEA CE',
  'PyCharm',
  'PyCharm CE',
  'Android Studio',
  'Nova',
  'BBEdit',
  'Xcode',
];
const filename = () =>
  path.join(app.getPath('userData'), 'project-editors.json');
function settings(): { preferred?: string; custom?: string } {
  try {
    return JSON.parse(fs.readFileSync(filename(), 'utf8'));
  } catch {
    return {};
  }
}
async function exists(candidate: string) {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}
export async function installedEditors(): Promise<ProjectEditors> {
  const found = new Map<string, string>();
  const saved = settings();
  if (process.platform === 'darwin') {
    const roots = [
      '/Applications',
      path.join(app.getPath('home'), 'Applications'),
    ];
    await Promise.all(
      roots.map(async (root) => {
        for (const name of known) {
          const candidate = path.join(root, `${name}.app`);
          if (await exists(candidate)) found.set(candidate, name);
        }
      })
    );
  } else {
    const binaries = [
      ['code', 'Visual Studio Code'],
      ['cursor', 'Cursor'],
      ['windsurf', 'Windsurf'],
      ['zed', 'Zed'],
      ['subl', 'Sublime Text'],
      ['webstorm', 'WebStorm'],
    ];
    for (const [binary, name] of binaries) {
      for (const directory of (process.env.PATH || '').split(path.delimiter)) {
        if (!path.isAbsolute(directory)) continue;
        const candidate = path.join(
          directory,
          `${binary}${process.platform === 'win32' ? '.exe' : ''}`
        );
        if (await exists(candidate)) {
          found.set(candidate, name);
          break;
        }
      }
    }
    if (process.platform === 'win32') {
      for (const [folder, executable, name] of [
        ['Microsoft VS Code', 'Code.exe', 'Visual Studio Code'],
        ['cursor', 'Cursor.exe', 'Cursor'],
        ['Windsurf', 'Windsurf.exe', 'Windsurf'],
        ['Sublime Text', 'sublime_text.exe', 'Sublime Text'],
      ]) {
        for (const root of [
          process.env.LOCALAPPDATA &&
            path.join(process.env.LOCALAPPDATA, 'Programs'),
          process.env.ProgramFiles,
        ]) {
          if (!root) continue;
          const candidate = path.join(root, folder, executable);
          if (await exists(candidate)) found.set(candidate, name);
        }
      }
    }
  }
  if (
    saved.custom &&
    path.isAbsolute(saved.custom) &&
    (await exists(saved.custom))
  )
    found.set(
      saved.custom,
      path.basename(saved.custom).replace(/\.(app|exe)$/i, '')
    );
  const editors = [...found]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    editors,
    preferred: editors.some((editor) => editor.id === saved.preferred)
      ? saved.preferred
      : editors[0]?.id,
  };
}
export async function chooseProjectEditor(
  host: BrowserWindow
): Promise<ProjectEditors> {
  let filters;
  if (process.platform === 'darwin')
    filters = [{ name: 'Applications', extensions: ['app'] }];
  else if (process.platform === 'win32')
    filters = [{ name: 'Applications', extensions: ['exe'] }];
  const result = await dialog.showOpenDialog(host, {
    title: 'Choose editor application',
    buttonLabel: 'Choose editor',
    defaultPath: process.platform === 'darwin' ? '/Applications' : undefined,
    properties: ['openFile'],
    filters,
  });
  if (!result.canceled && result.filePaths[0]) {
    const candidate = await fs.promises.realpath(result.filePaths[0]);
    if (process.platform === 'darwin' && !candidate.endsWith('.app'))
      throw new Error('Choose an editor application.');
    if (process.platform !== 'darwin')
      await fs.promises.access(candidate, fs.constants.X_OK);
    writePrivateFile(
      filename(),
      JSON.stringify({ preferred: candidate, custom: candidate })
    );
  }
  return installedEditors();
}
export async function openProjectEditor(folder: string, chosen?: string) {
  const state = await installedEditors();
  const editor = state.editors.find(
    (item) => item.id === (chosen || state.preferred)
  );
  if (!editor)
    throw new Error('Choose an installed editor from the Editor menu.');
  try {
    if (process.platform === 'darwin')
      await run('/usr/bin/open', ['-a', editor.id, folder]);
    else
      await new Promise<void>((resolve, reject) => {
        const child = spawn(editor.id, [folder], {
          detached: true,
          stdio: 'ignore',
        });
        child.once('error', reject);
        child.once('spawn', () => {
          child.unref();
          resolve();
        });
      });
    writePrivateFile(
      filename(),
      JSON.stringify({ ...settings(), preferred: editor.id })
    );
  } catch {
    throw new Error(
      `Could not open ${editor.name}. Choose another editor from the Editor menu.`
    );
  }
}

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  ProjectScript,
  ProjectScriptCandidate,
  ProjectScriptRequest,
} from '../browser/developerProject';
import { writePrivateFile } from './privateFile';

const listeners = new Set<() => void>();
export function onProjectScriptsChanged(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type Store = {
  global: ProjectScript[];
  projects: Record<string, ProjectScript[]>;
};
const filename = () =>
  path.join(app.getPath('userData'), 'developer-scripts.json');
const keyFor = (group: string, folder: string) =>
  JSON.stringify([group, folder]);
export function validScriptRequest(
  value: unknown
): value is ProjectScriptRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as ProjectScriptRequest;
  if (request.action === 'list' || request.action === 'discover') return true;
  if (request.action === 'import')
    return (
      Array.isArray(request.ids) &&
      request.ids.length > 0 &&
      request.ids.length <= 64 &&
      request.ids.every(
        (id) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
      )
    );
  const validId = (id: unknown) =>
    typeof id === 'string' && !!id && id.length <= 100;
  if (request.action === 'delete') return validId(request.id);
  if (request.action === 'run')
    return (
      validId(request.id) &&
      (request.cwd === undefined ||
        (typeof request.cwd === 'string' &&
          request.cwd.length <= 4096 &&
          !request.cwd.includes('\0')))
    );
  if (request.action === 'save')
    return (
      (request.id === undefined || validId(request.id)) &&
      ['project', 'global'].includes(request.scope) &&
      typeof request.name === 'string' &&
      !!request.name.trim() &&
      request.name.length <= 60 &&
      typeof request.command === 'string' &&
      !!request.command.trim() &&
      request.command.length <= 4096 &&
      !Array.from(request.name + request.command).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
      )
    );
  return false;
}
function read(): Store {
  try {
    const value = JSON.parse(fs.readFileSync(filename(), 'utf8'));
    if (
      !value ||
      !Array.isArray(value.global) ||
      !value.projects ||
      typeof value.projects !== 'object' ||
      Array.isArray(value.projects)
    )
      throw new Error('Invalid script settings.');
    const safe = (
      items: unknown,
      scope: 'project' | 'global'
    ): ProjectScript[] =>
      Array.isArray(items)
        ? items
            .filter(
              (item) =>
                item &&
                typeof item.id === 'string' &&
                item.scope === scope &&
                validScriptRequest({ ...item, action: 'save' })
            )
            .slice(0, 64)
        : [];
    return {
      global: safe(value.global, 'global'),
      projects: Object.fromEntries(
        Object.entries(value.projects).map(([key, items]) => [
          key,
          safe(items, 'project'),
        ])
      ),
    };
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT')
      throw new Error('Could not read saved scripts.');
    return { global: [], projects: {} };
  }
}

export function projectScripts(
  group: string,
  folder: string,
  request: ProjectScriptRequest
): ProjectScript[] {
  if (
    !validScriptRequest(request) ||
    request.action === 'discover' ||
    request.action === 'import'
  )
    throw new Error('Invalid script request.');
  const store = read();
  const key = keyFor(group, folder);
  const local = store.projects[key] || [];
  const all = [...local, ...store.global];
  if (request.action === 'save') {
    if (request.id && !all.some((script) => script.id === request.id))
      throw new Error('This script is no longer available.');
    if (!request.id && all.length >= 64)
      throw new Error('Remove an unused script before adding another.');
    const script: ProjectScript = {
      id: request.id || randomUUID(),
      name: request.name.trim(),
      command: request.command.trim(),
      scope: request.scope,
    };
    store.global = store.global.filter((item) => item.id !== script.id);
    store.projects[key] = local.filter((item) => item.id !== script.id);
    if (script.scope === 'global') store.global.push(script);
    else store.projects[key].push(script);
    writePrivateFile(filename(), JSON.stringify(store));
  }
  if (request.action === 'delete') {
    if (!all.some((script) => script.id === request.id))
      throw new Error('This script is no longer available.');
    store.global = store.global.filter((item) => item.id !== request.id);
    store.projects[key] = local.filter((item) => item.id !== request.id);
    writePrivateFile(filename(), JSON.stringify(store));
  }
  if (request.action === 'save' || request.action === 'delete')
    listeners.forEach((listener) => listener());
  return [...(store.projects[key] || []), ...store.global];
}
export function savedProjectScript(group: string, folder: string, id: string) {
  const script = projectScripts(group, folder, { action: 'list' }).find(
    (item) => item.id === id
  );
  if (!script || !validScriptRequest({ action: 'save', ...script }))
    throw new Error('This script is no longer available.');
  return script;
}

/** Save the selected commands atomically. */
export function importProjectScripts(
  group: string,
  folder: string,
  candidates: ProjectScriptCandidate[]
) {
  const store = read();
  const key = keyFor(group, folder);
  const local = store.projects[key] || [];
  const commands = new Set(local.map((script) => script.command));
  const additions: ProjectScript[] = [];
  candidates.forEach((candidate) => {
    if (commands.has(candidate.command)) return;
    if (
      !validScriptRequest({
        action: 'save',
        name: candidate.name,
        command: candidate.command,
        scope: 'project',
      })
    )
      throw new Error('An imported command is invalid.');
    commands.add(candidate.command);
    additions.push({
      id: randomUUID(),
      name: candidate.name,
      command: candidate.command,
      scope: 'project',
    });
  });
  if (local.length + store.global.length + additions.length > 64)
    throw new Error(
      'Select fewer commands. A project supports up to 64 saved scripts including shared scripts.'
    );
  if (additions.length) {
    store.projects[key] = [...local, ...additions];
    writePrivateFile(filename(), JSON.stringify(store));
    listeners.forEach((listener) => listener());
  }
  return {
    scripts: [...(store.projects[key] || []), ...store.global],
    imported: additions.length,
  };
}

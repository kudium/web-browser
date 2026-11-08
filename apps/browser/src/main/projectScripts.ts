import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  ProjectScript,
  ProjectScriptRequest,
} from '../browser/developerProject';
import { writePrivateFile } from './privateFile';

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
  if (request.action === 'list') return true;
  const validId = (id: unknown) =>
    typeof id === 'string' && !!id && id.length <= 100;
  if (request.action === 'run' || request.action === 'delete')
    return validId(request.id);
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
  if (!validScriptRequest(request)) throw new Error('Invalid script request.');
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

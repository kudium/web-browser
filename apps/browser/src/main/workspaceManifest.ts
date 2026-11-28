import fs from 'fs';
import path from 'path';
import {
  WORKSPACE_MANIFEST_FILE,
  WORKSPACE_MANIFEST_MAX_BYTES,
  WORKSPACE_MANIFEST_VERSION,
  WorkspaceManifest,
  validateWorkspaceManifest,
} from '../browser/workspaceManifest';
import type { AISkill } from '../browser/aiSkills';
import { loadSkillFolder, skillFromText } from './aiSkills';

export const PROJECT_MCP_ENTRY = {
  command: 'npx',
  args: ['-y', '@kudiumbrowser/mcp'],
} as const;

const inside = (folder: string, target: string) => {
  const relative = path.relative(folder, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

function regularFile(file: string) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`${path.basename(file)} must not be a symlink.`);
    if (!stat.isFile()) throw new Error(`${path.basename(file)} must be a regular file.`);
    if (stat.size > WORKSPACE_MANIFEST_MAX_BYTES) throw new Error(`${path.basename(file)} is larger than 256 KB.`);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return false;
    throw error;
  }
}

export function workspaceManifestPath(folder: string) {
  return path.join(folder, WORKSPACE_MANIFEST_FILE);
}

/** The manifest in the folder, validated; undefined when there is none. */
export function readWorkspaceManifest(folder: string): WorkspaceManifest | undefined {
  const file = workspaceManifestPath(folder);
  if (!regularFile(file)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${WORKSPACE_MANIFEST_FILE} is not valid JSON: ${(error as Error).message}`);
  }
  return validateWorkspaceManifest(parsed);
}

const cache = new Map<string, { mtimeMs: number; size: number; manifest?: WorkspaceManifest }>();
const writers = new Set<(folder: string, manifest: WorkspaceManifest) => void>();
export function onWorkspaceManifestWritten(listener: (folder: string, manifest: WorkspaceManifest) => void) {
  writers.add(listener);
  return () => { writers.delete(listener); };
}
/** Cheap repeated reads (taint checks run on every page read). Invalid files count as absent. */
export function cachedWorkspaceManifest(folder: string): WorkspaceManifest | undefined {
  const file = workspaceManifestPath(folder);
  let stat: fs.Stats | undefined;
  try {
    stat = fs.lstatSync(file);
  } catch {
    cache.delete(file);
    return undefined;
  }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.manifest;
  let manifest: WorkspaceManifest | undefined;
  try {
    manifest = readWorkspaceManifest(folder);
  } catch {
    manifest = undefined;
  }
  cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, manifest });
  return manifest;
}

function writeAtomic(file: string, contents: string, mode?: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents, mode === undefined ? { flag: 'wx' } : { flag: 'wx', mode });
  fs.renameSync(temporary, file);
}

/** Stable key order so browser edits produce readable diffs in version control. */
export function serializeWorkspaceManifest(manifest: WorkspaceManifest) {
  const canonical = validateWorkspaceManifest(manifest);
  const ordered: Record<string, unknown> = { version: WORKSPACE_MANIFEST_VERSION };
  (['group', 'project', 'tabs', 'scripts', 'terminals', 'siteSettings', 'skills', 'ai'] as const).forEach((key) => {
    if (canonical[key] !== undefined) ordered[key] = canonical[key];
  });
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function writeWorkspaceManifest(folder: string, manifest: WorkspaceManifest) {
  const validated = validateWorkspaceManifest(manifest);
  const file = workspaceManifestPath(folder);
  regularFile(file);
  const next = serializeWorkspaceManifest(validated);
  let previous = '';
  try {
    previous = fs.readFileSync(file, 'utf8');
  } catch {
    /* New file. */
  }
  if (previous === next) return;
  writeAtomic(file, next);
  cache.delete(file);
  writers.forEach((listener) => listener(folder, validated));
}

/**
 * Merge the group block into the folder's manifest (link, rename) or drop it
 * (unlink). The file is deleted only when nothing but the version remains.
 */
export function mergeWorkspaceGroup(
  folder: string,
  group: { name: string; slug: string } | null
) {
  const file = workspaceManifestPath(folder);
  let current: WorkspaceManifest | undefined;
  try {
    current = readWorkspaceManifest(folder);
  } catch {
    // A hand-edited file that no longer validates is the user's; leave it alone.
    return;
  }
  const next: WorkspaceManifest = { ...(current || { version: WORKSPACE_MANIFEST_VERSION }) };
  if (group) {
    next.group = { ...(current?.group || {}), name: group.name };
    if (group.slug) next.group.slug = group.slug;
    else delete next.group.slug;
  }
  else delete next.group;
  const { version, ...rest } = next;
  if (!Object.keys(rest).length) {
    if (regularFile(file)) fs.unlinkSync(file);
    cache.delete(file);
    return;
  }
  writeWorkspaceManifest(folder, next);
}

/**
 * Project-level MCP entries hold only the bridge command: the bridge pairs on
 * first run through the connector approval and keeps its token in ~/.kudium.
 */
export function writeProjectMCPEntries(folder: string) {
  const targets: [string, string][] = [['.mcp.json', 'mcpServers']];
  if (fs.existsSync(path.join(folder, '.cursor'))) targets.push([path.join('.cursor', 'mcp.json'), 'mcpServers']);
  targets.forEach(([relative, key]) => {
    const file = path.join(folder, relative);
    let previous: Record<string, unknown> = {};
    try {
      if (!regularFile(file)) previous = {};
      else {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        previous = parsed;
      }
    } catch {
      return; // Not ours to repair.
    }
    const servers = (previous[key] && typeof previous[key] === 'object' ? previous[key] : {}) as Record<string, unknown>;
    const existing = servers.kudiumbrowser as Record<string, unknown> | undefined;
    // A user's own entry (a different command, or the setup command's absolute
    // bridge path) already works; never replace it.
    if (existing) return;
    const next = { ...previous, [key]: { ...servers, kudiumbrowser: { ...PROJECT_MCP_ENTRY } } };
    writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
  });
}

export interface WorkspaceSkill extends AISkill {
  /** `project:<relative path>` */
  id: string;
  path: string;
}

/** Skills the manifest names, loaded from inside the folder; broken entries are skipped with a note. */
export function loadWorkspaceSkills(folder: string, manifest: WorkspaceManifest | undefined) {
  const skills: WorkspaceSkill[] = [];
  const problems: string[] = [];
  (manifest?.skills || []).forEach((relative) => {
    try {
      const target = fs.realpathSync(path.join(folder, relative));
      const root = fs.realpathSync(folder);
      if (!inside(root, target)) throw new Error('outside the project folder');
      const stat = fs.statSync(target);
      const loaded = stat.isDirectory()
        ? loadSkillFolder(target)
        : skillFromText(fs.readFileSync(target, 'utf8'), path.basename(path.dirname(target)));
      skills.push({ ...loaded, id: `project:${relative}`, enabled: true, path: relative });
    } catch (error) {
      problems.push(`${relative}: ${(error as Error).message}`);
    }
  });
  return { skills, problems };
}

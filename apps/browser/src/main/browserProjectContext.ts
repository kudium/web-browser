import fs from 'fs';
import path from 'path';
import { writePrivateFile } from './privateFile';
import { mergeWorkspaceGroup, readWorkspaceManifest, writeProjectMCPEntries } from './workspaceManifest';
import { WORKSPACE_MANIFEST_FILE } from '../browser/workspaceManifest';

export interface BrowserProjectGroup {
  name: string;
  slug: string;
}
const groupPrefix = '<!-- kudium:browser-group:';
const guideStart = '<!-- kudium:browser-guide:start -->';
const guideEnd = '<!-- kudium:browser-guide:end -->';
const referenceStart = '<!-- kudium:browser-reference:start -->';
const referenceEnd = '<!-- kudium:browser-reference:end -->';

/** The whole AGENTS.md contribution: the manifest carries everything else. */
export const AGENTS_REFERENCE = `This project is linked to Kudium Browser. Read \`${WORKSPACE_MANIFEST_FILE}\` and use the Kudium MCP tools; if the server is missing, run \`npx @kudiumbrowser/mcp setup\`.`;

function readDocument(filename: string) {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error(
        `Cannot update ${path.basename(
          filename
        )}: choose a regular file smaller than 1 MB.`
      );
    return fs.readFileSync(filename, 'utf8');
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return '';
    throw error;
  }
}
function replaceSection(
  text: string,
  start: string,
  end: string,
  body: string | null
) {
  const first = text.indexOf(start);
  const last = text.indexOf(end);
  if (
    first < 0 !== last < 0 ||
    (first >= 0 &&
      (last < first ||
        text.indexOf(start, first + start.length) >= 0 ||
        text.indexOf(end, last + end.length) >= 0))
  )
    throw new Error(
      'The Kudium browser section has been edited. Repair its markers before linking the project.'
    );
  const block = body === null ? '' : `${start}\n${body}\n${end}`;
  if (first >= 0)
    return text.slice(0, first) + block + text.slice(last + end.length);
  return block ? `${text}${text ? '\n\n' : ''}${block}\n` : text;
}
function saveDocument(filename: string, previous: string, next: string) {
  if (previous === next) return;
  if (!next.trim()) {
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
  } else writePrivateFile(filename, next);
}

/**
 * Strip the blocks earlier Kudium versions kept in BROWSER.md. The file is
 * deleted when nothing outside the markers remains; the user's own text stays.
 */
function migrateBrowserDocument(folder: string) {
  const browserFile = path.join(folder, 'BROWSER.md');
  const previous = readDocument(browserFile);
  if (!previous.includes(groupPrefix) && !previous.includes(guideStart)) return;
  let next = previous.replace(
    /<!-- kudium:browser-group:([a-f0-9]+):start -->[\s\S]*?<!-- kudium:browser-group:\1:end -->/g,
    ''
  );
  next = replaceSection(next, guideStart, guideEnd, null);
  next = next.replace(/\n{3,}/g, '\n\n').trim();
  saveDocument(browserFile, previous, next ? `${next}\n` : '');
}

/**
 * Keep the linked folder self-describing: `kudium.workspace.json` holds the
 * group, AGENTS.md carries one reference line and `.mcp.json` the bridge
 * command. Only our marked sections are owned by Kudium; no credentials are
 * written. Passing `null` unlinks.
 */
export function updateBrowserProjectContext(
  folder: string,
  groupId: string,
  group: BrowserProjectGroup | null,
  options: { preserveGroup?: boolean } = {}
) {
  const agentFile = path.join(folder, 'AGENTS.md');
  const old = readDocument(agentFile);
  const plans = [
    {
      filename: agentFile,
      old,
      updated: replaceSection(
        old,
        referenceStart,
        referenceEnd,
        group ? AGENTS_REFERENCE : null
      ),
    },
  ];
  // Migrate only a reference written by earlier Kudium versions.
  const legacyFile = path.join(folder, 'AGENT.md');
  if (fs.existsSync(legacyFile) && fs.lstatSync(legacyFile).isFile()) {
    const legacy = readDocument(legacyFile);
    if (legacy.includes(referenceStart))
      plans.push({
        filename: legacyFile,
        old: legacy,
        updated: replaceSection(legacy, referenceStart, referenceEnd, null),
      });
  }
  // Validate every document before the first write so a broken marker
  // leaves the folder untouched.
  migrateBrowserDocument(folder);
  if (group && (!options.preserveGroup || !readWorkspaceManifest(folder)))
    mergeWorkspaceGroup(folder, group ? { name: group.name, slug: group.slug } : null);
  plans.forEach(({ filename, old: original, updated }) =>
    saveDocument(filename, original, updated)
  );
  if (group) writeProjectMCPEntries(folder);
}

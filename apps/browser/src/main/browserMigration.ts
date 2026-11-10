/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue, no-nested-ternary, no-loop-func -- Bounded sequential profile and cookie operations avoid excessive OS requests. */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID, pbkdf2Sync, createDecipheriv, createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { CookiesSetDetails } from 'electron';
import { ipcMain, session, WebContents } from 'electron';
import type { CookieSnapshot } from './migrationDatabase';
import { readMigrationDatabase, readCookieSnapshot } from './migrationDatabase';
import type {
  MigrationProfile,
  MigrationRequest,
  MigrationProgress,
  MigrationResult,
} from '../browser/browserMigration';
import { collectionProfile } from '../utils/collectionGroups';
import type { ImportedLink } from '../browser/browserImport';
import { importBrowsingHistory } from './history';
import {
  saveMigrationJob,
  loadMigrationJobs,
  removeMigrationJob,
} from './migrationJournal';
import type { ImportOrganizationOptions } from '../browser/importWorkspace';
import { arcSidebarLinks, arcProfileName } from './arcMigration';

export { readMigrationDatabase } from './migrationDatabase';

const exec = promisify(execFile);
interface Source extends MigrationProfile {
  directory: string;
  keychain?: string;
  arcSidebar?: string;
  profileDirectory?: string;
}
const profiles = new Map<string, Source>();
interface MigrationJob {
  sender: WebContents;
  frame: unknown;
  created: number;
  profileId: string;
  source: Source;
  links: ImportedLink[];
  warnings: string[];
  destinationSpace?: string;
  organization?: ImportOrganizationOptions;
  history: { url: string; title: string; visitedAt: number }[];
  cookies: boolean;
  progress: MigrationProgress;
  running?: Promise<MigrationResult>;
  started?: boolean;
  result?: MigrationResult;
  cookieResult?: MigrationResult;
  cookieSnapshot?: CookieSnapshot;
  historyResult?: number;
}
const pending = new Map<string, MigrationJob>();
function checkpoint(token: string, job: MigrationJob) {
  const { sender, frame, running, cookieSnapshot, ...data } = job;
  saveMigrationJob({ token, ...data });
}
function recoverable(
  value: any
): value is Omit<MigrationJob, 'sender' | 'frame'> & { token: string } {
  return (
    value &&
    /^[a-f0-9-]{36}$/i.test(value.token) &&
    typeof value.profileId === 'string' &&
    value.source &&
    typeof value.source.directory === 'string' &&
    typeof value.source.browser === 'string' &&
    Array.isArray(value.links) &&
    value.links.length <= 5000 &&
    value.links.every(
      (link: any) =>
        typeof link.url === 'string' && typeof link.name === 'string'
    ) &&
    Array.isArray(value.history) &&
    value.history.length <= 10000 &&
    value.history.every(
      (record: any) =>
        typeof record.url === 'string' &&
        typeof record.title === 'string' &&
        Number.isFinite(record.visitedAt)
    ) &&
    typeof value.cookies === 'boolean'
  );
}

export function chromiumRoots(
  platform = process.platform,
  home = os.homedir(),
  local = process.env.LOCALAPPDATA || ''
) {
  const bases =
    platform === 'darwin'
      ? [
          ['Chrome', 'Google/Chrome', 'Chrome Safe Storage'],
          ['Edge', 'Microsoft Edge', 'Microsoft Edge Safe Storage'],
          ['Brave', 'BraveSoftware/Brave-Browser', 'Brave Safe Storage'],
          ['Arc', 'Arc/User Data', 'Arc Safe Storage'],
          ['Chromium', 'Chromium', 'Chromium Safe Storage'],
        ]
      : platform === 'win32'
      ? [
          ['Chrome', 'Google/Chrome/User Data'],
          ['Edge', 'Microsoft/Edge/User Data'],
          ['Brave', 'BraveSoftware/Brave-Browser/User Data'],
          ['Chromium', 'Chromium/User Data'],
        ]
      : [
          ['Chrome', 'google-chrome'],
          ['Chromium', 'chromium'],
          ['Edge', 'microsoft-edge'],
          ['Brave', 'BraveSoftware/Brave-Browser'],
        ];
  const base =
    platform === 'darwin'
      ? path.join(home, 'Library/Application Support')
      : platform === 'win32'
      ? local
      : path.join(home, '.config');
  return bases.map(([browser, directory, keychain]) => ({
    browser,
    directory: path.join(base, directory),
    keychain,
  }));
}
async function exists(file: string) {
  return fs
    .stat(file)
    .then((s) => s.isFile())
    .catch(() => false);
}
async function json(file: string) {
  if ((await fs.stat(file)).size > 8 * 1024 * 1024)
    throw new Error('Browser data exceeds the 8 MB import limit.');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
export function bookmarkLinks(value: unknown, limit = 5000): ImportedLink[] {
  const links: ImportedLink[] = [];
  const roots = (value as { roots?: Record<string, unknown> })?.roots;
  if (!roots || typeof roots !== 'object')
    throw new Error('This browser bookmark file is invalid.');
  const visit = (node: any, folders: string[], depth: number) => {
    if (!node || depth > 32 || links.length >= limit) return;
    if (node.type === 'url' && typeof node.url === 'string') {
      try {
        const url = new URL(node.url);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          node.url.length > 8192
        )
          return;
        links.push({
          url: url.href,
          name: String(node.name || url.hostname).slice(0, 256),
          folderPath: folders,
        });
      } catch {
        /* Unsupported bookmark. */
      }
    } else if (Array.isArray(node.children)) {
      const next = node.name
        ? [...folders, String(node.name).slice(0, 256)]
        : folders;
      node.children.forEach((child: unknown) => visit(child, next, depth + 1));
    }
  };
  Object.values(roots).forEach((root) => visit(root, [], 0));
  return links;
}
async function discover() {
  const found: Source[] = [];
  for (const root of chromiumRoots()) {
    const dirs = await fs
      .readdir(root.directory, { withFileTypes: true })
      .catch(() => []);
    for (const entry of dirs
      .filter((e) => e.isDirectory() && /^(Default|Profile \d+)$/.test(e.name))
      .slice(0, 100)) {
      const directory = path.join(root.directory, entry.name);
      const previous = [...profiles.values()].find(
        (p) => p.directory === directory
      );
      const prefs = await json(path.join(directory, 'Preferences')).catch(
        () => ({})
      );
      if (
        root.browser === 'Arc' &&
        prefs.profile?.name === '__ARC_SYSTEM_PROFILE'
      )
        continue;
      const arcSidebar =
        root.browser === 'Arc'
          ? path.join(path.dirname(root.directory), 'StorableSidebar.json')
          : undefined;
      const source: Source = {
        id: previous?.id || randomUUID(),
        browser: root.browser,
        name:
          root.browser === 'Arc'
            ? arcProfileName(entry.name, prefs.profile?.name)
            : String(prefs.profile?.name || entry.name).slice(0, 100),
        arcSidebar,
        profileDirectory: entry.name,
        directory,
        keychain: root.keychain,
        bookmarks:
          (arcSidebar &&
            (await exists(arcSidebar)) &&
            (await json(arcSidebar)
              .then((value) => arcSidebarLinks(value, entry.name).length > 0)
              .catch(() => false))) ||
          (await exists(path.join(directory, 'Bookmarks'))),
        history: await exists(path.join(directory, 'History')),
        cookies:
          process.platform === 'darwin' &&
          Boolean(root.keychain) &&
          ((await exists(path.join(directory, 'Cookies'))) ||
            (await exists(path.join(directory, 'Network/Cookies')))),
      };
      profiles.set(source.id, source);
      found.push(source);
    }
  }
  return found.map(
    ({ directory, keychain, arcSidebar, profileDirectory, ...profile }) =>
      profile
  );
}
export function decodeChromiumCookie(
  encrypted: Buffer,
  host: string,
  key: Buffer,
  hostBound = false
) {
  if (encrypted.subarray(0, 3).toString() !== 'v10')
    throw new Error('Unsupported cookie encryption.');
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 32));
  let decoded = Buffer.concat([
    decipher.update(encrypted.subarray(3)),
    decipher.final(),
  ]);
  const digest = createHash('sha256').update(host).digest();
  if (decoded.subarray(0, 32).equals(digest)) decoded = decoded.subarray(32);
  else if (hostBound || decoded.includes(0))
    throw new Error('Unsupported cookie data.');
  return new TextDecoder('utf8', { fatal: true }).decode(decoded);
}
export function migratedCookieDetails(
  row: Record<string, unknown>,
  value: string
): CookiesSetDetails {
  const host = String(row.host_key);
  const domain = host.replace(/^\./, '');
  if (!domain || /[/:\s]/.test(domain))
    throw new Error('Invalid cookie domain.');
  return {
    url: `http${row.is_secure ? 's' : ''}://${domain}${String(
      row.path || '/'
    )}`,
    domain: host.startsWith('.') ? host : undefined,
    name: String(row.name),
    value,
    path: String(row.path || '/'),
    secure: Boolean(row.is_secure),
    httpOnly: Boolean(row.is_httponly),
    expirationDate: row.has_expires
      ? Number(row.expires_utc) / 1000000 - 11644473600
      : undefined,
    sameSite:
      Number(row.samesite) === 1
        ? 'lax'
        : Number(row.samesite) === 2
        ? 'strict'
        : Number(row.samesite) === 0
        ? 'no_restriction'
        : 'unspecified',
  };
}
export async function transferCookies(
  source: Source,
  destination: string,
  check: () => void,
  progress: (stage: string, completed: number, total: number) => void,
  snapshot?: CookieSnapshot
) {
  const file = (await exists(path.join(source.directory, 'Network/Cookies')))
    ? path.join(source.directory, 'Network/Cookies')
    : path.join(source.directory, 'Cookies');
  progress('Reading cookies', 0, 0);
  const { rows, total, hostBound } =
    snapshot || (await readCookieSnapshot(file));
  const omittedCookies = Math.max(0, total - rows.length);
  if (!rows.length) return { cookies: 0, skippedCookies: 0, omittedCookies };
  progress('Waiting for Keychain access', 0, rows.length);
  const result = await exec(
    '/usr/bin/security',
    ['find-generic-password', '-w', '-s', source.keychain!],
    { maxBuffer: 4096, timeout: 60000 }
  ).catch(() => {
    throw new Error(
      'Cookie access was not granted. Your tabs and history can still be imported without cookies.'
    );
  });
  check();
  const key = pbkdf2Sync(
    result.stdout.replace(/\r?\n$/, ''),
    'saltysalt',
    1003,
    16,
    'sha1'
  );
  const target = session.fromPartition(`persist:kudiumbrowser-${destination}`);
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  try {
    for (let offset = 0; offset < rows.length; offset += 8) {
      check();
      await Promise.all(
        rows.slice(offset, offset + 8).map(async (row) => {
          try {
            if (row.top_frame_site_key) {
              skipped += 1;
              return;
            }
            const host = String(row.host_key);
            const domain = host.replace(/^\./, '');
            if (!domain || /[/:\s]/.test(domain)) throw new Error();
            const expiry = Number(row.expires_utc) / 1000000 - 11644473600;
            if (row.has_expires && expiry <= Date.now() / 1000) {
              skipped += 1;
              return;
            }
            const value =
              row.encrypted_value instanceof Uint8Array &&
              row.encrypted_value.length
                ? decodeChromiumCookie(
                    Buffer.from(row.encrypted_value),
                    host,
                    key,
                    hostBound
                  )
                : String(row.value || '');
            const details = migratedCookieDetails(row, value);
            try {
              await target.cookies.set(details);
              imported += 1;
            } catch {
              failed += 1;
            }
          } catch {
            skipped += 1;
          }
        })
      );
      progress(
        'Transferring cookies',
        Math.min(offset + 8, rows.length),
        rows.length
      );
    }
    check();
    await target.cookies.flushStore();
  } finally {
    key.fill(0);
  }
  return {
    cookies: imported,
    skippedCookies: skipped,
    omittedCookies,
    ...(failed
      ? {
          retryable: true,
          warning: `${failed} cookies could not be saved. Retry remaining data to finish transferring website logins.`,
        }
      : {}),
  };
}
export function registerBrowserMigration(
  trusted: (contents: WebContents) => boolean
) {
  ipcMain.handle(
    'browser-migration',
    async (
      event,
      action: string,
      input:
        | MigrationRequest
        | {
            token: string;
            destinationSpace?: string;
            organization?: ImportOrganizationOptions;
          }
    ) => {
      const { sender } = event;
      const frame = event.senderFrame;
      const check = () => {
        if (
          sender.isDestroyed() ||
          !trusted(sender) ||
          sender.mainFrame !== frame
        )
          throw new Error('Open Preferences to migrate browser data.');
      };
      check();
      if (action === 'profiles') return discover();
      if (action === 'recover') {
        return loadMigrationJobs()
          .map((value) => {
            if (!recoverable(value))
              throw new Error(
                'Invalid import recovery data. The original file has been preserved.'
              );
            if (pending.get(value.token)?.running) return undefined;
            const job: MigrationJob = {
              ...value,
              sender,
              frame,
              started: true,
              warnings: value.warnings || [],
              progress: { stage: 'Ready to resume', completed: 0, total: 0 },
            };
            pending.set(value.token, job);
            return {
              token: value.token,
              profileId: job.profileId,
              links: job.links,
              history: job.history.length,
              cookies: job.cookies,
              warnings: job.warnings,
              source: {
                id: job.source.id,
                browser: job.source.browser,
                name: job.source.name,
                bookmarks: true,
                history: true,
                cookies: job.source.cookies,
              },
              destinationSpace: job.destinationSpace,
              organization: job.organization,
            };
          })
          .filter(Boolean);
      }
      if (action === 'prepare') {
        const request = input as MigrationRequest;
        if (
          !request ||
          typeof request.profileId !== 'string' ||
          (request.destinationSpace !== undefined &&
            (typeof request.destinationSpace !== 'string' ||
              !request.destinationSpace)) ||
          !['bookmarks', 'history', 'cookies'].every(
            (k) => typeof request[k as keyof MigrationRequest] === 'boolean'
          ) ||
          !['bookmarks', 'history', 'cookies'].some(
            (k) => request[k as keyof MigrationRequest] === true
          )
        )
          throw new Error('Choose data to import.');
        const source = profiles.get(request.profileId);
        if (!source) throw new Error('Choose a detected browser profile.');
        if (request.cookies && !source.cookies)
          throw new Error('Cookie migration is unavailable for this browser.');
        const warnings: string[] = [];
        const links: ImportedLink[] = [];
        if (request.bookmarks) {
          if (source.arcSidebar && (await exists(source.arcSidebar)))
            links.push(
              ...arcSidebarLinks(
                await json(source.arcSidebar),
                source.profileDirectory!,
                5001
              )
            );
          const bookmarkFile = path.join(source.directory, 'Bookmarks');
          if (await exists(bookmarkFile)) {
            const sidebarURLs = new Set(links.map((link) => link.url));
            links.push(
              ...bookmarkLinks(await json(bookmarkFile), 5001).filter(
                (link) => !sidebarURLs.has(link.url)
              )
            );
          }
          if (links.length > 5000)
            warnings.push(
              'Only the first 5,000 saved tabs will be imported. Additional tabs were omitted.'
            );
          links.splice(5000);
        }
        let history: { url: string; title: string; visitedAt: number }[] = [];
        if (request.history) {
          try {
            const rows = await readMigrationDatabase(
              path.join(source.directory, 'History'),
              'SELECT url,title,last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 10001'
            );
            if (rows.length > 10000)
              warnings.push(
                'Only the 10,000 most recent history entries will be imported. Older entries were omitted.'
              );
            history = rows.slice(0, 10000).flatMap((row) => {
              try {
                const url = new URL(String(row.url));
                const visitedAt =
                  Number(row.last_visit_time) / 1000 - 11644473600000;
                return ['http:', 'https:'].includes(url.protocol) &&
                  !url.username &&
                  !url.password &&
                  Number.isFinite(visitedAt) &&
                  visitedAt > 0 &&
                  visitedAt <= Date.now() &&
                  url.href.length <= 8192
                  ? [
                      {
                        url: url.href,
                        title: String(row.title || url.hostname).slice(0, 1000),
                        visitedAt,
                      },
                    ]
                  : [];
              } catch {
                return [];
              }
            });
          } catch {
            throw new Error(
              'History could not be read. Close the source browser and try again.'
            );
          }
        }
        let cookieSnapshot: CookieSnapshot | undefined;
        if (request.cookies) {
          const file = (await exists(
            path.join(source.directory, 'Network/Cookies')
          ))
            ? path.join(source.directory, 'Network/Cookies')
            : path.join(source.directory, 'Cookies');
          cookieSnapshot = await readCookieSnapshot(file);
          if (cookieSnapshot.total > 10000)
            warnings.push(
              'Only the first 10,000 cookies will be transferred. Additional cookies were omitted.'
            );
        }
        check();
        for (const [token, job] of pending)
          if (
            !job.running &&
            (job.sender === sender || Date.now() - job.created > 600000)
          )
            pending.delete(token);
        const token = randomUUID();
        const profileId = request.destinationSpace
          ? collectionProfile(request.destinationSpace, token)
          : randomUUID();
        pending.set(token, {
          sender,
          frame,
          created: Date.now(),
          profileId,
          source,
          links,
          warnings,
          cookieSnapshot,
          history,
          cookies: request.cookies === true,
          progress: { stage: 'Ready to import', completed: 0, total: 0 },
        });
        return {
          token,
          profileId,
          links,
          warnings,
          history: history.length,
          cookies: request.cookies === true,
        };
      }
      if (['commit', 'status', 'start', 'discard'].includes(action)) {
        const token = (input as { token: string })?.token;
        const job = pending.get(token);
        if (
          !job ||
          job.sender !== sender ||
          job.frame !== frame ||
          (!job.started && !job.running && Date.now() - job.created > 600000)
        )
          throw new Error('Review this import again.');
        if (action === 'status') return job.progress;
        if (action === 'discard') {
          if (job.running)
            throw new Error(
              'Wait for the import to finish before dismissing it.'
            );
          removeMigrationJob(token);
          pending.delete(token);
          return job.progress;
        }
        if (action === 'start') {
          const request = input as {
            destinationSpace: string;
            organization: ImportOrganizationOptions;
          };
          if (
            typeof request.destinationSpace !== 'string' ||
            !request.destinationSpace ||
            !request.organization ||
            typeof request.organization.foldersAsGroups !== 'boolean' ||
            typeof request.organization.spacesAsFolders !== 'boolean'
          )
            throw new Error('Choose how to organize this import.');
          job.destinationSpace = request.destinationSpace;
          job.organization = request.organization;
          job.started = true;
          checkpoint(token, job);
          return job.progress;
        }
        if (job.result) return job.result;
        if (job.running) return job.running;
        const progress = (stage: string, completed = 0, total = 0) => {
          job.progress = { stage, completed, total };
        };
        job.created = Date.now();
        job.started = true;
        checkpoint(token, job);
        job.running = (async () => {
          let cookies: MigrationResult = job.cookieResult || {
            history: 0,
            cookies: 0,
            skippedCookies: 0,
          };
          if (job.cookies && !job.cookieResult) {
            try {
              cookies = {
                history: 0,
                ...(await transferCookies(
                  job.source,
                  job.profileId,
                  check,
                  progress,
                  job.cookieSnapshot
                )),
              };
              if (!cookies.retryable) {
                job.cookieResult = cookies;
                job.cookieSnapshot = undefined;
                checkpoint(token, job);
              }
            } catch {
              check();
              cookies = {
                history: 0,
                cookies: 0,
                skippedCookies: 0,
                retryable: true,
                warning:
                  'Cookies could not be transferred. Retry to finish transferring website logins without creating more groups.',
              };
            }
          }
          check();
          progress('Importing history', 0, job.history.length);
          if (job.historyResult === undefined)
            job.historyResult = await importBrowsingHistory(
              job.history,
              job.profileId
            );
          checkpoint(token, job);
          const result = { ...cookies, history: job.historyResult };
          if (!result.retryable) {
            job.result = result;
            removeMigrationJob(token);
          }
          progress(
            result.retryable
              ? 'Website logins need a retry'
              : 'Import complete',
            job.history.length,
            job.history.length
          );
          return result;
        })();
        try {
          return await job.running;
        } catch (error) {
          progress('Import interrupted — retry to continue');
          throw error;
        } finally {
          job.running = undefined;
          job.created = Date.now();
        }
      }
      throw new Error('Unknown browser migration action.');
    }
  );
}

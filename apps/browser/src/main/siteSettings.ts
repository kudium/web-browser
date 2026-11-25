import { stampDeveloperEdits } from '../browser/hookOrdering';
import { assertDeveloperSources } from "../browser/hookValidation";
import { app } from 'electron';
import fs from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import {
  SiteDeveloperConfig,
  HookRevision,
  validDeveloperConfig,
} from '../browser/siteDeveloper';

const changes = new EventEmitter();
const privateSites = new Map<string, SiteSettings>();
export function clearPrivateSiteSettings(prefix: string) {
  privateSites.forEach((_value, key) => {
    const [profile] = JSON.parse(key) as [string, string];
    if (profile.startsWith(prefix)) privateSites.delete(key);
  });
}
export function onSiteSettingsChanged(
  callback: (profile: string, origin: string) => void
) {
  changes.on('change', callback);
  return () => {
    changes.removeListener('change', callback);
  };
}
export type PermissionChoice = 'ask' | 'allow' | 'block';
export interface SiteSettings {
  permissions: Record<string, PermissionChoice>;
  muted: boolean;
  adBlocking?: boolean;
  developer?: SiteDeveloperConfig;
  hookRevisions?: HookRevision[];
}
export const sitePermissions = [
  ['geolocation', 'Location'],
  ['notifications', 'Notifications'],
  ['camera', 'Camera'],
  ['microphone', 'Microphone'],
  ['display-capture', 'Screen sharing'],
  ['clipboard-read', 'Clipboard'],
  ['fullscreen', 'Full screen'],
  ['midi', 'MIDI devices'],
] as const;
export function siteOrigin(url: string) {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol)
      ? parsed.origin
      : undefined;
  } catch {
    return undefined;
  }
}
const filename = () => path.join(app.getPath('userData'), 'site-settings.json');
const keyFor = (profile: string, origin: string) =>
  JSON.stringify([profile, origin]);
let cachedFile: string | undefined;
let cachedSites: Record<string, SiteSettings> = {};
// Keep ten recent saves and the latest working snapshot for each active hook.
function retainHookRevisions(
  revisions: HookRevision[],
  active?: SiteDeveloperConfig
) {
  const activeIds = new Set([
    '',
    ...(active?.hooks || []).map((hook) => hook.id),
  ]);
  const working = new Map<string, number>();
  revisions.forEach((entry, index) =>
    entry.workingHooks?.forEach((id) => {
      if (activeIds.has(id)) working.set(id, index);
    })
  );
  const keep = new Set([
    ...working.values(),
    ...revisions.map((_, index) => index).slice(-10),
  ]);
  return revisions.filter((_, index) => keep.has(index)).slice(-31);
}
function normalize(value: unknown): SiteSettings {
  const site =
    value && typeof value === 'object' ? (value as Partial<SiteSettings>) : {};
  const permissions =
    site.permissions &&
    typeof site.permissions === 'object' &&
    !Array.isArray(site.permissions)
      ? (Object.fromEntries(
          Object.entries(site.permissions).filter(
            ([name, choice]) =>
              name.length < 200 && ['ask', 'allow', 'block'].includes(choice)
          )
        ) as Record<string, PermissionChoice>)
      : {};
  return {
    permissions,
    muted: site.muted === true,
    adBlocking: site.adBlocking !== false,
    hookRevisions: Array.isArray(site.hookRevisions)
      ? retainHookRevisions(
          site.hookRevisions
            .filter(
              (entry) =>
                entry &&
                Number.isFinite(entry.time) &&
                validDeveloperConfig(entry.config)
            )
            .map((entry) => ({
              time: entry.time,
              config: entry.config,
              workingHooks: Array.isArray(entry.workingHooks)
                ? entry.workingHooks.filter(
                    (id) =>
                      typeof id === 'string' &&
                      (id === '' ||
                        entry.config.hooks?.some((hook) => hook.id === id))
                  )
                : [],
            })),
          site.developer
        )
      : undefined,
    developer: validDeveloperConfig(site.developer)
      ? { ...site.developer }
      : undefined,
  };
}
function read(): Record<string, SiteSettings> {
  const file = filename();
  if (cachedFile === file) return cachedSites;
  let sites: Record<string, SiteSettings> = {};
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      sites = Object.fromEntries(
        Object.entries(saved).map(([key, value]) => [key, normalize(value)])
      );
    }
  } catch {
    // Missing/corrupt settings start with no grants. Writes still surface errors.
  }
  cachedFile = file;
  cachedSites = sites;
  return sites;
}
export function getSiteSettings(profile: string, origin: string): SiteSettings {
  const site = (profile.startsWith('private:') ? privateSites.get(keyFor(profile, origin)) : read()[keyFor(profile, origin)]) || {
    permissions: {},
    muted: false,
  };
  return {
    ...site,
    permissions: { ...site.permissions },
    developer: site.developer ? { ...site.developer } : undefined,
  };
}
export function updateSiteSettings(
  profile: string,
  origin: string,
  patch: Partial<SiteSettings>
) {
  if (profile.startsWith('private:')) {
    const previous = getSiteSettings(profile, origin);
    if (patch.developer) patch = { ...patch, developer: stampDeveloperEdits(previous.developer, patch.developer) };
    privateSites.set(keyFor(profile, origin), normalize({ ...previous, ...patch }));
    changes.emit('change', profile, origin);
    return;
  }
  const file = filename();
  const sites = read();
  const key = keyFor(profile, origin);
  const previous = sites[key];
  if (patch.developer) assertDeveloperSources(patch.developer);
  if (patch.developer) patch = { ...patch, developer: stampDeveloperEdits(previous?.developer, patch.developer) };
  const revisions = [...(previous?.hookRevisions || [])];
  if (
    patch.developer &&
    previous?.developer &&
    JSON.stringify(patch.developer) !== JSON.stringify(previous.developer)
  ) {
    revisions.push({ time: Date.now(), config: previous.developer });
  }
  const next = {
    ...sites,
    [key]: normalize({
      ...previous,
      ...patch,
      hookRevisions:
        patch.hookRevisions || (revisions.length ? revisions : undefined),
    }),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next));
  fs.renameSync(temporary, file);
  // Never expose a permission grant that failed to reach durable storage.
  cachedSites = next;
  changes.emit('change', profile, origin);
}

/** Remove site decisions/hooks only when the profile no longer has a group. */
export function removeSiteProfile(profile: string) {
  const file = filename();
  const sites = read();
  const next = Object.fromEntries(
    Object.entries(sites).filter(([key]) => {
      try {
        return JSON.parse(key)[0] !== profile;
      } catch {
        return true;
      }
    })
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next));
  fs.renameSync(`${file}.tmp`, file);
  cachedSites = next;
  Object.keys(sites).forEach((key) => {
    try {
      const [savedProfile, origin] = JSON.parse(key);
      if (savedProfile === profile) changes.emit('change', profile, origin);
    } catch {
      /* Retain malformed keys for recovery. */
    }
  });
}

/** Preserve the exact successful source even before it has been replaced. */
export function markHooksWorking(
  profile: string,
  origin: string,
  config: SiteDeveloperConfig,
  hookId: string
) {
  const site = getSiteSettings(profile, origin);
  if (JSON.stringify(site.developer) !== JSON.stringify(config)) return;
  const revisions = (site.hookRevisions || []).map((entry) => ({ ...entry }));
  const matching = revisions
    .slice()
    .reverse()
    .find((entry) => JSON.stringify(entry.config) === JSON.stringify(config));
  if (matching)
    matching.workingHooks = [
      ...new Set([...(matching.workingHooks || []), hookId]),
    ];
  else revisions.push({ time: Date.now(), config, workingHooks: [hookId] });
  updateSiteSettings(profile, origin, {
    hookRevisions: retainHookRevisions(revisions, config),
  });
}

/** Execution is downstream of the atomic settings write. */
export function saveSiteHooks(
  profile: string,
  origin: string,
  config: SiteDeveloperConfig,
  afterSave: () => void
) {
  updateSiteSettings(profile, origin, { developer: config });
  afterSave();
}

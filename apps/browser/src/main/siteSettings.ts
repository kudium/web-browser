import { app } from 'electron';
import fs from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import {
  SiteDeveloperConfig,
  validDeveloperConfig,
} from '../browser/siteDeveloper';

const changes = new EventEmitter();
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
  developer?: SiteDeveloperConfig;
}
export const sitePermissions = [
  ['geolocation', 'Location'],
  ['notifications', 'Notifications'],
  ['media', 'Camera and microphone'],
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
  const site = read()[keyFor(profile, origin)] || {
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
  const file = filename();
  const sites = read();
  const key = keyFor(profile, origin);
  const next = {
    ...sites,
    [key]: normalize({ ...sites[key], ...patch }),
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

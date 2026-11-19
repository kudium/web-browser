import { createHash } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { and, eq } from 'drizzle-orm';
import { rcompare, gt } from 'semver';
import { releases } from './schema';
import type { Database } from './db';
import { allowedAssets, releaseSchema, type ReleaseManifest } from './validation';
export type ReleaseHistoryEntry = {
  version: string; channel: 'stable' | 'beta'; publishedAt: string;
  notes: string[]; targets: Pick<ReleaseManifest, 'platform' | 'arch' | 'files'>[];
};
export function groupReleaseHistory(rows: { manifest: ReleaseManifest; publishedAt: Date }[], origins: string[], channel: 'all' | 'stable' | 'beta', page: number, pageSize = 12) {
  const groups = new Map<string, ReleaseHistoryEntry>();
  for (const row of rows) {
    const parsed = releaseSchema.safeParse(row.manifest);
    if (!parsed.success || !allowedAssets(parsed.data, origins)) continue;
    const manifest = parsed.data;
    if (channel !== 'all' && manifest.channel !== channel) continue;
    const key = `${manifest.channel}/${manifest.version}`;
    const date = row.publishedAt.toISOString();
    const group: ReleaseHistoryEntry = groups.get(key) || { version: manifest.version, channel: manifest.channel, publishedAt: date, notes: [], targets: [] };
    if (date > group.publishedAt) group.publishedAt = date;
    if (manifest.notes && !group.notes.includes(manifest.notes)) group.notes.push(manifest.notes);
    group.targets.push({ platform: manifest.platform, arch: manifest.arch, files: manifest.files });
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort((a, b) => rcompare(a.version, b.version) || a.channel.localeCompare(b.channel));
  for (const group of ordered) group.targets.sort((a, b) => `${a.platform}/${a.arch}`.localeCompare(`${b.platform}/${b.arch}`));
  return { releases: ordered.slice((page - 1) * pageSize, page * pageSize), page, totalPages: Math.ceil(ordered.length / pageSize), total: ordered.length };
}
export async function releaseHistory(db: Database, origins: string[], channel: 'all' | 'stable' | 'beta', page: number, pageSize = 12) {
  const rows = await db.select({ manifest: releases.manifest, publishedAt: releases.publishedAt }).from(releases).where(channel === 'all' ? undefined : eq(releases.channel, channel));
  return groupReleaseHistory(rows, origins, channel, page, pageSize);
}
export async function latestRelease(db: Database, target: Pick<ReleaseManifest, 'platform' | 'arch' | 'channel'>, origins: string[]) {
  const rows = await db.select().from(releases).where(and(eq(releases.platform, target.platform), eq(releases.arch, target.arch), eq(releases.channel, target.channel)));
  return rows.filter(row => allowedAssets(row.manifest, origins)).sort((a, b) => rcompare(a.version, b.version))[0];
}
export function updateAvailable(latest: string, current: string) { return gt(latest, current); }
export function updaterManifest(release: { manifest: ReleaseManifest; publishedAt: Date }) {
  const { manifest } = release;
  return { version: manifest.version, files: manifest.files, path: manifest.files[0].url, sha512: manifest.files[0].sha512, releaseDate: release.publishedAt.toISOString(), releaseNotes: manifest.notes };
}

export async function registerReleases(db: Database, manifests: ReleaseManifest[]) {
  await db.transaction(async tx => {
    for (const manifest of manifests) {
      const id = createHash('sha256').update(`${manifest.version}/${manifest.platform}/${manifest.arch}/${manifest.channel}`).digest('hex');
      const inserted = await tx.insert(releases).values({ id, version: manifest.version, platform: manifest.platform, arch: manifest.arch, channel: manifest.channel, manifest }).onConflictDoNothing().returning({ id: releases.id });
      if (!inserted.length) {
        const [existing] = await tx.select().from(releases).where(and(eq(releases.version, manifest.version), eq(releases.platform, manifest.platform), eq(releases.arch, manifest.arch), eq(releases.channel, manifest.channel)));
        if (!existing || JSON.stringify(existing.manifest) !== JSON.stringify(manifest)) {
          // PostgreSQL jsonb key ordering is not stable. Compare normalized fields.
          const normalize = (m: ReleaseManifest) => JSON.stringify([m.version, m.platform, m.arch, m.channel, m.notes, m.files.map(f => [f.url, f.sha512, f.size, f.sha256])]);
          if (!existing || normalize(existing.manifest) !== normalize(manifest)) throw new HTTPException(409, { message: 'immutable_release' });
        }
      }
    }
  });
}

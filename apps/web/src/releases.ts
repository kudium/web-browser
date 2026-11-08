import { createHash } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { and, eq } from 'drizzle-orm';
import { rcompare, gt } from 'semver';
import { releases } from './schema';
import type { Database } from './db';
import { allowedAssets, type ReleaseManifest } from './validation';
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
          const normalize = (m: ReleaseManifest) => JSON.stringify([m.version, m.platform, m.arch, m.channel, m.notes, m.files.map(f => [f.url, f.sha512, f.size])]);
          if (!existing || normalize(existing.manifest) !== normalize(manifest)) throw new HTTPException(409, { message: 'immutable_release' });
        }
      }
    }
  });
}

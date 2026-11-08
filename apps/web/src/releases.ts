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

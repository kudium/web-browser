import { randomUUID } from 'node:crypto';
import { connect } from '../src/db';
import { releases } from '../src/schema';
import { releaseSchema, allowedAssets } from '../src/validation';
const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) throw new Error('Usage: bun run release:publish manifest.json (DATABASE_URL required)');
const manifest = releaseSchema.parse(await Bun.file(file).json());
const origins = (process.env.RELEASE_ASSET_ORIGINS ?? '').split(',').map(v => v.trim()).filter(Boolean);
if (!allowedAssets(manifest, origins)) throw new Error('Release download origin is not allowed');
const { db, client } = connect(process.env.DATABASE_URL);
try {
  await db.insert(releases).values({ id: randomUUID(), version: manifest.version, platform: manifest.platform, arch: manifest.arch, channel: manifest.channel, manifest });
  console.log(`Published ${manifest.version} (${manifest.platform}/${manifest.arch}/${manifest.channel})`);
} finally { await client.end(); }

import { z } from 'zod';
import { valid, prerelease } from 'semver';
export const opaqueId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
function base64(max: number, exact?: number) {
  return z.string().max(Math.ceil(max / 3) * 4).refine(value => {
    const bytes = Buffer.from(value, 'base64');
    return bytes.toString('base64') === value && bytes.length <= max && (exact === undefined || bytes.length === exact);
  }, 'Invalid canonical base64');
}
export const envelopeSchema = z.object({ version: z.literal(1), recordId: opaqueId, keyVersion: z.number().int().positive().max(2147483647), nonce: base64(12, 12), ciphertext: base64(8 * 1024 * 1024), tag: base64(16, 16) }).strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export const targetSchema = z.object({ platform: z.enum(['darwin', 'win32', 'linux']), arch: z.enum(['arm64', 'x64']), channel: z.enum(['stable', 'beta']).default('stable') });
export const releaseSchema = targetSchema.extend({
  version: z.string().refine(v => valid(v) === v, 'Canonical semver required'),
  notes: z.string().max(20000).default(''),
  files: z.array(z.object({ url: z.url().refine(v => { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && !u.hash; }), sha512: base64(64, 64), size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict()).min(1).max(10),
}).strict().refine(v => v.channel !== 'stable' || prerelease(v.version) === null, 'Stable releases cannot have prerelease versions');
export type ReleaseManifest = z.infer<typeof releaseSchema>;
export function allowedAssets(manifest: ReleaseManifest, origins: string[]) {
  return manifest.files.every(file => origins.includes(new URL(file.url).origin));
}

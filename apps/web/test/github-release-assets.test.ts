import { describe, expect, test } from 'bun:test';
import { verifyGitHubAssets } from '../src/github-release-assets';
import type { ReleaseManifest } from '../src/validation';
const url = 'https://github.com/kudium/web-browser/releases/download/v1.0.18/Kudium-Browser-1.0.18-arm64.zip';
const manifest: ReleaseManifest = { version: '1.0.18', channel: 'stable', platform: 'darwin', arch: 'arm64', notes: '', files: [{ url, size: 123, sha512: Buffer.alloc(64).toString('base64'), sha256: 'a'.repeat(64) }] };
const remote = (patch = {}) => (async () => Response.json({ draft: false, prerelease: false, assets: [{ browser_download_url: url, size: 123, digest: `sha256:${'a'.repeat(64)}`, state: 'uploaded' }], ...patch }));
describe('GitHub installer verification', () => {
  test('accepts only uploaded assets with matching GitHub size and digest', async () => {
    await verifyGitHubAssets([manifest], remote());
    await expect(verifyGitHubAssets([{ ...manifest, files: [{ ...manifest.files[0], sha256: 'b'.repeat(64) }] }], remote())).rejects.toThrow('unverified_github_artifact');
    await expect(verifyGitHubAssets([manifest], remote({ assets: [] }))).rejects.toThrow('unverified_github_artifact');
  });
  test('rejects private draft downloads and the wrong release channel', async () => {
    await expect(verifyGitHubAssets([manifest], remote({ draft: true }))).rejects.toThrow('channel_mismatch');
    await expect(verifyGitHubAssets([manifest], remote({ prerelease: true }))).rejects.toThrow('channel_mismatch');
  });
  test('rejects another repository, tag, query, or missing digest before fetching', async () => {
    for (const bad of [url.replace('kudium/web-browser', 'other/repository'), url.replace('v1.0.18', 'v1.0.17'), url + '?x=1']) {
      await expect(verifyGitHubAssets([{ ...manifest, files: [{ ...manifest.files[0], url: bad }] }], (() => { throw Error('must not fetch'); }))).rejects.toThrow('invalid_github_asset');
    }
    await expect(verifyGitHubAssets([{ ...manifest, files: [{ url, size: 123, sha512: manifest.files[0].sha512 }] }], remote())).rejects.toThrow('invalid_github_asset');
  });
});

import { HTTPException } from 'hono/http-exception';
import type { ReleaseManifest } from './validation';

export const releaseRepository = 'kudium/web-browser';

// Only our public release assets are accepted; arbitrary remote URLs are never fetched.
export async function verifyGitHubAssets(manifests: ReleaseManifest[], fetchRelease: (url: string, init?: RequestInit) => Promise<Response> = fetch) {
  const github = manifests.flatMap(m => m.files.filter(f => new URL(f.url).origin === 'https://github.com').map(file => ({ manifest: m, file })));
  if (!github.length) return;
  const first = github[0].manifest;
  const prefix = `https://github.com/${releaseRepository}/releases/download/v${first.version}/`;
  for (const { file } of github) {
    const name = file.url.slice(prefix.length);
    if (!file.url.startsWith(prefix) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:zip|dmg|exe|AppImage)$/.test(name) || !file.sha256)
      throw new HTTPException(400, { message: 'invalid_github_asset' });
  }
  const response = await fetchRelease(`https://api.github.com/repos/${releaseRepository}/releases/tags/v${first.version}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Kudium-Release-Verifier' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new HTTPException(400, { message: 'github_release_unavailable' });
  const release = await response.json() as { draft: boolean; prerelease: boolean; assets: { browser_download_url: string; size: number; digest: string; state: string }[] };
  if (release.draft || release.prerelease !== (first.channel === 'beta') || !Array.isArray(release.assets))
    throw new HTTPException(400, { message: 'github_release_channel_mismatch' });
  for (const { file } of github) {
    const asset = release.assets.find(a => a.browser_download_url === file.url);
    if (!asset || asset.state !== 'uploaded' || asset.size !== file.size || asset.digest !== `sha256:${file.sha256}`)
      throw new HTTPException(400, { message: 'unverified_github_artifact' });
  }
}

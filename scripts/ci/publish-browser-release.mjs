import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { validateManifests } from './browser-release-targets.mjs';

const [root, targets = 'all'] = process.argv.slice(2);
const origin = 'https://browser.kudium.com';
const repository = 'kudium/web-browser';
const token = process.env.RELEASE_PUBLISH_TOKEN;
if (!root || !token) throw new Error('Supply artifacts and RELEASE_PUBLISH_TOKEN');
function gh(args, json = false) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`GitHub command failed: ${result.stderr?.trim() || result.error?.message}`);
  return json ? JSON.parse(result.stdout) : result.stdout;
}
gh(['auth', 'status']);
const manifests = [], uploads = [], names = new Set();
for (const entry of await fs.readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(root, entry.name);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const assets = new Map();
  for (const name of await fs.readdir(directory)) {
    if (name === 'manifest.json') continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:zip|dmg|exe|AppImage|blockmap)$/.test(name) || names.has(name))
      throw new Error('Invalid or duplicate release asset name');
    names.add(name);
    const file = path.resolve(directory, name), bytes = await fs.readFile(file);
    const asset = { file, name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sha512: createHash('sha512').update(bytes).digest('base64') };
    assets.set(name, asset); uploads.push(asset);
  }
  manifest.files = manifest.files.map(advertised => {
    const name = path.basename(new URL(advertised.url).pathname), asset = assets.get(name);
    if (!asset || asset.size !== advertised.size || asset.sha512 !== advertised.sha512)
      throw new Error('Artifact checksum differs from retained manifest');
    return { ...advertised, url: `https://github.com/${repository}/releases/download/v${manifest.version}/${name}`, sha256: asset.sha256 };
  });
  manifests.push(manifest);
}
validateManifests(manifests, targets);
const { version, channel, notes } = manifests[0], tag = `v${version}`;
if (process.env.RELEASE_VERSION && process.env.RELEASE_VERSION !== tag) throw new Error('Wrong release tag');
const list = gh(['api', '--paginate', '--slurp', `repos/${repository}/releases`], true).flat();
let release = list.find(r => r.tag_name === tag);
if (!release) {
  const notesFile = path.resolve(root, '../github-release-notes.md');
  await fs.writeFile(notesFile, notes || `Kudium Browser ${version}`);
  gh(['release', 'create', tag, '--repo', repository, '--verify-tag', '--draft', '--title', `Kudium Browser ${version}`, '--notes-file', notesFile, ...(channel === 'beta' ? ['--prerelease'] : [])]);
  release = gh(['api', '--paginate', '--slurp', `repos/${repository}/releases`], true).flat().find(r => r.tag_name === tag);
  if (!release) throw new Error('Created draft release is unavailable');
}
if (release.prerelease !== (channel === 'beta')) throw new Error('Existing GitHub release has the wrong channel');
for (const asset of uploads) {
  const existing = release.assets.find(a => a.name === asset.name);
  if (existing) {
    if (existing.size !== asset.size || existing.digest !== `sha256:${asset.sha256}` || existing.state !== 'uploaded')
      throw new Error(`Immutable GitHub asset differs: ${asset.name}`);
    console.log(`Verified existing GitHub asset: ${asset.name}`);
  } else {
    if (!release.draft) throw new Error('Never add or replace assets in an already published release');
    console.log(`Uploading to GitHub: ${asset.name}`);
    // IPv4 avoids stalled uploads on networks with unreliable IPv6 routing.
    // Feed curl's credentials through stdin, never argv, logs or a repository file.
    const githubToken = gh(['auth', 'token']).trim();
    const upload = spawnSync('curl', ['--ipv4', '--http1.1', '--fail-with-body', '--silent', '--show-error', '--speed-limit', '1024', '--speed-time', '60', '--request', 'POST', '--upload-file', asset.file, '--config', '-', `https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`], {
      encoding: 'utf8', maxBuffer: 1024 * 1024,
      input: `header = ${JSON.stringify(`Authorization: Bearer ${githubToken}`)}\nheader = "Content-Type: application/octet-stream"\n`,
    });
    if (upload.error || upload.status !== 0) throw new Error(`GitHub asset upload failed: ${upload.stderr?.trim() || upload.error?.message}`);
  }
}
release = gh(['api', `repos/${repository}/releases/${release.id}`], true);
for (const asset of uploads) {
  const actual = release.assets.find(a => a.name === asset.name);
  if (!actual || actual.size !== asset.size || actual.digest !== `sha256:${asset.sha256}` || actual.state !== 'uploaded')
    throw new Error(`GitHub checksum verification failed: ${asset.name}`);
}
if (release.draft) gh(['release', 'edit', tag, '--repo', repository, '--draft=false']);
for (const manifest of manifests) for (const asset of manifest.files) {
  const response = await fetch(asset.url, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
  if (!response.ok || Number(response.headers.get('content-length')) !== asset.size)
    throw new Error(`GitHub download not publicly accessible: ${asset.url}`);
}
// Only this small JSON request goes to our server. Existing updater URLs stay unchanged.
for (let attempt = 0; ; attempt++) {
  const response = await fetch(`${origin}/internal/releases/manifests`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(manifests), signal: AbortSignal.timeout(60000),
  });
  if (response.ok) break;
  if (response.status < 500 || attempt === 2) throw new Error(`Installers are on GitHub, but feed registration failed (${response.status}): ${(await response.text()).slice(0,200)}`);
  await delay(1000 * (attempt + 1));
}
for (const manifest of manifests) {
  const name = `${channel === 'stable' ? 'latest' : 'beta'}${manifest.platform === 'darwin' ? '-mac' : manifest.platform === 'linux' ? '-linux' : ''}.yml`;
  const response = await fetch(`${origin}/updates/${channel}/${manifest.platform}/${manifest.arch}/${name}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const feed = await response.text();
  if (!response.ok || !new RegExp(`^version: ['\"]?${version.replaceAll('.', '\\.')}['\"]?\\s*$`, 'm').test(feed) || !manifest.files.every(a => feed.includes(a.url)))
    throw new Error(`Live ${manifest.platform}/${manifest.arch} feed does not match ${version}`);
}
const response = await fetch(`${origin}/v1/releases?channel=${channel}&page=1`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
const history = await response.json();
const live = history.releases?.find(r => r.version === version && r.channel === channel);
if (!response.ok || !live || !manifests.every(m => live.targets.some(t => t.platform === m.platform && t.arch === m.arch && m.files.every(a => t.files.some(f => f.url === a.url)))))
  throw new Error('Live release history does not match published installers');
await fs.writeFile(path.resolve(root, '../publication.json'), JSON.stringify({ version, channel, repository, verifiedAt: new Date().toISOString(), manifests }, null, 2));
console.log(`Published ${version} to ${channel}; verified live feeds and release history.`);

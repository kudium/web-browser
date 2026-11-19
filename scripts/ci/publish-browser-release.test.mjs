import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

test('retry reuses immutable GitHub assets and requires live feeds before success', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'github-release-test-'));
  try {
    const root = path.join(tmp, 'installers'), manifests = [], assets = [];
    for (const arch of ['arm64', 'x64']) {
      const directory = path.join(root, `darwin-${arch}`); fs.mkdirSync(directory, { recursive: true });
      const files = ['zip', 'dmg'].map(ext => {
        const name = `Kudium-Browser-1.0.18-${arch}.${ext}`, bytes = Buffer.from(`${arch}-${ext}`);
        fs.writeFileSync(path.join(directory, name), bytes);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const url = `https://github.com/kudium/web-browser/releases/download/v1.0.18/${name}`;
        assets.push({ name, size: bytes.length, digest: `sha256:${sha256}`, state: 'uploaded' });
        return { url, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64'), sha256 };
      });
      const m = { version: '1.0.18', channel: 'stable', platform: 'darwin', arch, notes: '', files };
      fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(m)); manifests.push(m);
    }
    const fixture = path.join(tmp, 'fixture.json');
    fs.writeFileSync(fixture, JSON.stringify({ manifests, release: { tag_name: 'v1.0.18', draft: false, prerelease: false, assets } }));
    const gh = path.join(tmp, 'gh');
    fs.writeFileSync(gh, `#!${process.execPath}\nconst fs=require('fs');const f=JSON.parse(fs.readFileSync(process.env.FIXTURE));const a=process.argv.slice(2);if(a[0]==='auth')process.exit(0);if(a[0]!=='api')throw Error('must never mutate published release');console.log(JSON.stringify(a.includes('--slurp')?[[f.release]]:f.release));\n`, { mode: 0o755 });
    const preload = path.join(tmp, 'fetch.mjs');
    fs.writeFileSync(preload, `import fs from 'node:fs';const f=JSON.parse(fs.readFileSync(process.env.FIXTURE));globalThis.fetch=async(url,init={})=>{if(init.method==='HEAD'){const a=f.manifests.flatMap(m=>m.files).find(a=>a.url===url);return new Response(null,{headers:{'content-length':String(a.size)}});}if(init.method==='POST'){fs.writeFileSync(process.env.POSTED,init.body);return Response.json({published:true});}if(url.includes('/updates/')){const m=f.manifests.find(m=>url.includes('/'+m.arch+'/'));return new Response('version: '+(process.env.BAD_FEED?'1.0.17':m.version)+'\\n'+m.files.map(a=>a.url).join('\\n'));}return Response.json({releases:[{version:'1.0.18',channel:'stable',targets:f.manifests}]});};`);
    const run = extra => spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, new URL('./publish-browser-release.mjs', import.meta.url).pathname, root, 'macos'], { encoding: 'utf8', env: { ...process.env, PATH: `${tmp}:${process.env.PATH}`, FIXTURE: fixture, POSTED: path.join(tmp, 'posted.json'), RELEASE_PUBLISH_TOKEN: 'test', ...extra } });
    const success = run({}); assert.equal(success.status, 0, success.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'publication.json'))).version, '1.0.18');
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'posted.json')))[0].files[0].sha256, manifests[0].files[0].sha256);
    const stale = run({ BAD_FEED: '1' }); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /feed does not match/);
    assets[0].digest = 'sha256:wrong'; fs.writeFileSync(fixture, JSON.stringify({ manifests, release: { tag_name: 'v1.0.18', draft: false, prerelease: false, assets } }));
    const corrupt = run({}); assert.notEqual(corrupt.status, 0); assert.match(corrupt.stderr, /Immutable GitHub asset differs/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
